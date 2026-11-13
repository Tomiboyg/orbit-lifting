import { useEffect, useMemo, useState } from 'react'
import { BarChart, LineChart, type ChartDatum } from '../components/charts'
import { Button, Card, CardHeader, Segmented, Sheet, Skeleton, cn } from '../components/ui'
import { useSettings } from '../store/settings'
import { useRecommendation } from '../hooks/useRecommendation'
import { fetchExerciseLibrary, fetchSetsSince } from '../lib/history'
import { aggregateWeeks, best1RM, performanceTrend, type RawSet } from '../lib/analytics'
import { lastCompletedWeeks, weekStartOf } from '../lib/time'
import { FALLBACK_EXERCISES } from '../lib/exercises'
import type { ExerciseDef, MuscleGroup } from '../types'
import { DISCLAIMER, type MetricLine } from '../features/recommendations/rules'
import { MUSCLE_GROUPS } from '../types'

const RANGES = [
  { value: 4, label: '4 wks' },
  { value: 8, label: '8 wks' },
  { value: 12, label: '12 wks' },
]

export function Insights() {
  const settings = useSettings((s) => s.settings)
  const { rec, loading: recLoading, dismiss, refresh } = useRecommendation()
  const [range, setRange] = useState(8)
  const [sets, setSets] = useState<RawSet[] | null>(null)
  const [library, setLibrary] = useState<ExerciseDef[]>(FALLBACK_EXERCISES)
  const [muscle, setMuscle] = useState<MuscleGroup>('chest')
  const [perfName, setPerfName] = useState<string | null>(null)
  const [dismissOpen, setDismissOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rows = await fetchExerciseLibrary()
      if (cancelled) return
      if (rows.length > 0) {
        setLibrary(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            category: r.category,
            primary: (r.primary_muscles ?? []) as MuscleGroup[],
            secondary: (r.secondary_muscles ?? []) as MuscleGroup[],
            secondaryWeight: r.secondary_weight ?? 0.5,
            isCustom: r.user_id != null,
          })),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchSetsSince(Date.now() - (range + 1) * 7 * 86400000).then((s) => {
      if (!cancelled) setSets(s)
    })
    return () => {
      cancelled = true
    }
  }, [range])

  const resolver = useMemo(
    () => ({
      byId: (id: string | null) => (id ? library.find((e) => e.id === id) : undefined),
      byName: (name: string) => library.find((e) => e.name.toLowerCase() === name.toLowerCase()),
    }),
    [library],
  )

  const weekly = useMemo(() => {
    if (!sets) return null
    const now = Date.now()
    const spans = lastCompletedWeeks(now, settings.weekStartDay, range)
    const currentStart = weekStartOf(now, settings.weekStartDay)
    const all = aggregateWeeks(
      sets,
      [...spans, { start: currentStart, end: currentStart + 7 * 86400000 }],
      resolver,
      {
        countDrop: settings.recommendations.countDrop,
        countFailure: settings.recommendations.countFailure,
        secondaryWeight: settings.recommendations.secondaryWeight,
      },
    )
    return { completed: all.slice(0, range), current: all[all.length - 1] }
  }, [sets, range, settings, resolver])

  const totalSetsData: ChartDatum[] = useMemo(
    () =>
      weekly
        ? weekly.completed.map((w) => {
            let total = 0
            for (const v of w.weightedSets.values()) total += v
            return { label: new Date(w.start).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }), value: Math.round(total * 10) / 10 }
          })
        : [],
    [weekly],
  )

  const workoutsData: ChartDatum[] = useMemo(
    () =>
      weekly
        ? weekly.completed.map((w) => ({
            label: new Date(w.start).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
            value: w.workouts,
          }))
        : [],
    [weekly],
  )

  const rpeData: ChartDatum[] = useMemo(
    () =>
      weekly
        ? weekly.completed.map((w) => ({
            label: new Date(w.start).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
            value: w.rpeCount > 0 ? Math.round((w.rpeSum / w.rpeCount) * 10) / 10 : 0,
          }))
        : [],
    [weekly],
  )

  const muscleData: ChartDatum[] = useMemo(
    () =>
      weekly
        ? weekly.completed.map((w) => ({
            label: new Date(w.start).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
            value: Math.round((w.weightedSets.get(muscle) ?? 0) * 10) / 10,
          }))
        : [],
    [weekly, muscle],
  )

  const perfOptions = useMemo(() => {
    if (!sets) return []
    const counts = new Map<string, number>()
    for (const s of sets) {
      if (!s.completed) continue
      counts.set(s.exerciseName, (counts.get(s.exerciseName) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name]) => name)
  }, [sets])

  const perf = useMemo(() => {
    if (!sets || !perfName) return null
    const now = Date.now()
    const spans = lastCompletedWeeks(now, settings.weekStartDay, range)
    const target = sets.find((s) => s.exerciseName === perfName)
    const { use1RM, points } = performanceTrend(sets, target?.exerciseId ?? null, perfName, spans)
    return {
      use1RM,
      data: points.map((p) => ({
        label: new Date(p.weekStart).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
        value: Math.round(p.value * 10) / 10,
      })),
    }
  }, [sets, perfName, range, settings.weekStartDay])

  const prs = useMemo(() => {
    if (!sets) return []
    const names = new Set(sets.filter((s) => s.completed).map((s) => s.exerciseName))
    return [...names]
      .map((name) => {
        const s = sets.find((x) => x.exerciseName === name)
        return { name, best: best1RM(sets, s?.exerciseId ?? null, name) }
      })
      .filter((p) => p.best > 0)
      .sort((a, b) => b.best - a.best)
      .slice(0, 5)
  }, [sets])

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-large-title font-bold">Insights</h1>
        <p className="text-caption text-text-muted">Transparent, rule-based observations from your own logs.</p>
      </header>

      {/* Current recommendation (spec 10.7 explanation requirements). */}
      <Card elevated>
        <CardHeader
          title="This week's insight"
          action={
            rec?.result && !rec.dismissed ? (
              <Button size="sm" variant="ghost" onClick={() => setDismissOpen(true)}>
                Dismiss
              </Button>
            ) : undefined
          }
        />
        <div className="px-4 pb-4 pt-3 desktop:px-6">
          {recLoading && <Skeleton className="h-5 w-56" />}
          {!recLoading && rec?.dismissed && (
            <p className="text-body text-text-muted">
              Dismissed this week{rec.dismissed.reason ? ` — “${rec.dismissed.reason}”` : ''}. It stays hidden
              for the cooldown period configured in Settings.
            </p>
          )}
          {!recLoading && rec?.result && !rec.dismissed && (
            <>
              <p className="text-headline font-semibold">{rec.result.headline}</p>
              <p className="mt-1.5 text-body text-text-muted">{rec.result.body}</p>

              <div className="mt-3 rounded-control bg-accent-soft p-3">
                <p className="text-caption font-semibold">Metrics behind this</p>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {rec.result.metrics.map((m: MetricLine, i: number) => (
                    <li key={i} className="text-caption">
                      <span className="font-medium">{m.label}:</span>{' '}
                      <span className="tabular">{m.value}</span>
                      {m.comparison && <span className="text-text-muted"> — {m.comparison}</span>}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-3 text-[11px] text-text-muted">
                Rule {rec.result.ruleId} (v{rec.result.ruleVersion}) · thresholds:{' '}
                {settings.recommendations.windowWeeks}-week window, ±{settings.recommendations.volumeChangePct}%
                volume, ±{settings.recommendations.stablePct}% performance, ≥
                {Math.round(settings.recommendations.rpeCoverageMin * 100)}% RPE coverage — all{' '}
                {useSettings.getState().settings.recommendations.windowWeeks === 4 &&
                settings.recommendations.volumeChangePct === 25
                  ? 'defaults'
                  : 'user-edited'}
                .
              </p>
            </>
          )}
          {!recLoading && !rec?.result && (
            <p className="text-body text-text-muted">
              No insight yet — keep logging and it appears with the next completed week.
            </p>
          )}
          <p className="mt-3 border-t border-glass-border pt-2 text-[11px] text-text-muted">
            {DISCLAIMER}
          </p>
        </div>
      </Card>

      {/* Optional reference ranges (spec 10.8) — off by default. */}
      {settings.recommendations.showReferenceRanges &&
        Object.keys(settings.recommendations.referenceRanges).length > 0 && (
          <Card>
            <CardHeader title="Reference ranges" />
            <div className="px-4 py-3 desktop:px-6">
              <p className="mb-2 text-[11px] text-text-muted">
                Commonly cited ranges, not personal requirements. Editable in Settings.
              </p>
              <ul className="flex flex-col gap-1">
                {Object.entries(settings.recommendations.referenceRanges).map(([m, range]) => (
                  <li key={m} className="flex justify-between text-caption">
                    <span className="capitalize">{m}</span>
                    <span className="tabular">
                      {range[0] === '' || range[1] === '' ? '—' : `${range[0]}–${range[1]} sets/week`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}

      {/* Analytics */}
      <div className="flex items-center justify-between">
        <h2 className="text-headline font-semibold">Analytics</h2>
        <Segmented size="sm" options={RANGES} value={range} onChange={setRange} ariaLabel="Analysis range" />
      </div>

      {!weekly && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {weekly && (
        <>
          <Card>
            <CardHeader title="Weekly weighted sets" />
            <div className="px-2 py-3">
              {totalSetsData.every((d) => d.value === 0) ? (
                <EmptyInline />
              ) : (
                <BarChart data={totalSetsData} unit=" sets" />
              )}
              {weekly.current.workouts >= 0 && (
                <p className="px-3 text-caption text-text-muted">
                  Current week (in progress, never compared): {weekly.current.workouts} workout
                  {weekly.current.workouts === 1 ? '' : 's'}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Workouts per week" />
            <div className="px-2 py-3">
              {workoutsData.every((d) => d.value === 0) ? <EmptyInline /> : <BarChart data={workoutsData} />}
            </div>
          </Card>

          <Card>
            <CardHeader title="Average RPE" />
            <div className="px-2 py-3">
              {rpeData.every((d) => d.value === 0) ? (
                <EmptyInline text="RPE appears once sets include it. RPE is optional." />
              ) : (
                <LineChart data={rpeData} />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Volume by muscle group" />
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pt-3">
              {MUSCLE_GROUPS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMuscle(m)}
                  className={cn(
                    'press shrink-0 rounded-full px-3 py-1.5 text-caption capitalize',
                    muscle === m ? 'bg-accent text-accent-contrast' : 'glass text-text-muted',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="px-2 py-3">
              <LineChart data={muscleData} unit=" sets" />
              <p className="px-3 text-caption text-text-muted">
                Weighted sets = direct sets (primary muscles, weight 1.0) plus secondary muscles at{' '}
                {settings.recommendations.secondaryWeight}. The calculation is visible in Settings → Volume counting.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Performance trend" />
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pt-3">
              {perfOptions.map((name) => (
                <button
                  key={name}
                  onClick={() => setPerfName(name)}
                  className={cn(
                    'press shrink-0 rounded-full px-3 py-1.5 text-caption',
                    perfName === name ? 'bg-accent text-accent-contrast' : 'glass text-text-muted',
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="px-2 py-3">
              {perf && perf.data.some((d) => d.value > 0) ? (
                <>
                  <LineChart data={perf.data} unit={perf.use1RM ? ' kg 1RM' : ''} />
                  <p className="px-3 text-caption text-text-muted">
                    Best {perf.use1RM ? 'estimated 1RM (Epley)' : 'load × reps'} per week. Small changes inside the
                    tolerance band count as stable.
                  </p>
                </>
              ) : (
                <EmptyInline text="Pick an exercise to see its weekly trend." />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Top estimated 1RMs" />
            <ul className="px-4 py-3">
              {prs.map((p) => (
                <li key={p.name} className="flex items-center justify-between border-b border-glass-border py-2 last:border-0">
                  <span className="text-body">{p.name}</span>
                  <span className="text-body font-semibold tabular">{p.best} kg</span>
                </li>
              ))}
              {prs.length === 0 && <EmptyInline text="Log weighted sets to see personal records." />}
            </ul>
          </Card>
        </>
      )}

      <p className="px-2 text-center text-[11px] text-text-muted">{DISCLAIMER}</p>

      <Sheet open={dismissOpen} onClose={() => setDismissOpen(false)} title="Dismiss this insight">
        <p className="mb-3 text-caption text-text-muted">
          Optional — the reason only helps you later. The same rule stays hidden for{' '}
          {settings.recommendations.cooldownWeeks} week(s).
        </p>
        <div className="flex flex-col gap-2 pb-2">
          {['Not now', 'Does not apply to me', 'Data looks wrong'].map((reason) => (
            <Button
              key={reason}
              onClick={() => {
                dismiss(reason)
                setDismissOpen(false)
              }}
            >
              {reason}
            </Button>
          ))}
          <Button
            variant="primary"
            onClick={() => {
              dismiss('dismissed')
              setDismissOpen(false)
            }}
          >
            Dismiss without reason
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await refresh()
              setDismissOpen(false)
            }}
          >
            Regenerate instead
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function EmptyInline({ text }: { text?: string }) {
  return (
    <p className="px-3 py-8 text-center text-caption text-text-muted">
      {text ?? 'Not enough data in this range yet.'}
    </p>
  )
}
