import { create } from 'zustand'
import { getSupabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  ready: boolean
  /** Idempotent subscription; safe to call from any mount. */
  init(): void
}

let unsubscribe: (() => void) | null = null

export const useAuth = create<AuthState>()((set) => ({
  user: null,
  ready: false,
  init() {
    if (unsubscribe) return
    const supabase = getSupabase()
    if (!supabase) {
      set({ ready: true })
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      set({ user: data.session?.user ?? null, ready: true })
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, ready: true })
    })
    unsubscribe = () => data.subscription.unsubscribe()
  },
}))

/** Absolute URL for email confirmation / reset redirects (spec 12.2). */
export function redirectUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const joined = `${base}${path}`.replace(/\/{2,}/g, '/')
  return `${window.location.origin}${joined}`
}
