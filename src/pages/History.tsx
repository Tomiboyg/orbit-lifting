import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, Skeleton } from '../components/ui'
import { IconChevronLeft } from '../components/icons'
import { fetchWorkouts, type WorkoutRecord } from '../lib/history'
import { formatDay, formatDuration } from '../lib/time'

export function History() {
  const [workouts, setWorkouts] = useState<WorkoutRecord[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchWorkouts(100).then((w) => {
      if (!cancelled) setWorkouts(w)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-large-title font-bold">History</h1>
        <p className="text-caption text-text-muted">
          Every logged session. Edits and deletes are reflected in analytics.
        </p>
      </header>

      {workouts == null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : workouts.length === 0 ? (
        <Card>
          <EmptyState title="No history yet" body="Finished workouts appear here, newest first." />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {workouts.map((w) => (
            <li key={w.id}>
              <Link
                to={`/history/${w.id}`}
                className="glass press flex items-center gap-3 rounded-card px-4 py-3 shadow-glass"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">{w.title || 'Workout'}</span>
                  <span className="block text-caption text-text-muted">
                    {formatDay(w.startedAt)}
                    {w.finishedAt ? ` · ${formatDuration(w.finishedAt - w.startedAt)}` : ' · in progress'}
                    {` · ${w.setCount} sets`}
                    {w.totalVolume > 0 ? ` · ${Math.round(w.totalVolume)} kg total` : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function HistoryBackButton() {
  return (
    <Link to="/history" aria-label="Back to history" className="press text-text-muted">
      <IconChevronLeft />
    </Link>
  )
}
