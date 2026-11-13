/**
 * Recommendation engine orchestration: history fetch → metrics → rules,
 * with dismissal cooldown (spec 10.9). One active recommendation at a time.
 */

import type { RawSet } from '../../lib/analytics'
import type { ExerciseDef } from '../../types'
import type { RecommendationSettings } from '../../store/settings'
import { buildRecInput, type RecInput } from './metrics'
import { evaluateRules, type RuleResult } from './rules'
import { weekStartOf } from '../../lib/time'

export interface DismissalRecord {
  type: number
  ruleId: string
  weekStart: number
  dismissedAt: number
}

export interface ComputedRecommendation {
  result: RuleResult | null
  suppressedByDismissal: boolean
  weekStart: number
  input: RecInput
}

export function isSuppressedByCooldown(
  dismissals: DismissalRecord[],
  result: RuleResult,
  cooldownWeeks: number,
  now: number,
  weekStartDay: number,
): boolean {
  const thisWeek = weekStartOf(now, weekStartDay)
  return dismissals.some(
    (d) =>
      d.ruleId === result.ruleId &&
      thisWeek - d.weekStart < cooldownWeeks * 7 * 24 * 60 * 60 * 1000,
  )
}

export function computeRecommendation(
  sets: RawSet[],
  library: ExerciseDef[],
  settings: RecommendationSettings,
  weekStartDay: number,
  dismissals: DismissalRecord[],
  now: number = Date.now(),
): ComputedRecommendation {
  const input = buildRecInput(sets, library, settings, weekStartDay, now)
  const result = evaluateRules({ input, settings })
  const weekStart = weekStartOf(now, weekStartDay)
  const suppressed =
    result != null &&
    isSuppressedByCooldown(dismissals, result, settings.cooldownWeeks, now, weekStartDay)
  return { result, suppressedByDismissal: suppressed, weekStart, input }
}

/** Metric snapshot stored with a recommendation for later review (spec 10.9). */
export function snapshotInputs(input: RecInput): Record<string, unknown> {
  return {
    completedWeeks: input.completedWeeks,
    weeksWithEnoughWorkouts: input.weeksWithEnoughWorkouts,
    currentWeek: input.currentWeek,
    rpeCoverage: input.rpeCoverage,
    avgRpeFirstHalf: input.avgRpeFirstHalf,
    avgRpeSecondHalf: input.avgRpeSecondHalf,
    volumeFirstHalfAvg: input.volumeFirstHalfAvg,
    volumeSecondHalfAvg: input.volumeSecondHalfAvg,
    frequencyAvg: input.frequencyAvg,
    perfTrends: input.perfTrends,
    actualAvgPerWeek: input.actualAvgPerWeek,
  }
}
