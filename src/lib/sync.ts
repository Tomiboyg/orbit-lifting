/**
 * Outbox sync: idempotent upserts keyed by client-generated UUIDs (spec 11.5).
 * One entry per workout holding the latest snapshot; retried with backoff.
 * The local copy is never discarded because of sync — deleting the local
 * active workout happens only after the server confirms (spec 11.5).
 */

import type { ActiveWorkout, LoggedExercise, LoggedSet, SetType } from '../types'
import { getSupabase } from './supabase'
import { outboxAll, outboxPut, outboxDelete, kvGet, KV_ACTIVE_WORKOUT } from './idb'
import { deviceId } from './uuid'

export interface OutboxEntryWithPayload {
  id: string
  kind: 'workout-sync'
  createdAt: number
  attempts: number
  lastAttempt?: number
  payload: WorkoutSnapshot
}

export interface WorkoutSnapshot {
  workout: {
    id: string
    user_id: string
    device_id: string | null
    title: string | null
    notes: string | null
    started_at: string
    finished_at: string | null
    updated_at: string
  }
  exercises: Array<{
    id: string
    user_id: string
    workout_id: string
    exercise_id: string | null
    name: string
    position: number
    notes: string | null
  }>
  sets: Array<{
    id: string
    user_id: string
    workout_id: string
    workout_exercise_id: string
    exercise_id: string | null
    weight: number | null
    reps: number | null
    rpe: number | null
    set_type: SetType
    completed: boolean
    performed_at: string | null
  }>
}

function iso(ts: number | null | undefined): string | null {
  return ts ? new Date(ts).toISOString() : null
}

export function buildSnapshot(w: ActiveWorkout, userId: string): WorkoutSnapshot {
  const user = userId
  const exercises: WorkoutSnapshot['exercises'] = []
  const sets: WorkoutSnapshot['sets'] = []
  for (const ex of w.exercises as LoggedExercise[]) {
    exercises.push({
      id: ex.id,
      user_id: user,
      workout_id: w.id,
      exercise_id: ex.exerciseId,
      name: ex.name,
      position: ex.position,
      notes: ex.notes || null,
    })
    for (const s of ex.sets as LoggedSet[]) {
      sets.push({
        id: s.id,
        user_id: user,
        workout_id: w.id,
        workout_exercise_id: ex.id,
        exercise_id: ex.exerciseId,
        weight: s.weight === '' ? null : Number(s.weight),
        reps: s.reps === '' ? null : Number(s.reps),
        rpe: s.rpe === '' ? null : Number(s.rpe),
        set_type: s.setType,
        completed: s.completed,
        performed_at: iso(s.performedAt),
      })
    }
  }
  return {
    workout: {
      id: w.id,
      user_id: user,
      device_id: deviceId(),
      title: w.title || null,
      notes: w.notes || null,
      started_at: new Date(w.startedAt).toISOString(),
      finished_at: iso(w.finishedAt),
      updated_at: new Date(w.updatedAt).toISOString(),
    },
    exercises,
    sets,
  }
}

/** Replace (or create) the outbox entry for this workout with the latest snapshot. */
export async function enqueueWorkoutSync(w: ActiveWorkout, userId: string): Promise<void> {
  const existing = (await outboxAll()).find((e) => e.id === w.id)
  await outboxPut({
    id: w.id,
    kind: 'workout-sync',
    createdAt: existing?.createdAt ?? Date.now(),
    attempts: existing?.attempts ?? 0,
    lastAttempt: undefined, // retry as soon as possible on fresh data
    payload: buildSnapshot(w, userId),
  })
}

function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000, 2 ** Math.min(attempts, 7) * 1_000)
}

export interface SyncResult {
  ok: number
  skipped: number
  failed: number
}

export async function processOutbox(): Promise<SyncResult> {
  const supabase = getSupabase()
  if (!supabase) return { ok: 0, skipped: 0, failed: 0 }
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user?.id
  if (!userId) {
    // Not signed in: local data is preserved; sync happens after sign-in.
    return { ok: 0, skipped: (await outboxAll()).length, failed: 0 }
  }

  const entries = await outboxAll()
  let ok = 0
  let failed = 0

  for (const entry of entries) {
    const snapshot = entry.payload as WorkoutSnapshot | undefined
    if (!snapshot) {
      await outboxDelete(entry.id)
      continue
    }
    // Retry with backoff when the connection returns (spec 11.5).
    if (entry.lastAttempt && Date.now() - entry.lastAttempt < backoffMs(entry.attempts)) {
      failed += 1
      continue
    }
    try {
      const db = supabase
      const w = { ...snapshot.workout, user_id: userId }
      const exercises = snapshot.exercises.map((e) => ({ ...e, user_id: userId }))
      const sets = snapshot.sets.map((s) => ({ ...s, user_id: userId }))

      // Idempotent upserts keyed by client-generated primary keys.
      const { error: we } = await db.from('workouts').upsert(w)
      if (we) throw we
      if (exercises.length > 0) {
        const { error: ee } = await db.from('workout_exercises').upsert(exercises)
        if (ee) throw ee
      }
      if (sets.length > 0) {
        const { error: se } = await db.from('sets').upsert(sets)
        if (se) throw se
      }
      await outboxDelete(entry.id)
      ok += 1
    } catch {
      const next = await outboxAll()
      const cur = next.find((e) => e.id === entry.id)
      if (cur) {
        await outboxPut({
          ...cur,
          attempts: cur.attempts + 1,
          lastAttempt: Date.now(),
        })
      }
      failed += 1
    }
  }

  // Skipped = entries not attempted (e.g. signed-out sessions return early).
  return { ok, skipped: Math.max(0, entries.length - ok - failed), failed }
}

/** True when the server has a synced copy of this workout (no pending outbox entry). */
export async function isWorkoutSynced(workoutId: string): Promise<boolean> {
  const entries = await outboxAll()
  return !entries.some((e) => e.id === workoutId)
}

/** Read the local active workout (source of truth is local, spec 11.5). */
export async function loadActiveWorkout(): Promise<ActiveWorkout | null> {
  return (await kvGet<ActiveWorkout>(KV_ACTIVE_WORKOUT)) ?? null
}
