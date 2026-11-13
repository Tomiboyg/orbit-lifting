/** Environment access. Anything prefixed VITE_ is public in the bundle. */

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined

/** True only when both env vars are present at build time. */
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseUrl.length > 0 && supabaseAnonKey.length > 0,
)
