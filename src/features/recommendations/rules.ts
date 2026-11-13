/**
 * Recommendation rules (spec 10.5–10.7).
 * Rule-based and deterministic. Conservative: the app never recommends
 * increasing workload automatically — type 3 states the observed direction
 * and the user decides. Every result carries the metrics, values, thresholds
 * and rule identity needed for the explanation UI.
 */

import type { RecInput, PerfTrendLine } from './metrics'
import type { RecommendationSettings } from '../../store/settings'

export const DISCLAIMER =
  'Educational insight based on your logged data — not medical or individualized advice.'

export interface MetricLine {
  label: string
  value: string
  comparison?: string
}

export interface RuleResult {
  type: 1 | 2 | 3 | 4 | 5
  ruleId: string
  ruleVersion: number
  headline: string
  body: string
  metrics: MetricLine[]
}

export interface RuleContext {
  input: RecInput
  settings: RecommendationSettings
}

export interface Rule {
  id: string
  version: number
  /** Lower priority number = evaluated first. */
  priority: number
  evaluate(ctx: RuleContext): RuleResult | null
}

const pct = (n: number): string => `${Math.round(n * 10) / 10}%`
const num = (n: number): string => `${Math.round(n * 10) / 10}`

function muscleLines(
  input: RecInput,
  pick: (m: string) => [number, number],
  limit = 4,
): MetricLine[] {
  const muscles = new Set([
    ...Object.keys(input.volumeFirstHalfAvg),
    ...Object.keys(input.volumeSecondHalfAvg),
  ])
  const lines: MetricLine[] = []
  for (const m of [...muscles].sort()) {
    const [first, second] = pick(m)
    if (first === 0 && second === 0) continue
    lines.push({
      label: `${cap(m)} weighted sets/week`,
      value: num(second),
      comparison: `${num(first)} in the first half of the window → ${num(second)} in the second half`,
    })
  }
  return lines.sort(
    (a, b) =>
      Math.abs(parseFloat(b.value)) - Math.abs(parseFloat(a.value)),
  ).slice(0, limit)
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function perfLines(trends: PerfTrendLine[], limit = 3): MetricLine[] {
  return trends.slice(0, limit).map((t) => ({
    label: `${t.name} — estimated 1RM`,
    value: `${num(t.secondHalfBest)} kg`,
    comparison:
      t.changePct == null
        ? undefined
        : `${num(t.firstHalfBest)} kg earlier in the window (${t.changePct >= 0 ? '+' : ''}${pct(t.changePct)})`,
  }))
}

/** R-05: insufficient data is the default state (spec 10.6). */
export const dataRule: Rule = {
  id: 'R-05-DATA-INSUFFICIENT',
  version: 1,
  priority: 0,
  evaluate({ input, settings }) {
    const ok = input.weeksWithEnoughWorkouts >= settings.minWeeks
    if (ok) return null
    return {
      type: 5,
      ruleId: this.id,
      ruleVersion: this.version,
      headline: 'Not enough data yet for a recommendation',
      body:
        `A volume insight needs at least ${settings.minWeeks} completed week${settings.minWeeks === 1 ? '' : 's'} ` +
        `with ${settings.minWorkoutsPerWeek}+ logged workouts each. Right now ${input.weeksWithEnoughWorkouts} ` +
        `completed week${input.weeksWithEnoughWorkouts === 1 ? '' : 's'} meet that bar ` +
        `(window: last ${settings.windowWeeks} completed weeks). Keep logging — the current week shows as "in progress" and is never compared against full weeks.`,
      metrics: [
        {
          label: 'Completed weeks in window',
          value: String(input.completedWeeks.length),
          comparison: `needed: ${settings.minWeeks} with ${settings.minWorkoutsPerWeek}+ workouts`,
        },
        {
          label: 'Weeks meeting the workout threshold',
          value: String(input.weeksWithEnoughWorkouts),
          comparison: input.completedWeeks
            .map((w) => `${num(w.workouts)} workouts`)
            .join(', '),
        },
      ],
    }
  },
}

/** R-04: allow additional recovery (spec 10.5 type 4). */
export const recoveryRule: Rule = {
  id: 'R-04-RECOVERY',
  version: 1,
  priority: 1,
  evaluate({ input, settings }) {
    if (input.rpeCoverage < settings.rpeCoverageMin) return null
    if (input.avgRpeFirstHalf == null || input.avgRpeSecondHalf == null) return null
    const rpeRising = input.avgRpeSecondHalf >= input.avgRpeFirstHalf + 0.5
    const declining = input.perfTrends.filter((t) => (t.changePct ?? 0) < -settings.stablePct)
    const volumeUp = Object.keys(input.volumeSecondHalfAvg).some((m) => {
      const a = input.volumeFirstHalfAvg[m]
      const b = input.volumeSecondHalfAvg[m]
      return a > 0 && (b - a) / a > settings.volumeChangePct / 100
    })
    if (!(rpeRising && declining.length > 0)) return null
    return {
      type: 4,
      ruleId: this.id,
      ruleVersion: this.version,
      headline: 'Consider allowing additional recovery',
      body:
        'Your average RPE has risen between the two halves of the analysis window while the performance trend for several exercises is flat or down. That combination often just reflects ordinary fluctuation, but some extra recovery time is a low-risk response. Nothing is changed automatically — you decide.',
      metrics: [
        {
          label: 'Average RPE (first half → second half)',
          value: `${num(input.avgRpeFirstHalf)} → ${num(input.avgRpeSecondHalf)}`,
          comparison: `RPE included from ${Math.round(input.rpeCoverage * 100)}% of counted sets (threshold: ≥ ${Math.round(settings.rpeCoverageMin * 100)}%)`,
        },
        {
          label: 'Exercises trending down beyond tolerance',
          value: String(declining.length),
          comparison: declining.map((t) => `${t.name} ${pct(t.changePct ?? 0)}`).join(', '),
        },
        {
          label: 'Volume direction',
          value: volumeUp ? 'increased in the second half' : 'not increased',
          comparison: `change threshold: ${pct(settings.volumeChangePct)}`,
        },
        ...perfLines(declining),
      ],
    }
  },
}

/** R-03: modest adjustment, direction-neutral (spec 10.5 type 3). */
export const adjustmentRule: Rule = {
  id: 'R-03-MODEST-ADJUSTMENT',
  version: 1,
  priority: 2,
  evaluate({ input, settings }) {
    if (input.rpeCoverage < settings.rpeCoverageMin) return null
    let worstMuscle: string | null = null
    let worstDelta = 0
    for (const m of Object.keys(input.volumeSecondHalfAvg)) {
      const a = input.volumeFirstHalfAvg[m]
      const b = input.volumeSecondHalfAvg[m]
      if (a <= 0 && b <= 0) continue
      const delta = a > 0 ? ((b - a) / a) * 100 : b > 0 ? 100 : 0
      if (Math.abs(delta) > Math.abs(worstDelta)) {
        worstDelta = delta
        worstMuscle = m
      }
    }
    if (!worstMuscle || Math.abs(worstDelta) < settings.volumeChangePct) return null

    const allFavourable =
      input.perfTrends.length > 0 &&
      input.perfTrends.every((t) => (t.changePct ?? 0) > settings.stablePct) &&
      (input.avgRpeSecondHalf == null ||
        input.avgRpeFirstHalf == null ||
        input.avgRpeSecondHalf <= input.avgRpeFirstHalf + 0.5)

    const direction = worstDelta > 0 ? 'reducing or redistributing' : allFavourable ? 'a small increase, or redistributing' : 'redistributing'

    return {
      type: 3,
      ruleId: this.id,
      ruleVersion: this.version,
      headline: `Review ${cap(worstMuscle).toLowerCase()} volume`,
      body:
        `Weekly ${worstMuscle} volume moved ${worstDelta > 0 ? 'up' : 'down'} by ${pct(Math.abs(worstDelta))} between the two halves of the window (threshold ${pct(settings.volumeChangePct)}). ` +
        `The data most supports ${direction}. This is not a recommendation to change anything automatically — you decide, and no target here is a scientifically established personal requirement.`,
      metrics: [
        {
          label: `${cap(worstMuscle)} weighted sets/week`,
          value: `${num(input.volumeFirstHalfAvg[worstMuscle])} → ${num(input.volumeSecondHalfAvg[worstMuscle])}`,
          comparison: `change ${worstDelta > 0 ? '+' : ''}${pct(worstDelta)}, threshold ±${pct(settings.volumeChangePct)}`,
        },
        {
          label: 'All performance signals favourable',
          value: allFavourable ? 'yes' : 'no',
          comparison: 'a small increase is only mentioned when this is yes',
        },
        ...muscleLines(input, (m) => [input.volumeFirstHalfAvg[m], input.volumeSecondHalfAvg[m]], 3),
      ],
    }
  },
}

/** R-02: review training frequency (spec 10.5 type 2). */
export const frequencyRule: Rule = {
  id: 'R-02-FREQUENCY-REVIEW',
  version: 1,
  priority: 3,
  evaluate({ input }) {
    if (input.completedWeeks.length < 2) return null
    const overall = input.actualAvgPerWeek
    if (overall < 1.5) return null
    const low = Object.entries(input.frequencyAvg)
      .filter(([, freq]) => freq < 1.5)
      .map(([m]) => m)
    const high = Object.entries(input.frequencyAvg).filter(([, f]) => f >= 2)
    if (low.length === 0 || high.length === 0) return null
    return {
      type: 2,
      ruleId: this.id,
      ruleVersion: this.version,
      headline: 'Review training frequency',
      body:
        'Some muscle groups were trained in fewer than 1.5 sessions per week on average while others reached 2+. Frequency is one of the factors people commonly adjust first — see whether spreading a couple of sets differently suits your week. This is an observation, not a requirement.',
      metrics: [
        {
          label: 'Average sessions/week per muscle',
          value: Object.entries(input.frequencyAvg)
            .sort((a, b) => a[1] - b[1])
            .map(([m, f]) => `${cap(m)} ${num(f)}`)
            .join(', '),
        },
        {
          label: 'Average workouts/week',
          value: num(overall),
        },
      ],
    }
  },
}

/** R-01: maintain current volume (spec 10.5 type 1). */
export const maintainRule: Rule = {
  id: 'R-01-MAINTAIN',
  version: 1,
  priority: 4,
  evaluate({ input, settings }) {
    const stableVolume = Object.keys(input.volumeSecondHalfAvg).every((m) => {
      const a = input.volumeFirstHalfAvg[m]
      const b = input.volumeSecondHalfAvg[m]
      if (a === 0 && b === 0) return true
      if (a === 0 || b === 0) return false
      return Math.abs((b - a) / a) * 100 <= settings.volumeChangePct
    })
    const perfOK = input.perfTrends.every(
      (t) => t.changePct != null && Math.abs(t.changePct) <= settings.stablePct,
    )
    if (!stableVolume || !perfOK) return null
    return {
      type: 1,
      ruleId: this.id,
      ruleVersion: this.version,
      headline: 'Maintain current volume',
      body:
        'Weekly volume per muscle group and the performance trends sit inside the tolerance bands across the analysis window. The data most supports keeping things as they are. No change is made automatically.',
      metrics: [
        ...muscleLines(input, (m) => [input.volumeFirstHalfAvg[m], input.volumeSecondHalfAvg[m]]),
        ...perfLines(input.perfTrends),
        {
          label: 'Tolerance bands',
          value: `volume ±${pct(settings.volumeChangePct)}, performance ±${pct(settings.stablePct)}`,
          comparison: input.thresholdsAreDefaults ? 'defaults' : 'user-edited thresholds',
        },
      ],
    }
  },
}

export const RULES: Rule[] = [dataRule, recoveryRule, adjustmentRule, frequencyRule, maintainRule]

/** Run all rules in priority order and return the first that fires. */
export function evaluateRules(ctx: RuleContext): RuleResult | null {
  const ordered = [...RULES].sort((a, b) => a.priority - b.priority)
  for (const rule of ordered) {
    const result = rule.evaluate(ctx)
    if (result) return result
  }
  return null
}
