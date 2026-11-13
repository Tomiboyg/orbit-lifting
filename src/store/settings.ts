import { create } from 'zustand'
import { getSupabase } from '../lib/supabase'

/** Recommendation + logging configuration (spec 10.10, 10.6, 10.4). */

export type RangeBound = number | ''

export interface RecommendationSettings {
  enabled: boolean
  /** Analysis window: last N completed weeks (2–8, default 4). */
  windowWeeks: number
  /** Minimum completed weeks with enough workouts for types 1–4 (default 3). */
  minWeeks: number
  /** Minimum workouts per completed week (default 2). */
  minWorkoutsPerWeek: number
  /** Volume change considered "meaningful" between window halves (%). */
  volumeChangePct: number
  /** Performance changes inside this band count as "stable" (%). */
  stablePct: number
  /** If more than (1 - rpeCoverageMin) of counted sets lack RPE, RPE is excluded. */
  rpeCoverageMin: number
  /** Dismissal cooldown in weeks (default 2). */
  cooldownWeeks: number
  secondaryWeight: number
  countDrop: boolean
  countFailure: boolean
  showReferenceRanges: boolean
  /** Commonly cited weekly set ranges per muscle — optional, off, user-editable. */
  referenceRanges: Record<string, [RangeBound, RangeBound]>
}

export interface AppSettings {
  /** 0 = Sunday, 1 = Monday (default), … (spec 10.2). */
  weekStartDay: number
  defaultRestSec: number
  recommendations: RecommendationSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  weekStartDay: 1,
  defaultRestSec: 120,
  recommendations: {
    enabled: false,
    windowWeeks: 4,
    minWeeks: 3,
    minWorkoutsPerWeek: 2,
    volumeChangePct: 25,
    stablePct: 10,
    rpeCoverageMin: 0.7,
    cooldownWeeks: 2,
    secondaryWeight: 0.5,
    countDrop: true,
    countFailure: true,
    showReferenceRanges: false,
    referenceRanges: {},
  },
}

const STORAGE_KEY = 'orbit.settings'

function deepMergeSettings(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...base,
    ...patch,
    recommendations: { ...base.recommendations, ...(patch.recommendations ?? {}) },
  }
}

function sanitize(s: AppSettings): AppSettings {
  const r = { ...DEFAULT_SETTINGS.recommendations, ...s.recommendations }
  return {
    weekStartDay: Math.min(6, Math.max(0, Math.round(s.weekStartDay))),
    defaultRestSec: Math.min(600, Math.max(15, Math.round(s.defaultRestSec))),
    recommendations: {
      ...r,
      windowWeeks: Math.min(8, Math.max(2, Math.round(r.windowWeeks))),
      minWeeks: Math.min(8, Math.max(1, Math.round(r.minWeeks))),
      minWorkoutsPerWeek: Math.min(7, Math.max(1, Math.round(r.minWorkoutsPerWeek))),
      volumeChangePct: Math.min(100, Math.max(5, Math.round(r.volumeChangePct))),
      stablePct: Math.min(50, Math.max(1, Math.round(r.stablePct))),
      rpeCoverageMin: Math.min(1, Math.max(0.1, r.rpeCoverageMin)),
      cooldownWeeks: Math.min(26, Math.max(1, Math.round(r.cooldownWeeks))),
      secondaryWeight: Math.min(1, Math.max(0, r.secondaryWeight)),
      referenceRanges: r.referenceRanges ?? {},
    },
  }
}

interface SettingsState {
  settings: AppSettings
  loadedFromRemote: boolean
  load(): void
  pullRemote(): Promise<void>
  update(patch: Partial<AppSettings>): void
  updateRecommendations(patch: Partial<RecommendationSettings>): void
  resetRecommendations(): void
}

async function pushRemote(settings: AppSettings): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return
  await supabase
    .from('user_settings')
    .upsert({ user_id: userId, settings, updated_at: new Date().toISOString() })
}

export const useSettings = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loadedFromRemote: false,

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppSettings>
        set({ settings: sanitize(deepMergeSettings(DEFAULT_SETTINGS, parsed)) })
      }
    } catch {
      // corrupt settings fall back to defaults
    }
  },

  async pullRemote() {
    const supabase = getSupabase()
    if (!supabase || get().loadedFromRemote) return
    set({ loadedFromRemote: true })
    try {
      const { data } = await supabase.from('user_settings').select('settings').maybeSingle()
      const remote = data?.settings as Partial<AppSettings> | null
      if (remote) {
        const merged = sanitize(deepMergeSettings(get().settings, remote))
        set({ settings: merged })
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      }
    } catch {
      // offline: local settings stay in charge
    }
  },

  update(patch) {
    const next = sanitize(deepMergeSettings(get().settings, patch))
    set({ settings: next })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    void pushRemote(next)
  },

  updateRecommendations(patch) {
    get().update({ recommendations: { ...get().settings.recommendations, ...patch } })
  },

  resetRecommendations() {
    get().update({ recommendations: { ...DEFAULT_SETTINGS.recommendations } })
  },
}))
