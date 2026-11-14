/**
 * Active workout store.
 * Source of truth is IndexedDB, not React state (spec 11.5). Every mutation
 * writes a complete record atomically; typing is debounced by 250 ms, and
 * writes flush immediately on visibilitychange / pagehide.
 */

import { create } from 'zustand'
import type { ActiveWorkout, LoggedExercise, LoggedSet, SetType } from '../types'
import {
  kvGet,
  kvSet,
  kvDelete,
  KV_ACTIVE_WORKOUT,
  outboxAll,
  outboxDelete,
  requestPersistentStorage,
} from '../lib/idb'
import { uuid, deviceId } from '../lib/uuid'
import { enqueueWorkoutSync, isWorkoutSynced, processOutbox } from '../lib/sync'
import { getSupabase } from '../lib/supabase'

const PERSIST_DEBOUNCE_MS = 250

const PENDING_DISCARDS_KEY = 'orbit.pendingDiscards'

function loadPendingDiscards(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_DISCARDS_KEY)
    const ids = raw ? (JSON.parse(raw) as string[]) : []
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

function savePendingDiscards(ids: string[]): void {
  try {
    localStorage.setItem(PENDING_DISCARDS_KEY, JSON.stringify(ids))
  } catch {
    // ignore
  }
}

/**
 * Delete the server copies of discarded workouts (cascades remove their
 * exercises and sets). Failures stay queued in localStorage and retry on the
 * next hydrate or reconnect, so a discarded workout never lingers as a
 * permanently "active" row on the server.
 */
export async function purgeDiscardedWorkouts(): Promise<void> {
  const ids = loadPendingDiscards()
  if (ids.length === 0) return
  const supabase = getSupabase()
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user?.id
  if (!userId) return
  const { error } = await supabase
    .from('workouts')
    .delete()
    .in('id', ids)
    .eq('user_id', userId)
  if (error) return
  savePendingDiscards([])
}

export interface DeletedSetInfo {
  exerciseId: string
  set: LoggedSet
  index: number
}

interface WorkoutState {
  workout: ActiveWorkout | null
  hydrated: boolean
  lastDeleted: DeletedSetInfo | null
  syncStatus: 'idle' | 'syncing' | 'queued' | 'error'

  hydrate(): Promise<void>
  startWorkout(title?: string): Promise<void>
  addExercise(def: { exerciseId: string | null; name: string; prefill?: Partial<LoggedSet> }): void
  removeExercise(exerciseId: string): void
  reorderExercise(exerciseId: string, dir: -1 | 1): void
  setCurrentExercise(index: number): void
  addSet(exerciseId: string, setType: SetType, prefill?: Partial<LoggedSet>): void
  updateDraft(
    exerciseId: string,
    setId: string,
    patch: Partial<Pick<LoggedSet, 'weight' | 'reps' | 'rpe' | 'setType'>>,
  ): void
  confirmSet(exerciseId: string, setId: string, restSec: number | null): void
  deleteSet(exerciseId: string, setId: string): void
  undoDeleteSet(): void
  startRest(seconds: number): void
  extendRest(seconds: number): void
  clearRest(): void
  setWorkoutNotes(notes: string): void
  setExerciseNotes(exerciseId: string, notes: string): void
  /** Returns true when the server confirmed the finished workout. */
  finishWorkout(): Promise<boolean>
  retrySync(): Promise<boolean>
  discardWorkout(): Promise<void>
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
let flushListenersAttached = false

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void persistNow()
  }, PERSIST_DEBOUNCE_MS)
}

/** Write the full record in one atomic transaction. */
export async function persistNow(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  const w = useWorkout.getState().workout
  try {
    if (w) await kvSet(KV_ACTIVE_WORKOUT, w)
  } catch {
    // Storage write failure: the app keeps running from memory.
  }
}

function attachFlushListeners(): void {
  if (flushListenersAttached || typeof document === 'undefined') return
  flushListenersAttached = true
  // These are the last reliable events before iOS suspends/kills the page;
  // beforeunload must not be the only mechanism (spec 11.5).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persistNow()
  })
  window.addEventListener('pagehide', () => {
    void persistNow()
  })
  window.addEventListener('online', () => {
    void useWorkout.getState().retrySync()
    void purgeDiscardedWorkouts()
  })
}

function emptySet(prefill?: Partial<LoggedSet>): LoggedSet {
  return {
    id: uuid(),
    weight: prefill?.weight ?? '',
    reps: prefill?.reps ?? '',
    rpe: prefill?.rpe ?? '',
    setType: prefill?.setType ?? 'working',
    completed: false,
  }
}

function mapExercise(
  def: { exerciseId: string | null; name: string },
  position: number,
  prefill?: Partial<LoggedSet>,
): LoggedExercise {
  return {
    id: uuid(),
    exerciseId: def.exerciseId,
    name: def.name,
    position,
    notes: '',
    sets: [emptySet(prefill)],
  }
}

export const useWorkout = create<WorkoutState>()((set, get) => {
  /** Clone the active workout, apply a recipe, persist, optionally re-enqueue. */
  function mutate(
    recipe: (w: ActiveWorkout) => boolean | void,
    options: { enqueue?: boolean } = {},
  ): void {
    const w = get().workout
    if (!w) return
    const clone: ActiveWorkout = structuredClone(w)
    const changed = recipe(clone) !== false
    if (!changed) return
    clone.updatedAt = Date.now()
    set({ workout: clone })
    schedulePersist()
    if (options.enqueue) {
      void (async () => {
        const supabase = getSupabase()
        const userId = (await supabase?.auth.getUser())?.data.user?.id
        // Guard against a discard that happened while awaiting auth: never
        // enqueue a snapshot for a workout that is no longer active, or the
        // outbox flush would resurrect it on the server.
        if (supabase && userId && get().workout?.id === clone.id) {
          await enqueueWorkoutSync(clone, userId)
          set({ syncStatus: 'queued' })
        }
      })()
    }
  }

  async function tryFinishSync(): Promise<boolean> {
    set({ syncStatus: 'syncing' })
    const res = await processOutbox()
    // Success only when everything synced: no failures AND nothing left
    // waiting (e.g. because the user is signed out).
    if (res.failed === 0 && res.skipped === 0) {
      set({ syncStatus: 'idle' })
      return true
    }
    set({ syncStatus: 'error' })
    return false
  }

  return {
    workout: null,
    hydrated: false,
    lastDeleted: null,
    syncStatus: 'idle',

    async hydrate() {
      if (get().hydrated) return
      attachFlushListeners()
      let w: ActiveWorkout | null = null
      try {
        w = (await kvGet<ActiveWorkout>(KV_ACTIVE_WORKOUT)) ?? null
      } catch {
        w = null
      }
      if (w) {
        // Timers recompute from timestamps at render time (spec 11.5).
        // A finished-but-unsynced workout is kept and surfaced in the UI.
        const synced = await isWorkoutSynced(w.id)
        if (w.finishedAt && synced) {
          // Server already confirmed; clear the stale local copy.
          await kvDelete(KV_ACTIVE_WORKOUT)
          w = null
        }
      }
      set({ workout: w, hydrated: true })
      void processOutbox().then((res) => {
        if (res.failed > 0) set({ syncStatus: 'error' })
      })
      void purgeDiscardedWorkouts()
    },

    async startWorkout(title) {
      const w: ActiveWorkout = {
        id: uuid(),
        startedAt: Date.now(),
        title: title ?? 'Workout',
        notes: '',
        routineId: null,
        exercises: [],
        currentExerciseIndex: 0,
        restTimer: null,
        finishedAt: null,
        updatedAt: Date.now(),
      }
      set({ workout: w, lastDeleted: null, syncStatus: 'idle' })
      try {
        await kvSet(KV_ACTIVE_WORKOUT, w)
      } catch {
        // ignore; scheduled persist will retry
      }
      void requestPersistentStorage()
      void persistNow()
    },

    addExercise(def) {
      mutate((w) => {
        const ex = mapExercise(def, w.exercises.length, def.prefill)
        w.exercises.push(ex)
        w.currentExerciseIndex = w.exercises.length - 1
        return true
      }, { enqueue: true })
    },

    removeExercise(exerciseId) {
      mutate((w) => {
        const idx = w.exercises.findIndex((e) => e.id === exerciseId)
        if (idx === -1) return false
        w.exercises.splice(idx, 1)
        w.exercises.forEach((e, i) => (e.position = i))
        w.currentExerciseIndex = Math.min(w.currentExerciseIndex, Math.max(0, w.exercises.length - 1))
        return true
      }, { enqueue: true })
    },

    reorderExercise(exerciseId, dir) {
      mutate((w) => {
        const idx = w.exercises.findIndex((e) => e.id === exerciseId)
        const target = idx + dir
        if (idx === -1 || target < 0 || target >= w.exercises.length) return false
        const [ex] = w.exercises.splice(idx, 1)
        w.exercises.splice(target, 0, ex)
        w.exercises.forEach((e, i) => (e.position = i))
        w.currentExerciseIndex = target
        return true
      }, { enqueue: true })
    },

    setCurrentExercise(index) {
      mutate((w) => {
        w.currentExerciseIndex = Math.max(0, Math.min(index, w.exercises.length - 1))
        return true
      })
    },

    addSet(exerciseId, setType, prefill) {
      mutate((w) => {
        const ex = w.exercises.find((e) => e.id === exerciseId)
        if (!ex) return false
        ex.sets.push(emptySet({ ...prefill, setType }))
        return true
      }, { enqueue: true })
    },

    updateDraft(exerciseId, setId, patch) {
      mutate((w) => {
        const ex = w.exercises.find((e) => e.id === exerciseId)
        const s = ex?.sets.find((x) => x.id === setId)
        if (!s) return false
        Object.assign(s, patch)
        return true // typed drafts persist too (spec 11.5)
      })
    },

    confirmSet(exerciseId, setId, restSec) {
      mutate((w) => {
        const ex = w.exercises.find((e) => e.id === exerciseId)
        const idx = ex?.sets.findIndex((x) => x.id === setId) ?? -1
        if (!ex || idx === -1) return false
        const s = ex.sets[idx]
        s.completed = true
        s.performedAt = Date.now()
        // Keep the flow at 2 taps: immediately prepare the next prefilled draft.
        const isLastUnconfirmed = !ex.sets.some((x, i) => i > idx && !x.completed)
        if (isLastUnconfirmed) {
          ex.sets.push(
            emptySet({ weight: s.weight, reps: s.reps, rpe: s.rpe, setType: s.setType }),
          )
        }
        if (restSec && s.setType === 'working') {
          w.restTimer = { endsAt: Date.now() + restSec * 1000, durationSec: restSec, startedAt: Date.now() }
        }
        return true
      }, { enqueue: true })
    },

    deleteSet(exerciseId, setId) {
      mutate((w) => {
        const ex = w.exercises.find((e) => e.id === exerciseId)
        const idx = ex?.sets.findIndex((x) => x.id === setId) ?? -1
        if (!ex || idx === -1) return false
        const [removed] = ex.sets.splice(idx, 1)
        set({ lastDeleted: { exerciseId, set: removed, index: idx } })
        // If that leaves no draft row, restore one so the next set is ready.
        if (!ex.sets.some((x) => !x.completed)) {
          const last = [...ex.sets].reverse().find((x) => x.completed)
          ex.sets.push(
            emptySet(
              last
                ? { weight: last.weight, reps: last.reps, rpe: last.rpe, setType: last.setType }
                : undefined,
            ),
          )
        }
        return true
      }, { enqueue: true })
    },

    undoDeleteSet() {
      const info = get().lastDeleted
      if (!info) return
      set({ lastDeleted: null })
      mutate((w) => {
        const ex = w.exercises.find((e) => e.id === info.exerciseId)
        if (!ex) return false
        ex.sets.splice(Math.min(info.index, ex.sets.length), 0, info.set)
        return true
      }, { enqueue: true })
    },

    startRest(seconds) {
      mutate((w) => {
        w.restTimer = { endsAt: Date.now() + seconds * 1000, durationSec: seconds, startedAt: Date.now() }
        return true
      })
    },

    extendRest(seconds) {
      mutate((w) => {
        if (!w.restTimer) return false
        w.restTimer.endsAt = Math.max(Date.now(), w.restTimer.endsAt) + seconds * 1000
        w.restTimer.durationSec += seconds
        return true
      })
    },

    clearRest() {
      mutate((w) => {
        w.restTimer = null
        return true
      })
    },

    setWorkoutNotes(notes) {
      mutate((w) => {
        w.notes = notes
        return true
      })
    },

    setExerciseNotes(exerciseId, notes) {
      mutate((w) => {
        const ex = w.exercises.find((e) => e.id === exerciseId)
        if (!ex) return false
        ex.notes = notes
        return true
      })
    },

    async finishWorkout() {
      mutate((w) => {
        w.finishedAt = Date.now()
        w.restTimer = null
        return true
      })
      // Flush the final state immediately.
      await persistNow()
      // Always enqueue the final snapshot so a signed-out finish cannot lose
      // data: processOutbox keeps the entry queued until a session exists,
      // and the real user_id is stamped in at sync time.
      const cur = get().workout
      if (cur) {
        const supabase = getSupabase()
        const userId = supabase ? (await supabase.auth.getUser()).data.user?.id : undefined
        await enqueueWorkoutSync(cur, userId ?? 'pending-session')
      }
      const ok = await tryFinishSync()
      if (ok) {
        // Delete the local active workout only after server confirmation.
        try {
          await kvDelete(KV_ACTIVE_WORKOUT)
        } catch {
          // ignore
        }
        set({ workout: null, lastDeleted: null })
      }
      return ok
    },

    async retrySync() {
      if (!get().workout) return true
      return tryFinishSync()
    },

    async discardWorkout() {
      const w = get().workout
      set({ workout: null, lastDeleted: null })
      if (!w) return
      try {
        await kvDelete(KV_ACTIVE_WORKOUT)
      } catch {
        // ignore
      }
      // A discard is an explicit delete: drop the queued sync for this
      // workout, otherwise a later outbox flush would re-create an active
      // copy on the server after the local one is gone.
      try {
        await outboxDelete(w.id)
      } catch {
        // ignore
      }
      // Remove the server copy too — otherwise the workout stays "active"
      // there forever even though it was deleted here. Cascades clean up its
      // exercises and sets; a no-op when it was never synced. Offline
      // failures stay queued and retry on the next hydrate/reconnect.
      try {
        savePendingDiscards([...new Set([...loadPendingDiscards(), w.id])])
        await purgeDiscardedWorkouts()
      } catch {
        // ignore; retried later
      }
    },
  }
})

/** Auto-clear a finished+synced copy on restore (used by hydrate edge cases). */
export async function clearIfSyncedFinished(): Promise<void> {
  const w = useWorkout.getState().workout
  if (w?.finishedAt && (await isWorkoutSynced(w.id))) {
    await kvDelete(KV_ACTIVE_WORKOUT)
    useWorkout.setState({ workout: null })
  }
}

/** Snapshot of active workout ids per device for the cross-device prompt. */
export function localDeviceId(): string {
  return deviceId()
}

export async function pendingOutboxCount(): Promise<number> {
  return (await outboxAll()).length
}
