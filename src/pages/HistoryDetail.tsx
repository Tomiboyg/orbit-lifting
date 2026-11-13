import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Modal, Skeleton, useToasts } from '../components/ui'
import { IconChevronLeft, IconTrash } from '../components/icons'
import {
  deleteSetRemote,
  deleteWorkout,
  fetchWorkoutDetail,
  updateSetRemote,
  type WorkoutDetail,
} from '../lib/history'
import { formatDay, formatDuration } from '../lib/time'
import type { SetType } from '../types'

const SET_TYPES: SetType[] = ['warm-up', 'working', 'drop', 'failure']

export function HistoryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const push = useToasts((s) => s.push)
  const [detail, setDetail] = useState<WorkoutDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const reload = async () => {
    if (!id) return
    setLoading(true)
    const d = await fetchWorkoutDetail(id)
    setDetail(d)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) {
    return (
      <div className="flex flex-col gap-3 pt-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <Button variant="ghost" onClick={() => navigate('/history')} className="self-start">
          <IconChevronLeft width={18} height={18} /> History
        </Button>
        <Card className="p-6 text-center">
          <p className="text-body text-text-muted">Workout not found (or not synced to the server yet).</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => navigate('/history')} className="px-2">
          <IconChevronLeft width={18} height={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-title font-bold">{detail.title || 'Workout'}</h1>
          <p className="text-caption text-text-muted">
            {formatDay(detail.startedAt)}
            {detail.finishedAt ? ` · ${formatDuration(detail.finishedAt - detail.startedAt)}` : ''}
            {` · ${detail.setCount} sets · ${Math.round(detail.totalVolume)} kg`}
          </p>
        </div>
        <button
          aria-label="Delete workout"
          className="press flex h-10 w-10 items-center justify-center rounded-full text-[#e5726d]"
          onClick={() => setDeleteOpen(true)}
        >
          <IconTrash width={18} height={18} />
        </button>
      </div>

      {detail.exercises.map((ex) => (
        <Card key={ex.id}>
          <div className="px-4 pt-4">
            <h2 className="text-headline font-semibold">{ex.name}</h2>
            {ex.notes && <p className="mt-0.5 text-caption text-text-muted">{ex.notes}</p>}
          </div>
          <ul className="flex flex-col gap-1.5 px-3 py-3">
            {ex.sets.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 rounded-control px-1 py-1">
                <span className="w-5 text-caption text-text-muted tabular">{i + 1}</span>
                {s.completed ? (
                  <>
                    <span className="w-14 text-caption text-text-muted">
                      {s.setType === 'warm-up' ? 'Warm' : s.setType === 'working' ? 'Work' : s.setType === 'drop' ? 'Drop' : 'Fail'}
                    </span>
                    <SetEditor
                      initialWeight={s.weight}
                      initialReps={s.reps}
                      initialRpe={s.rpe}
                      onSave={async (weight, reps, rpe) => {
                        const ok = await updateSetRemote(s.id, { weight, reps, rpe })
                        if (!ok) push('Edit needs a connection — try again online')
                        else push('Set updated')
                      }}
                    />
                    <button
                      aria-label="Delete set"
                      className="press flex h-9 w-9 items-center justify-center rounded-full text-text-muted"
                      onClick={async () => {
                        const ok = await deleteSetRemote(s.id)
                        if (ok) void reload()
                        else push('Deleting needs a connection')
                      }}
                    >
                      <IconTrash width={15} height={15} />
                    </button>
                  </>
                ) : (
                  <span className="text-caption text-text-muted">Incomplete set</span>
                )}
              </li>
            ))}
            {ex.sets.length === 0 && <li className="px-1 py-2 text-caption text-text-muted">No sets recorded.</li>}
          </ul>
        </Card>
      ))}

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete workout?">
        <p className="text-body text-text-muted">
          This permanently removes the workout and all of its sets. Analytics update immediately.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={async () => {
              const ok = await deleteWorkout(detail.id)
              if (ok) {
                push('Workout deleted')
                navigate('/history')
              } else {
                push('Deleting needs a connection')
              }
              setDeleteOpen(false)
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function SetEditor({
  initialWeight,
  initialReps,
  initialRpe,
  onSave,
}: {
  initialWeight: number | null
  initialReps: number | null
  initialRpe: number | null
  onSave: (weight: number | null, reps: number | null, rpe: number | null) => Promise<void>
}) {
  const [weight, setWeight] = useState(initialWeight?.toString() ?? '')
  const [reps, setReps] = useState(initialReps?.toString() ?? '')
  const [rpe, setRpe] = useState(initialRpe?.toString() ?? '')
  const dirty =
    weight !== (initialWeight?.toString() ?? '') ||
    reps !== (initialReps?.toString() ?? '') ||
    rpe !== (initialRpe?.toString() ?? '')

  return (
    <>
      <input
        className="w-16 rounded-control glass px-2 py-1.5 text-center text-caption tabular"
        value={weight}
        inputMode="decimal"
        aria-label="Weight"
        onChange={(e) => setWeight(e.target.value.replace(',', '.'))}
      />
      <span className="text-caption text-text-muted">×</span>
      <input
        className="w-12 rounded-control glass px-2 py-1.5 text-center text-caption tabular"
        value={reps}
        inputMode="numeric"
        aria-label="Reps"
        onChange={(e) => setReps(e.target.value)}
      />
      <input
        className="w-14 rounded-control glass px-2 py-1.5 text-center text-caption tabular"
        value={rpe}
        inputMode="decimal"
        placeholder="RPE"
        aria-label="RPE"
        onChange={(e) => setRpe(e.target.value.replace(',', '.'))}
      />
      {dirty && (
        <button
          className="press rounded-full bg-accent px-3 py-1.5 text-caption font-semibold text-accent-contrast"
          onClick={() =>
            void onSave(
              weight === '' ? null : Number(weight),
              reps === '' ? null : Number(reps),
              rpe === '' ? null : Number(rpe),
            )
          }
        >
          Save
        </button>
      )}
    </>
  )
}

export { SET_TYPES }
