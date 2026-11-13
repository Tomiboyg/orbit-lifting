/**
 * Metric computation for recommendations (spec 10.3–10.4).
 * Pure functions: same inputs → same outputs. No ML, no LLM.
 */

import type { RawSet } from '../../lib/analytics'
import { aggregateWeeks, countsType, DEFAULT_VOLUME_CONFIG, type VolumeConfig } from '../../lib/analytics'
import { lastCompletedWeeks, weekStartOf, type WeekSpan } from '../../lib/time'
import type { ExerciseDef } from '../../types'
import type { RecommendationSettings } from '../../store/settings'

export interface RecWeek {
  start: number
  workouts: number
  weightedSets: Record<string, number>
  directSets: Record<string, number>
  frequency: Record<string, number>
}

export interface PerfTrendLine {
  name: string
  firstHalfBest: number
  secondHalfBest: number
  changePct: number | null
}

export interface RecInput {
  now: number
  windowStart: number
  completedWeeks: RecWeek[]
  weeksWithEnoughWorkouts: number
  currentWeek: { start: number; workouts: number } | null
  rpeCoverage: number
  avgRpeFirstHalf: number | null
  avgRpeSecondHalf: number | null
  volumeFirstHalfAvg: Record<string, number>
  volumeSecondHalfAvg: Record<string, number>
  frequencyAvg: Record<string, number>
  perfTrends: PerfTrendLine[]
  plannedPerWeek: number | null
  actualAvgPerWeek: number
  thresholdsAreDefaults: boolean
}

export function thresholdProvenance(settings: RecommendationSettings): 'defaults' | 'user-edited' {
  return settings.windowWeeks === 4 &&
    settings.minWeeks === 3 &&
    settings.minWorkoutsPerWeek === 2 &&
    settings.volumeChangePct === 25 &&
    settings.stablePct === 10 &&
    settings.rpeCoverageMin === 0.7 &&
    settings.cooldownWeeks === 2
    ? 'defaults'
    : 'user-edited'
}

function volumeConfig(settings: RecommendationSettings): VolumeConfig {
  return {
    countDrop: settings.countDrop,
    countFailure: settings.countFailure,
    secondaryWeight: settings.secondaryWeight,
  }
}

export function buildRecInput(
  sets: RawSet[],
  exerciseLibrary: ExerciseDef[],
  settings: RecommendationSettings,
  weekStartDay: number,
  now: number = Date.now(),
): RecInput {
  const spans: WeekSpan[] = lastCompletedWeeks(now, weekStartDay, settings.windowWeeks)
  const cfg = volumeConfig(settings)
  const weeks = aggregateWeeks(sets, spans, resolverFrom(exerciseLibrary), cfg)

  const completedWeeks: RecWeek[] = weeks.map((w) => ({
    start: w.start,
    workouts: w.workouts,
    weightedSets: Object.fromEntries(w.weightedSets),
    directSets: Object.fromEntries(w.directSets),
    frequency: Object.fromEntries(w.frequency),
  }))
  const weeksWithEnoughWorkouts = completedWeeks.filter(
    (w) => w.workouts >= settings.minWorkoutsPerWeek,
  ).length

  const currentWeekStart = weekStartOf(now, weekStartDay)
  const currentWeekAgg = aggregateWeeks(
    sets,
    [{ start: currentWeekStart, end: currentWeekStart + 7 * 86400000 }],
    resolverFrom(exerciseLibrary),
    cfg,
  )[0]

  // RPE coverage over counted sets only (spec 10.4).
  let counted = 0
  let withRpe = 0
  let rpeSumFirst = 0
  let rpeCountFirst = 0
  let rpeSumSecond = 0
  let rpeCountSecond = 0
  const mid = spans.length > 0 ? spans[Math.floor(spans.length / 2)].start : now
  for (const s of sets) {
    if (!s.completed || !countsType(s.setType, cfg)) continue
    if (s.performedAt < spans[0].start || s.performedAt >= currentWeekStart) continue
    counted += 1
    if (s.rpe != null) {
      withRpe += 1
      if (s.performedAt < mid) {
        rpeSumFirst += s.rpe
        rpeCountFirst += 1
      } else {
        rpeSumSecond += s.rpe
        rpeCountSecond += 1
      }
    }
  }
  const rpeCoverage = counted === 0 ? 1 : withRpe / counted

  // Volume per muscle, window split in halves.
  const half = Math.max(1, Math.ceil(spans.length / 2))
  const firstSpans = spans.slice(0, half)
  const secondSpans = spans.slice(half)
  const firstWeeks = weeks.slice(0, half)
  const secondWeeks = weeks.slice(half)
  const muscles = new Set<string>()
  for (const w of weeks) for (const m of w.weightedSets.keys()) muscles.add(m)

  const volumeFirstHalfAvg: Record<string, number> = {}
  const volumeSecondHalfAvg: Record<string, number> = {}
  const frequencyAvg: Record<string, number> = {}
  for (const m of muscles) {
    const f = firstWeeks.reduce((acc, w) => acc + (w.weightedSets.get(m) ?? 0), 0)
    const s = secondWeeks.reduce((acc, w) => acc + (w.weightedSets.get(m) ?? 0), 0)
    volumeFirstHalfAvg[m] = firstSpans.length > 0 ? f / firstSpans.length : 0
    volumeSecondHalfAvg[m] = secondSpans.length > 0 ? s / secondSpans.length : 0
    const totalSessions = weeks.reduce((acc, w) => acc + (w.frequency.get(m) ?? 0), 0)
    frequencyAvg[m] = spans.length > 0 ? totalSessions / spans.length : 0
  }

  // Performance trend per exercise: best estimated 1RM (or load×reps proxy handled
  // by caller's data) across first vs second half. Computed on top exercises.
  const byExercise = new Map<string, { id: string | null; count: number }>()
  for (const s of sets) {
    if (!s.completed || !countsType(s.setType, cfg)) continue
    const key = s.exerciseId ?? s.exerciseName
    const cur = byExercise.get(key) ?? { id: s.exerciseId, count: 0 }
    cur.count += 1
    byExercise.set(key, cur)
  }
  const top = [...byExercise.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
  const perfTrends: PerfTrendLine[] = []
  for (const [key] of top) {
    const def = exerciseLibrary.find(
      (e) => (e.id ?? e.name) === key || e.name === key,
    )
    const name = def?.name ?? String(key)
    let firstBest = 0
    let secondBest = 0
    for (const s of sets) {
      if (!s.completed || !countsType(s.setType, cfg)) continue
      if ((s.exerciseId ?? s.exerciseName) !== key) continue
      const v = s.weight * (1 + s.reps / 30) // Epley
      if (s.performedAt >= spans[0].start && s.performedAt < mid && v > firstBest) firstBest = v
      if (s.performedAt >= mid && s.performedAt < currentWeekStart && v > secondBest) secondBest = v
    }
    if (firstBest <= 0 || secondBest <= 0) continue
    perfTrends.push({
      name,
      firstHalfBest: round1(firstBest),
      secondHalfBest: round1(secondBest),
      changePct: round1(((secondBest - firstBest) / firstBest) * 100),
    })
  }

  // Consistency: actual workouts/week vs the user's own average or plan.
  const totalWorkouts = completedWeeks.reduce((a, w) => a + w.workouts, 0)
  const actualAvgPerWeek = completedWeeks.length > 0 ? totalWorkouts / completedWeeks.length : 0
  // A "plan" can be provided later by routines; for now null → average is the baseline.
  const plannedPerWeek: number | null = null

  return {
    now,
    windowStart: spans.length > 0 ? spans[0].start : now,
    completedWeeks,
    weeksWithEnoughWorkouts,
    currentWeek: { start: currentWeekStart, workouts: currentWeekAgg?.workouts ?? 0 },
    rpeCoverage,
    avgRpeFirstHalf: rpeCountFirst > 0 ? round2(rpeSumFirst / rpeCountFirst) : null,
    avgRpeSecondHalf: rpeCountSecond > 0 ? round2(rpeSumSecond / rpeCountSecond) : null,
    volumeFirstHalfAvg,
    volumeSecondHalfAvg,
    frequencyAvg,
    perfTrends,
    plannedPerWeek,
    actualAvgPerWeek,
    thresholdsAreDefaults: thresholdProvenance(settings) === 'defaults',
  }
}

function resolverFrom(library: ExerciseDef[]) {
  const byId = new Map(library.filter((e) => e.id).map((e) => [e.id as string, e]))
  const byName = new Map(library.map((e) => [e.name.toLowerCase(), e]))
  return {
    byId: (id: string | null) => (id ? byId.get(id) : undefined),
    byName: (name: string) => byName.get(name.toLowerCase()),
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Default export keeps tree-shaking honest for the volume config re-export. */
export { DEFAULT_VOLUME_CONFIG }
