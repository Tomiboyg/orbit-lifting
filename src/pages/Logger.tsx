import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Modal,
  Segmented,
  Sheet,
  StepperInput,
  TextInput,
  cn,
  useToasts,
} from '../components/ui'
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconTimer,
  IconX,
  IconCheck,
} from '../components/icons'
import { useWorkout } from '../store/workout'
import { useSettings } from '../store/settings'
import { useRestTimer, useWakeLock } from '../hooks/useRestTimer'
import { formatDuration } from '../lib/time'
import { fetchExerciseLibrary, fetchSetsSince } from '../lib/history'
import { FALLBACK_EXERCISES } from '../lib/exercises'
import type { ExerciseDef, LoggedSet, SetType } from '../types'

const STALE_MS = 24 * 60 * 60 * 1000

export function Logger() {
  const navigate = useNavigate()
  const workout = useWorkout((s) => s.workout)
  const hydrated = useWorkout((s) => s.hydrated)
  const syncStatus = useWorkout((s) => s.syncStatus)
  const lastDeleted = useWorkout((s) => s.lastDeleted)
  const undoDeleteSet = useWorkout((s) => s.undoDeleteSet)
  const startWorkout = useWorkout((s) => s.startWorkout)
  const finishWorkout = useWorkout((s) => s.finishWorkout)
  const discardWorkout = useWorkout((s) => s.discardWorkout)
  const retrySync = useWorkout((s) => s.retrySync)
  const { restTimer, finished, display } = useRestTimer()
  const push = useToasts((s) => s.push)
  const clearRest = useWorkout((s) => s.clearRest)
  const extendRest = useWorkout((s) => s.extendRest)

  const [elapsed, setElapsed] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [stalePrompt, setStalePrompt] = useState(false)
  const [library, setLibrary] = useState<ExerciseDef[]>(FALLBACK_EXERCISES)
  const [recentSets, setRecentSets] = useState<Awaited<ReturnType<typeof fetchSetsSince>>>([])

  useWakeLock(hydrated && !!workout && !workout.finishedAt)

  // No active workout here → offer to start one (keeps /log useful offline).
  useEffect(() => {
    if (hydrated && !workout) void startWorkout()
  }, [hydrated, workout, startWorkout])

  // Elapsed time derives from the start timestamp, never a counter (spec 11.5).
  useEffect(() => {
    if (!workout) return
    const tick = () => setElapsed(Date.now() - workout.startedAt)
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [workout?.startedAt, workout?.finishedAt])

  // Stale workout prompt (>24h) — never deleted automatically (spec 11.5).
  useEffect(() => {
    if (workout && !workout.finishedAt && Date.now() - workout.startedAt > STALE_MS) {
      setStalePrompt(true)
    }
  }, [workout?.startedAt, workout?.finishedAt])

  // Rest finished while away → show as finished once, then clear quietly.
  useEffect(() => {
    if (finished) {
      const id = window.setTimeout(() => clearRest(), 4000)
      return () => window.clearTimeout(id)
    }
  }, [finished, restTimer?.endsAt, clearRest])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rows = await fetchExerciseLibrary()
      if (!cancelled && rows.length > 0) {
        setLibrary(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            category: r.category,
            primary: r.primary_muscles ?? [],
            secondary: r.secondary_muscles ?? [],
            secondaryWeight: r.secondary_weight ?? 0.5,
            isCustom: false,
          })),
        )
      }
      const since = await fetchSetsSince(Date.now() - 90 * 86400000)
      if (!cancelled) setRecentSets(since)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const exIndex = workout?.currentExerciseIndex ?? 0
  const current = workout?.exercises[exIndex]

  const prefillFor = useMemo(() => {
    const map = new Map<string, { weight: string; reps: string }>()
    for (const s of recentSets) {
      const key = s.exerciseId ?? s.exerciseName
      if (!map.has(key)) map.set(key, { weight: String(s.weight), reps: String(s.reps) })
    }
    return (exerciseId: string | null, name: string) =>
      map.get(exerciseId ?? name) ?? { weight: '', reps: '' }
  }, [recentSets])

  if (!hydrated) {
    return <div className="min-h-dvh" />
  }

  if (!workout) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <Button variant="primary" size="lg" onClick={() => void startWorkout().then(() => undefined)}>
          <IconPlus width={18} height={18} /> Start workout
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-solid-surface">
      {/* Header — the only glassy frame area (spec 14.6). */}
      <header className="glass flex items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <button
          aria-label="Minimize workout"
          className="press flex h-11 w-11 items-center justify-center rounded-full text-text-muted"
          onClick={() => navigate('/')}
        >
          <IconChevronLeft />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-caption text-text-muted">
            {workout.exercises.length > 0
              ? `${exIndex + 1} / ${workout.exercises.length} · ${current?.name ?? ''}`
              : 'Add your first exercise'}
          </p>
          <p className="text-headline font-semibold tabular">{formatDuration(elapsed)}</p>
        </div>
        <button
          aria-label="Close and discard later"
          className="press flex h-11 w-11 items-center justify-center rounded-full text-text-muted"
          onClick={() => navigate('/')}
        >
          <IconX />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+110px)] pt-3">
        {workout.finishedAt && (
          <Card className="mb-3 p-4">
            <p className="text-headline font-semibold">Workout finished</p>
            <p className="mt-1 text-caption text-text-muted">
              {syncStatus === 'error' || syncStatus === 'queued'
                ? 'Not synced yet — it stays safely on this device until the connection returns.'
                : 'Syncing…'}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="primary"
                onClick={async () => {
                  const ok = await retrySync()
                  if (ok) {
                    push('Workout saved')
                    navigate('/')
                  } else {
                    push('Still offline — workout stays queued')
                  }
                }}
              >
                Retry sync
              </Button>
              <Button variant="ghost" onClick={() => navigate('/')}>
                Back home
              </Button>
            </div>
          </Card>
        )}

        {/* Rest timer: the largest element on screen while active (spec 14.6). */}
        {restTimer && (
          <Card elevated className="mb-3 p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-caption text-text-muted">
              <IconTimer width={16} height={16} />
              Rest {finished ? 'complete' : 'timer'}
            </div>
            <p className={cn('my-1 text-[44px] font-bold leading-none tabular', finished ? 'text-accent' : '')}>
              {finished ? "Done — next set" : display}
            </p>
            <div className="mt-2 flex justify-center gap-2">
              <Button size="sm" onClick={() => extendRest(30)}>
                +30s
              </Button>
              <Button size="sm" onClick={() => clearRest()}>
                Skip
              </Button>
            </div>
          </Card>
        )}

        {current ? (
          <Card elevated className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-headline font-semibold">{current.name}</h2>
              <div className="flex gap-1">
                <button
                  aria-label="Previous exercise"
                  disabled={exIndex === 0}
                  className="press flex h-9 w-9 items-center justify-center rounded-full glass text-text-muted disabled:opacity-40"
                  onClick={() => useWorkout.getState().setCurrentExercise(exIndex - 1)}
                >
                  <IconChevronLeft width={16} height={16} />
                </button>
                <button
                  aria-label="Next exercise"
                  disabled={exIndex >= workout.exercises.length - 1}
                  className="press flex h-9 w-9 items-center justify-center rounded-full glass text-text-muted disabled:opacity-40"
                  onClick={() => useWorkout.getState().setCurrentExercise(exIndex + 1)}
                >
                  <IconChevronRight width={16} height={16} />
                </button>
              </div>
            </div>

            <SetList exercise={current} prefillFor={prefillFor} />

            <Button
              className="mt-3 w-full"
              onClick={() =>
                useWorkout.getState().addSet(current.id, 'working', prefillFor(current.exerciseId, current.name))
              }
            >
              <IconPlus width={16} height={16} /> Add set
            </Button>

            <label className="mt-3 block text-caption text-text-muted">
              Exercise notes
              <textarea
                className="mt-1 w-full rounded-control solid px-3 py-2 text-body outline-none"
                rows={2}
                value={current.notes}
                onChange={(e) => useWorkout.getState().setExerciseNotes(current.id, e.target.value)}
              />
            </label>
          </Card>
        ) : (
          <Card className="p-6 text-center">
            <p className="text-headline font-semibold">Empty workout</p>
            <p className="mt-1 text-caption text-text-muted">Add an exercise to begin. Nothing is lost if the app closes.</p>
          </Card>
        )}

        <label className="mt-3 block text-caption text-text-muted">
          Workout notes
          <textarea
            className="mt-1 w-full rounded-control solid px-3 py-2 text-body outline-none"
            rows={2}
            placeholder="How did it feel?"
            value={workout.notes}
            onChange={(e) => useWorkout.getState().setWorkoutNotes(e.target.value)}
          />
        </label>
        {/pain|hurt|injur|sharp|ache/i.test(workout.notes) && (
          <p className="mt-1 rounded-control bg-accent-soft px-3 py-2 text-caption">
            Notes can mention pain or injury, but the app never interprets them. If something
            hurts, consider consulting a qualified professional.
          </p>
        )}
      </div>

      {/* Sticky action controls above the safe area (spec 11.1). */}
      <div className="absolute inset-x-0 bottom-0 border-t border-glass-border bg-solid-surface-2 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <Button onClick={() => setSheetOpen(true)}>
            <IconPlus width={16} height={16} /> Exercise
          </Button>
          <Button variant="ghost" onClick={() => setDiscardOpen(true)}>
            Discard
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={workout.finishedAt != null || workout.exercises.length === 0}
            onClick={async () => {
              const ok = await finishWorkout()
              if (ok) {
                push('Workout saved')
                navigate('/')
              } else {
                push('Offline — workout is saved locally and will sync')
              }
            }}
          >
            {workout.finishedAt ? 'Syncing…' : 'Finish'}
          </Button>
        </div>
      </div>

      {/* Undo deleted set (spec 11.1). */}
      {lastDeleted && !workout.finishedAt && (
        <UndoToast onUndo={() => undoDeleteSet()} />
      )}

      <AddExerciseSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        library={library}
        onPick={(def) => {
          useWorkout.getState().addExercise({
            exerciseId: def.id,
            name: def.name,
            prefill: {
              weight: prefillFor(def.id, def.name).weight,
              reps: prefillFor(def.id, def.name).reps,
              setType: 'working',
            },
          })
          setSheetOpen(false)
        }}
      />

      <Modal open={discardOpen} onClose={() => setDiscardOpen(false)} title="Discard workout?">
        <p className="text-body text-text-muted">
          This deletes the active workout from this device. Closing the app never discards it — this is explicit.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setDiscardOpen(false)}>Keep</Button>
          <Button
            variant="danger"
            onClick={async () => {
              await discardWorkout()
              setDiscardOpen(false)
              navigate('/')
            }}
          >
            Discard workout
          </Button>
        </div>
      </Modal>

      <Modal open={stalePrompt} onClose={() => setStalePrompt(false)} title="Resume or finish this workout?">
        <p className="text-body text-text-muted">
          This workout has been open for more than 24 hours. Nothing is deleted automatically.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setStalePrompt(false)}>Resume</Button>
          <Button
            variant="primary"
            onClick={async () => {
              setStalePrompt(false)
              const ok = await finishWorkout()
              if (ok) {
                push('Workout saved')
                navigate('/')
              }
            }}
          >
            Finish now
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function UndoToast({ onUndo }: { onUndo: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[96px] z-40 flex justify-center px-4">
      <div className="glass-raised pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2 shadow-glass-raised">
        <span className="text-caption">Set deleted</span>
        <button className="press text-caption font-semibold text-accent" onClick={onUndo}>
          Undo
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- Set rows */

const SET_TYPES: Array<{ value: SetType; label: string }> = [
  { value: 'warm-up', label: 'Warm' },
  { value: 'working', label: 'Work' },
  { value: 'drop', label: 'Drop' },
  { value: 'failure', label: 'Fail' },
]

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => ({ value: v, label: String(v) }))

function SetList({
  exercise,
  prefillFor,
}: {
  exercise: { id: string; sets: LoggedSet[]; exerciseId: string | null; name: string }
  prefillFor: (exerciseId: string | null, name: string) => { weight: string; reps: string }
}) {
  return (
    <ul className="flex flex-col gap-2">
      {exercise.sets.map((s, i) => (
        <li key={s.id}>
          <SetRow
            index={i + 1}
            set={s}
            exercise={exercise}
            prefill={prefillFor(exercise.exerciseId, exercise.name)}
          />
        </li>
      ))}
    </ul>
  )
}

function SetRow({
  index,
  set,
  exercise,
  prefill,
}: {
  index: number
  set: LoggedSet
  exercise: { id: string; exerciseId: string | null; name: string }
  prefill: { weight: string; reps: string }
}) {
  const update = (patch: Partial<Pick<LoggedSet, 'weight' | 'reps' | 'rpe' | 'setType'>>) =>
    useWorkout.getState().updateDraft(exercise.id, set.id, patch)
  const confirm = () => {
    try {
      navigator.vibrate?.(10)
    } catch {
      // Haptics unsupported — fine.
    }
    useWorkout.getState().confirmSet(exercise.id, set.id, useSettings.getState().defaultRestSec)
  }
  const remove = () => useWorkout.getState().deleteSet(exercise.id, set.id)

  if (set.completed) {
    return (
      <div className="flex items-center gap-2 rounded-control solid px-3 py-2.5">
        <span className="w-5 text-caption text-text-muted tabular">{index}</span>
        <span className="w-14 text-caption text-text-muted">{shortType(set.setType)}</span>
        <span className="flex-1 text-body font-semibold tabular">
          {set.weight !== '' ? `${set.weight}` : '—'}
          <span className="text-caption font-normal text-text-muted"> kg</span>
          <span className="mx-1 text-text-muted">×</span>
          {set.reps !== '' ? set.reps : '—'}
          <span className="text-caption font-normal text-text-muted"> reps</span>
        </span>
        {set.rpe !== '' && <span className="text-caption text-text-muted tabular">RPE {set.rpe}</span>}
        <button
          aria-label="Delete set"
          className="press flex h-9 w-9 items-center justify-center rounded-full text-text-muted"
          onClick={remove}
        >
          <IconTrash width={16} height={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-control solid p-2.5">
      <div className="flex items-center gap-2">
        <span className="w-5 text-caption text-text-muted tabular">{index}</span>
        <Segmented
          size="sm"
          ariaLabel="Set type"
          options={SET_TYPES}
          value={set.setType}
          onChange={(v) => update({ setType: v })}
        />
        <button
          aria-label="Delete set"
          className="press ml-auto flex h-9 w-9 items-center justify-center rounded-full text-text-muted"
          onClick={remove}
        >
          <IconTrash width={16} height={16} />
        </button>
      </div>
      <div className="mt-2 flex items-end justify-center gap-3">
        <StepperInput
          label="Weight"
          suffix="kg"
          value={set.weight || prefill.weight}
          onChange={(v) => update({ weight: v })}
          onCommit={() => {
            if (set.weight === '' && prefill.weight) update({ weight: prefill.weight })
          }}
          step={2.5}
          inputMode="decimal"
        />
        <StepperInput
          label="Reps"
          value={set.reps || prefill.reps}
          onChange={(v) => update({ reps: v })}
          onCommit={() => {
            if (set.reps === '' && prefill.reps) update({ reps: prefill.reps })
          }}
          step={1}
          inputMode="numeric"
        />
      </div>
      <div className="no-scrollbar mt-2 overflow-x-auto">
        <div className="flex w-max gap-1">
          <span className="self-center pr-1 text-caption text-text-muted">RPE</span>
          {RPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => update({ rpe: set.rpe === String(o.value) ? '' : String(o.value) })}
              className={cn(
                'press flex h-9 w-10 shrink-0 items-center justify-center rounded-full text-caption tabular',
                set.rpe === String(o.value)
                  ? 'bg-accent text-accent-contrast'
                  : 'glass text-text-muted',
              )}
              aria-pressed={set.rpe === String(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <Button variant="primary" className="mt-2 w-full" onClick={confirm}>
        <IconCheck width={18} height={18} /> Complete set
      </Button>
    </div>
  )
}

function shortType(t: SetType): string {
  return t === 'warm-up' ? 'Warm' : t === 'working' ? 'Work' : t === 'drop' ? 'Drop' : 'Fail'
}

/* ------------------------------------------------------ Add exercise sheet */

function AddExerciseSheet({
  open,
  onClose,
  library,
  onPick,
}: {
  open: boolean
  onClose: () => void
  library: ExerciseDef[]
  onPick: (def: ExerciseDef) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return library.filter((e) => q === '' || e.name.toLowerCase().includes(q)).slice(0, 40)
  }, [library, query])

  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <TextInput
        placeholder="Search exercises…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3"
      />
      <ul className="flex flex-col gap-1 pb-2">
        {filtered.map((def) => (
          <li key={`${def.id ?? def.name}`}>
            <button
              className="press flex w-full items-center justify-between rounded-control px-3 py-3 text-left hover:bg-accent-soft"
              onClick={() => onPick(def)}
            >
              <span className="text-body font-medium">{def.name}</span>
              <span className="text-caption text-text-muted">
                {def.primary.join(', ')}
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-caption text-text-muted">
            No match. Add custom exercises in the Exercise library.
          </li>
        )}
      </ul>
    </Sheet>
  )
}
