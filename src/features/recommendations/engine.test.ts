import { describe, it, expect } from 'vitest'
import type { RawSet } from '../lib/analytics'
import type { SetType, ExerciseDef } from '../types'
import type { RecommendationSettings } from '../store/settings'
import { DEFAULT_SETTINGS } from '../store/settings'
import { computeRecommendation } from './engine'

const DAY = 86_400_000
const WEEK = 7 * DAY

// A Wednesday afternoon: the current week is clearly "in progress".
const NOW = new Date(2026, 10, 11, 15, 0, 0).getTime() // Wed Nov 11 2026

const bench: ExerciseDef = {
  id: 'ex-bench',
  name: 'Barbell Bench Press',
  category: 'Push',
  primary: ['chest'],
  secondary: ['triceps'],
  secondaryWeight: 0.5,
  isCustom: false,
}
const squat: ExerciseDef = {
  id: 'ex-squat',
  name: 'Barbell Squat',
  category: 'Legs',
  primary: ['quads'],
  secondary: ['glutes'],
  secondaryWeight: 0.5,
  isCustom: false,
}
const row: ExerciseDef = {
  id: 'ex-row',
  name: 'Barbell Row',
  category: 'Pull',
  primary: ['back'],
  secondary: ['biceps'],
  secondaryWeight: 0.5,
  isCustom: false,
}

const LIBRARY = [bench, squat, row]

function settings(over: Partial<RecommendationSettings> = {}): RecommendationSettings {
  return { ...DEFAULT_SETTINGS.recommendations, ...over }
}

/** Monday 00:00 local of the week containing ts (weekStartDay = 1). */
function weekStartMonday(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

let seq = 0
function mkSet(
  at: number,
  ex: ExerciseDef,
  weight: number,
  reps: number,
  opts: { rpe?: number | null; workoutId: string; setType?: SetType } = { workoutId: 'w' },
): RawSet {
  seq += 1
  return {
    id: `set-${seq}`,
    exerciseId: ex.id,
    exerciseName: ex.name,
    weight,
    reps,
    rpe: opts.rpe ?? 7,
    setType: opts.setType ?? 'working',
    completed: true,
    performedAt: at,
    workoutId: opts.workoutId,
  }
}

/** The Monday starts of the last `count` completed weeks, oldest first. */
function completedMondays(count: number): number[] {
  const out: number[] = []
  for (let k = count; k >= 1; k--) out.push(weekStartMonday(NOW - k * WEEK))
  return out
}

/** One session: 3 bench + 2 squat + 2 row, all in one workout id. */
function session(
  at: number,
  id: string,
  benchW = 60,
  squatW = 80,
  rowW = 50,
  rpe: number | null = 7,
): RawSet[] {
  return [
    mkSet(at, bench, benchW, 8, { rpe, workoutId: id }),
    mkSet(at, bench, benchW, 8, { rpe, workoutId: id }),
    mkSet(at, bench, benchW, 8, { rpe, workoutId: id }),
    mkSet(at, squat, squatW, 8, { rpe, workoutId: id }),
    mkSet(at, squat, squatW, 8, { rpe, workoutId: id }),
    mkSet(at, row, rowW, 8, { rpe, workoutId: id }),
    mkSet(at, row, rowW, 8, { rpe, workoutId: id }),
  ]
}

/** 4 completed weeks × 3 sessions (Mon/Wed/Fri), identical volume every week. */
function steadyHistory(): RawSet[] {
  return completedMondays(4).flatMap((ws, i) =>
    [0, 2, 4].map((o) => session(ws + o * DAY, `w${i}-${o}`)),
  )
}

describe('recommendation engine', () => {
  it('returns type 5 (insufficient data) when there is no history', () => {
    const rec = computeRecommendation([], LIBRARY, settings(), 1, [], NOW)
    expect(rec.result?.type).toBe(5)
    expect(rec.result?.ruleId).toBe('R-05-DATA-INSUFFICIENT')
  })

  it('returns type 5 when weeks exist but lack minimum workouts', () => {
    const sets = completedMondays(4).map((ws, i) =>
      mkSet(ws + 2 * DAY, bench, 60, 8, { workoutId: `single-${i}` }),
    )
    const rec = computeRecommendation(sets, LIBRARY, settings(), 1, [], NOW)
    expect(rec.result?.type).toBe(5)
  })

  it('recommends maintaining when volume and performance are stable', () => {
    const rec = computeRecommendation(steadyHistory(), LIBRARY, settings(), 1, [], NOW)
    expect(rec.result?.type).toBe(1)
    expect(rec.result?.ruleId).toBe('R-01-MAINTAIN')
    expect(rec.result?.metrics.length).toBeGreaterThan(0)
    expect(rec.suppressedByDismissal).toBe(false)
  })

  it('suggests a modest adjustment when a muscle group drops sharply', () => {
    const mondays = completedMondays(4)
    const cutoff = mondays[2] // start of the second half of the window
    const reduced = steadyHistory().filter(
      (s) => !(s.exerciseId === bench.id && s.performedAt >= cutoff),
    )
    const rec = computeRecommendation(reduced, LIBRARY, settings(), 1, [], NOW)
    expect(rec.result?.type).toBe(3)
    expect(rec.result?.ruleId).toBe('R-03-MODEST-ADJUSTMENT')
    expect(rec.result?.body).toContain('chest')
  })

  it('suppresses a dismissed rule during the cooldown', () => {
    const rec = computeRecommendation(
      steadyHistory(),
      LIBRARY,
      settings(),
      1,
      [
        {
          type: 1,
          ruleId: 'R-01-MAINTAIN',
          weekStart: weekStartMonday(NOW),
          dismissedAt: NOW - DAY,
        },
      ],
      NOW,
    )
    expect(rec.result?.type).toBe(1)
    expect(rec.suppressedByDismissal).toBe(true)
  })

  it('excludes RPE-based rules when RPE coverage is too low', () => {
    const sets = steadyHistory().map((s) => ({ ...s, rpe: null as number | null }))
    const rec = computeRecommendation(sets, LIBRARY, settings(), 1, [], NOW)
    expect(rec.result?.type).not.toBe(4)
  })

  it('allows additional recovery when RPE rises and performance drops', () => {
    // First half: 60 kg @ RPE 7. Second half: 52 kg (−13% estimated 1RM, beyond
    // the ±10% band) @ RPE 9.
    const sets = completedMondays(4).flatMap((ws, i) => {
      const firstHalf = i < 2
      return [0, 2, 4].flatMap((o) =>
        session(ws + o * DAY, `rw${i}-${o}`, firstHalf ? 60 : 52, 80, 50, firstHalf ? 7 : 9),
      )
    })
    const rec = computeRecommendation(sets, LIBRARY, settings(), 1, [], NOW)
    expect(rec.result?.type).toBe(4)
    expect(rec.result?.ruleId).toBe('R-04-RECOVERY')
  })

  it('never recommends increasing workload automatically', () => {
    const rec = computeRecommendation(steadyHistory(), LIBRARY, settings(), 1, [], NOW)
    const text = `${rec.result?.headline ?? ''} ${rec.result?.body ?? ''}`.toLowerCase()
    expect(text).not.toContain('you should increase')
    expect(text).not.toContain('increase your volume by')
  })

  it('treats the current week as in progress, never a comparison week', () => {
    // Add a huge session today; it must not flip any completed-week metric.
    const todaySession = session(NOW, 'today', 200, 300, 200)
    const rec = computeRecommendation(
      [...steadyHistory(), ...todaySession],
      LIBRARY,
      settings(),
      1,
      [],
      NOW,
    )
    expect(rec.result?.type).toBe(1)
  })
})
