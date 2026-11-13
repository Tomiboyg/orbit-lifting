/**
 * Current weekly recommendation: compute → cache per week → expose dismiss.
 * History and dismissal state also land in the `recommendations` table
 * when online (spec 10.9).
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { useSettings } from '../store/settings'
import { getSupabase } from '../lib/supabase'
import { fetchExerciseLibrary, fetchSetsSince } from '../lib/history'
import { FALLBACK_EXERCISES } from '../lib/exercises'
import type { ExerciseDef, MuscleGroup } from '../types'
import { lastCompletedWeeks, weekStartOf, type WeekSpan } from '../lib/time'
import { computeRecommendation, type ComputedRecommendation, type DismissalRecord } from '../features/recommendations/engine'
import type { RuleResult } from '../features/recommendations/rules'
import type { RecommendationSettings } from '../store/settings'

export interface StoredRec {
  weekStart: number
  generatedAt: number
  result: RuleResult | null
  suppressed: boolean
  dismissed: { at: number; reason: string } | null
}

const LS_KEY = 'orbit.recommendation.current'
const LS_DISMISSALS = 'orbit.recommendation.dismissals'

function loadStored(): StoredRec | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as StoredRec) : null
  } catch {
    return null
  }
}

function saveStored(rec: StoredRec): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rec))
  } catch {
    // ignore
  }
}

function loadDismissals(): DismissalRecord[] {
  try {
    const raw = localStorage.getItem(LS_DISMISSALS)
    return raw ? (JSON.parse(raw) as DismissalRecord[]) : []
  } catch {
    return []
  }
}

function toExerciseDef(rows: Awaited<ReturnType<typeof fetchExerciseLibrary>>): ExerciseDef[] {
  if (rows.length === 0) return FALLBACK_EXERCISES
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    primary: (r.primary_muscles ?? []) as MuscleGroup[],
    secondary: (r.secondary_muscles ?? []) as MuscleGroup[],
    secondaryWeight: r.secondary_weight ?? 0.5,
    isCustom: false,
  }))
}

async function persistDismissalRemote(rec: StoredRec): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return
  try {
    const weekStartIso = new Date(rec.weekStart).toISOString().slice(0, 10)
    const { data: existing } = await supabase
      .from('recommendations')
      .select('id')
      .eq('user_id', userId)
      .eq('week_start', weekStartIso)
      .maybeSingle()
    const patch = {
      status: 'dismissed' as const,
      dismissed_at: new Date(rec.dismissed?.at ?? Date.now()).toISOString(),
      dismiss_reason: rec.dismissed?.reason ?? null,
    }
    if (existing) {
      await supabase.from('recommendations').update(patch).eq('id', existing.id)
    } else {
      await supabase.from('recommendations').insert({
        user_id: userId,
        week_start: weekStartIso,
        type: rec.result?.type ?? 5,
        rule_id: rec.result?.ruleId ?? 'none',
        rule_version: rec.result?.ruleVersion ?? 1,
        inputs: { metrics: rec.result?.metrics ?? [] },
        thresholds: {},
        explanation: rec.result ? `${rec.result.headline}. ${rec.result.body}` : '',
        ...patch,
      })
    }
  } catch {
    // offline: the local cooldown still applies
  }
}

async function persistGeneratedRemote(rec: StoredRec, settings: RecommendationSettings): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return
  try {
    const weekStartIso = new Date(rec.weekStart).toISOString().slice(0, 10)
    const { data: existing } = await supabase
      .from('recommendations')
      .select('id')
      .eq('user_id', userId)
      .eq('week_start', weekStartIso)
      .maybeSingle()
    if (existing) return
    await supabase.from('recommendations').insert({
      user_id: userId,
      week_start: weekStartIso,
      type: rec.result?.type ?? 5,
      rule_id: rec.result?.ruleId ?? 'none',
      rule_version: rec.result?.ruleVersion ?? 1,
      inputs: { metrics: rec.result?.metrics ?? [] },
      thresholds: {
        windowWeeks: settings.windowWeeks,
        minWeeks: settings.minWeeks,
        minWorkoutsPerWeek: settings.minWorkoutsPerWeek,
        volumeChangePct: settings.volumeChangePct,
        stablePct: settings.stablePct,
        rpeCoverageMin: settings.rpeCoverageMin,
      },
      explanation: rec.result ? `${rec.result.headline}. ${rec.result.body}` : 'Insufficient data for a recommendation.',
      status: 'active',
    })
  } catch {
    // offline: the local cache still holds the state
  }
}

export function useRecommendation() {
  const user = useAuth((s) => s.user)
  const settings = useSettings((s) => s.settings)
  const [rec, setRec] = useState<StoredRec | null>(loadStored)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const now = Date.now()
      const weekStart = weekStartOf(now, settings.weekStartDay)
      const stored = loadStored()
      if (stored && stored.weekStart === weekStart && !stored.dismissed) {
        if (!cancelled) {
          setRec(stored)
          setLoading(false)
        }
        return
      }
      // (Re)compute for this week.
      const lib = toExerciseDef(await fetchExerciseLibrary())
      const spans: WeekSpan[] = lastCompletedWeeks(now, settings.weekStartDay, settings.recommendations.windowWeeks)
      const sets = await fetchSetsSince(spans[0]?.start ?? now - 56 * 86400000)
      const dismissals = loadDismissals()
      const computed: ComputedRecommendation = computeRecommendation(
        sets,
        lib,
        settings.recommendations,
        settings.weekStartDay,
        dismissals,
        now,
      )
      const next: StoredRec = {
        weekStart,
        generatedAt: now,
        result: computed.result,
        suppressed: computed.suppressedByDismissal,
        dismissed: stored?.weekStart === weekStart ? (stored.dismissed ?? null) : null,
      }
      saveStored(next)
      void persistGeneratedRemote(next, settings.recommendations)
      if (!cancelled) {
        setRec(next)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, settings.weekStartDay, settings.recommendations.windowWeeks, settings.recommendations.enabled])

  const dismiss = useCallback((reason: string) => {
    const cur = loadStored()
    if (!cur) return
    const next: StoredRec = { ...cur, dismissed: { at: Date.now(), reason } }
    saveStored(next)
    // Cooldown record (spec 10.9).
    const dismissals = [
      ...loadDismissals(),
      {
        type: next.result?.type ?? 5,
        ruleId: next.result?.ruleId ?? 'none',
        weekStart: next.weekStart,
        dismissedAt: next.dismissed.at,
      },
    ]
    try {
      localStorage.setItem(LS_DISMISSALS, JSON.stringify(dismissals))
    } catch {
      // ignore
    }
    void persistDismissalRemote(next)
    setRec(next)
  }, [])

  const refresh = useCallback(async () => {
    const now = Date.now()
    const lib = toExerciseDef(await fetchExerciseLibrary())
    const spans: WeekSpan[] = lastCompletedWeeks(now, settings.weekStartDay, settings.recommendations.windowWeeks)
    const sets = await fetchSetsSince(spans[0]?.start ?? now - 56 * 86400000)
    const computed = computeRecommendation(sets, lib, settings.recommendations, settings.weekStartDay, loadDismissals(), now)
    const next: StoredRec = {
      weekStart: weekStartOf(now, settings.weekStartDay),
      generatedAt: now,
      result: computed.result,
      suppressed: computed.suppressedByDismissal,
      dismissed: loadStored()?.dismissed ?? null,
    }
    saveStored(next)
    void persistGeneratedRemote(next, settings.recommendations)
    setRec(next)
  }, [settings])

  return { rec, loading, dismiss, refresh }
}
