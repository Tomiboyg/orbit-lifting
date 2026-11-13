/** Aggregations shared by analytics and the recommendation engine. */

import type { LoggedSet, SetType, ExerciseDef } from '../types'
import { MS_DAY, startOfDay, weekStartOf, type WeekSpan } from './time'

/** Estimated 1RM (Epley formula). For bodyweight/unweighted rows returns 0. */
export function estimate1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  return weight * (1 + reps / 30)
}

/** Load × reps, a simpler performance proxy. */
export function loadXReps(weight: number, reps: number): number {
  return Math.max(0, weight * reps)
}

export interface RawSet {
  id: string
  exerciseId: string | null
  exerciseName: string
  weight: number
  reps: number
  rpe: number | null
  setType: SetType
  completed: boolean
  performedAt: number
  workoutId: string
}

export interface WeekAggregates {
  start: number
  end: number
  workouts: number
  workoutIds: Set<string>
  /** direct sets per muscle (primary only, spec 10.4) */
  directSets: Map<string, number>
  /** weighted sets per muscle (primary + weighted secondary) */
  weightedSets: Map<string, number>
  /** distinct sessions per muscle with at least one counted set */
  frequency: Map<string, number>
  rpeSum: number
  rpeCount: number
}

export function weekAggregates(start: number, end: number): WeekAggregates {
  return {
    start,
    end,
    workouts: 0,
    workoutIds: new Set(),
    directSets: new Map(),
    weightedSets: new Map(),
    frequency: new Map(),
    rpeSum: 0,
    rpeCount: 0,
  }
}

export interface VolumeConfig {
  /** Which set types count (warm-ups never count, spec 10.4). */
  countDrop: boolean
  countFailure: boolean
  secondaryWeight: number
}

export const DEFAULT_VOLUME_CONFIG: VolumeConfig = {
  countDrop: true,
  countFailure: true,
  secondaryWeight: 0.5,
}

export function countsType(t: SetType, cfg: VolumeConfig): boolean {
  if (t === 'warm-up') return false
  if (t === 'working') return true
  if (t === 'drop') return cfg.countDrop
  if (t === 'failure') return cfg.countFailure
  return false
}

export interface ExerciseResolver {
  byId(id: string | null): ExerciseDef | undefined
  byName(name: string): ExerciseDef | undefined
}

/**
 * Aggregate raw sets into weekly buckets.
 * `inProgressSpan` (the current week) is included but flagged separately by callers.
 */
export function aggregateWeeks(
  sets: RawSet[],
  spans: WeekSpan[],
  resolve: ExerciseResolver,
  cfg: VolumeConfig = DEFAULT_VOLUME_CONFIG,
): WeekAggregates[] {
  const weeks = spans.map((s) => weekAggregates(s.start, s.end))
  for (const set of sets) {
    if (!set.completed) continue
    if (!countsType(set.setType, cfg)) continue
    const t = set.performedAt
    const week = weeks.find((w) => t >= w.start && t < w.end)
    if (!week) continue
    const ex = resolve.byId(set.exerciseId) ?? resolve.byName(set.exerciseName)
    const primary = ex?.primary ?? []
    const secondary = ex?.secondary ?? []
    const sw = ex ? ex.secondaryWeight : 0.5
    week.workoutIds.add(set.workoutId)
    for (const m of primary) {
      week.directSets.set(m, (week.directSets.get(m) ?? 0) + 1)
      week.weightedSets.set(m, (week.weightedSets.get(m) ?? 0) + 1)
    }
    for (const m of secondary) {
      week.weightedSets.set(m, (week.weightedSets.get(m) ?? 0) + sw)
    }
    for (const m of new Set([...primary, ...secondary])) {
      const key = `${m}:${set.workoutId}`
      const cur = week.frequency.get(key) ?? 0
      week.frequency.set(key, cur + 1)
    }
    if (set.rpe != null) {
      week.rpeSum += set.rpe
      week.rpeCount += 1
    }
  }
  for (const w of weeks) {
    w.workouts = w.workoutIds.size
    // Collapse frequency keys to distinct sessions per muscle.
    const sessions = new Map<string, number>()
    for (const [key] of w.frequency) {
      const m = key.split(':')[0]
      sessions.set(m, (sessions.get(m) ?? 0) + 1)
    }
    w.frequency = sessions
  }
  return weeks
}

/** Distinct workout days between start (inclusive) and end (exclusive). */
export function countWorkoutsIn(sets: RawSet[], start: number, end: number): number {
  const ids = new Set<string>()
  for (const s of sets) {
    if (s.completed && s.performedAt >= start && s.performedAt < end) ids.add(s.workoutId)
  }
  return ids.size
}

/** Per-exercise performance trend: best estimated 1RM (or load×reps) per week. */
export interface PerfPoint {
  weekStart: number
  value: number
}

export function performanceTrend(
  sets: RawSet[],
  exerciseId: string | null,
  exerciseName: string,
  spans: WeekSpan[],
): { use1RM: boolean; points: PerfPoint[] } {
  const target = sets.filter(
    (s) =>
      s.completed &&
      (exerciseId ? s.exerciseId === exerciseId : s.exerciseName === exerciseName),
  )
  const use1RM = target.some((s) => s.weight > 0)
  const points = spans.map((span) => {
    const inWeek = target.filter(
      (s) => s.performedAt >= span.start && s.performedAt < span.end,
    )
    let best = 0
    for (const s of inWeek) {
      const v = use1RM ? estimate1RM(s.weight, s.reps) : loadXReps(s.weight, s.reps)
      if (v > best) best = v
    }
    return { weekStart: span.start, value: best }
  })
  return { use1RM, points }
}

/** Sets performed for one exercise, most recent first (for prefill + PRs). */
export function recentSetsFor(
  sets: RawSet[],
  exerciseId: string | null,
  exerciseName: string,
  limit = 20,
): RawSet[] {
  return sets
    .filter(
      (s) =>
        s.completed &&
        (exerciseId ? s.exerciseId === exerciseId : s.exerciseName === exerciseName),
    )
    .sort((a, b) => b.performedAt - a.performedAt)
    .slice(0, limit)
}

/** Personal record: best estimated 1RM ever in the dataset. */
export function best1RM(sets: RawSet[], exerciseId: string | null, exerciseName: string): number {
  let best = 0
  for (const s of sets) {
    if (!s.completed || !(exerciseId ? s.exerciseId === exerciseId : s.exerciseName === exerciseName)) continue
    const v = estimate1RM(s.weight, s.reps)
    if (v > best) best = v
  }
  return Math.round(best * 10) / 10
}

/** True when the timestamp falls inside an inclusive week span. */
export function inSpan(ts: number, span: WeekSpan): boolean {
  return ts >= span.start && ts < span.end
}

/** Convenience: start of today (local). */
export function today(): number {
  return startOfDay(Date.now())
}

export function weeksBetween(a: number, b: number): number {
  return Math.round((b - a) / (7 * MS_DAY))
}

export function currentWeekStartOf(now: number, weekStartDay: number): number {
  return weekStartOf(now, weekStartDay)
}
