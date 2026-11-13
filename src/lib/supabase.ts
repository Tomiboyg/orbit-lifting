import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl, isSupabaseConfigured } from './env'

let client: SupabaseClient | null = null

/**
 * Returns the Supabase client, or null when env vars are missing.
 * The app must stay usable offline / unconfigured (local-first, spec 11.5).
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!client) {
    client = createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        // PKCE so auth tokens never collide with routing (spec 12.1).
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
