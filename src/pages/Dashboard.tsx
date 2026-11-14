import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, CardHeader, EmptyState, Modal, Skeleton, useToasts } from '../components/ui'
import { IconChevronRight, IconDumbbell, IconInsights, IconSettings } from '../components/icons'
import { useAuth } from '../hooks/useAuth'
import { useWorkout } from '../store/workout'
import { useSettings } from '../store/settings'
import { useRecommendation } from '../hooks/useRecommendation'
import { fetchSetsSince, fetchWorkouts, type WorkoutRecord } from '../lib/history'
import { checkOtherDeviceWorkout, discardOtherWorkout, resumeOtherWorkout, type OtherWorkout } from '../lib/crossDevice'
import { formatDay, weekStartOf } from '../lib/time'

export function Dashboard() {
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()
  const workout = useWorkout((s) => s.workout)
  const startWorkout = useWorkout((s) => s.startWorkout)
  const settings = useSettings((s) => s.settings)
  const { rec, loading: recLoading } = useRecommendation()
  const push = useToasts((s) => s.push)
  const [weekSets, setWeekSets] = useState<number | null>(null)
  const [recent, setRecent] = useState<WorkoutRecord[] | null>(null)
  const [weekWorkouts, setWeekWorkouts] = useState<number | null>(null)
  const [other, setOther] = useState<OtherWorkout | null>(null)

  useEffect(() => {
    if (!user) return
    // Pull account settings once a session exists (spec 14.2 persists per account).
    void useSettings.getState().pullRemote()
    // Cross-device active workout check (spec 11.5).
    void checkOtherDeviceWorkout().then((o) => {
      if (o) setOther(o)
    })
    let cancelled = false
    void (async () => {
      const week = weekStartOf(Date.now(), settings.weekStartDay)
      const [sets, workouts] = await Promise.all([
        fetchSetsSince(week),
        fetchWorkouts(12),
      ])
      if (cancelled) return
      const weekW = new Set(sets.map((s) => s.workoutId))
      setWeekSets(sets.length)
      setWeekWorkouts(weekW.size)
      setRecent(workouts)
    })()
    return () => {
      cancelled = true
    }
  }, [user, settings.weekStartDay])

  // Hidden tap-target easter egg: 7 quick taps on the orbit glyph (spec 14.9).
  const taps = useRef(0)
  const lastTap = useRef(0)
  function egg() {
    const now = Date.now()
    if (now - lastTap.current > 1200) taps.current = 0
    lastTap.current = now
    taps.current += 1
    if (taps.current === 7) {
      taps.current = 0
      push('A small crab waves from under a rock. Hi.')
    }
  }

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Night session' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <button className="press text-left" onClick={egg} aria-label="Orbit Lifting">
          <p className="text-caption text-text-muted">{greeting}</p>
          <h1 className="text-large-title font-bold leading-tight">Orbit Lifting</h1>
        </button>
        <Link
          to="/settings"
          aria-label="Settings"
          className="glass press flex h-11 w-11 items-center justify-center rounded-full text-text-muted"
        >
          <IconSettings width={20} height={20} />
        </Link>
      </header>

      {workout?.finishedAt && (
        <Card className="p-4">
          <p className="text-caption text-text-muted">Finished workout — not synced yet</p>
          <p className="text-headline font-semibold">Tap Log to retry the sync</p>
        </Card>
      )}

      {/* Primary action */}
      {!workout && (
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={async () => {
            await startWorkout()
            navigate('/log')
          }}
        >
          <IconDumbbell width={20} height={20} />
          Start workout
        </Button>
      )}

      {/* This week */}
      <Card>
        <CardHeader title="This week" />
        <div className="grid grid-cols-3 gap-2 px-4 py-4 desktop:px-6">
          <Stat label="Workouts" value={weekWorkouts} />
          <Stat label="Sets" value={weekSets} />
          <Stat
            label="Insight"
            value={
              rec?.result
                ? rec.result.type === 5
                  ? 'Not enough data'
                  : `Type ${rec.result.type}`
                : null
            }
          />
        </div>
      </Card>

      {/* Current recommendation summary */}
      <Link to="/insights" className="press block" aria-label="Open insights">
        <Card className="p-4 desktop:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <IconInsights width={20} height={20} />
            </span>
            <div className="min-w-0 flex-1">
              {recLoading ? (
                <Skeleton className="h-4 w-40" />
              ) : (
                <>
                  <p className="text-caption text-text-muted">This week's insight</p>
                  <p className="text-headline font-semibold">
                    {rec?.result?.headline ?? 'Insight not generated yet'}
                  </p>
                </>
              )}
            </div>
            <IconChevronRight width={18} height={18} className="mt-1 text-text-muted" />
          </div>
        </Card>
      </Link>

      {/* Recent workouts */}
      <Card>
        <CardHeader
          title="Recent workouts"
          action={
            <Link to="/history" className="text-caption font-medium text-accent">
              See all
            </Link>
          }
        />
        {recent == null ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            title="No workouts yet"
            body="Your logged sessions will appear here. Start one and it stays safe even if the app closes."
            crab
          />
        ) : (
          <ul className="px-2 py-2">
            {recent.slice(0, 5).map((w) => (
              <li key={w.id}>
                <Link
                  to={`/history/${w.id}`}
                  className="press flex items-center gap-3 rounded-card px-3 py-3 hover:bg-accent-soft"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <IconDumbbell width={17} height={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium">
                      {w.title || 'Workout'}
                    </span>
                    <span className="block text-caption text-text-muted">
                      {formatDay(w.startedAt)} · {w.setCount} sets
                      {w.totalVolume > 0 ? ` · ${Math.round(w.totalVolume)} kg` : ''}
                    </span>
                  </span>
                  <IconChevronRight width={16} height={16} className="text-text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={other != null} onClose={() => setOther(null)} title="Active workout on another device">
        <p className="text-body text-text-muted">
          {other?.title || 'A workout'} was started on another device and is still active. Nothing is merged
          or overwritten silently — choose what to do.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={async () => {
              if (!other) return
              const ok = await resumeOtherWorkout(other)
              setOther(null)
              if (ok) navigate('/log')
              else push('Could not load that workout — try again online')
            }}
          >
            Resume it here
          </Button>
          <Button
            onClick={async () => {
              if (!other) return
              const ok = await discardOtherWorkout(other)
              setOther(null)
              push(ok ? 'The other workout was closed' : 'Needs a connection')
            }}
          >
            Discard the other one
          </Button>
          <Button variant="ghost" onClick={() => setOther(null)}>
            Keep what I have on this device
          </Button>
        </div>
      </Modal>

      <p className="px-2 text-center text-[11px] text-text-muted">
        Educational training insights only — not medical or individualized advice.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="rounded-control px-2 py-1 text-center">
      <p className="text-title font-bold tabular">{value ?? '—'}</p>
      <p className="text-caption text-text-muted">{label}</p>
    </div>
  )
}
