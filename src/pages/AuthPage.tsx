import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, TextInput } from '../components/ui'
import { IconInsights } from '../components/icons'
import { getSupabase } from '../lib/supabase'
import { redirectUrl } from '../hooks/useAuth'

type Mode = 'login' | 'register' | 'reset'

export function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const supabase = getSupabase()
    if (!supabase) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/', { replace: true })
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || undefined },
            emailRedirectTo: redirectUrl('login'),
          },
        })
        if (error) throw error
        setNotice('Check your inbox to confirm your email, then sign in.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl('reset'),
        })
        if (error) throw error
        setNotice('Password reset email sent.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<Mode, string> = {
    login: 'Welcome back',
    register: 'Create your account',
    reset: 'Reset password',
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-accent-glow">
            <IconInsights width={26} height={26} />
          </span>
          <h1 className="text-large-title font-bold">Orbit Lifting</h1>
          <p className="text-caption text-text-muted">
            A calm, mobile-first workout tracker.
          </p>
        </div>

        <form onSubmit={submit} className="glass rounded-hero p-5 shadow-glass-raised">
          <h2 className="mb-4 text-headline font-semibold">{titles[mode]}</h2>

          {mode === 'register' && (
            <label className="mb-3 block text-caption text-text-muted">
              Display name
              <TextInput
                className="mt-1 text-text-primary"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </label>
          )}

          <label className="mb-3 block text-caption text-text-muted">
            Email
            <TextInput
              className="mt-1 text-text-primary"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
            />
          </label>

          {mode !== 'reset' && (
            <label className="mb-4 block text-caption text-text-muted">
              Password
              <TextInput
                className="mt-1 text-text-primary"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
          )}

          {error && <p className="mb-3 text-caption text-[#e5726d]">{error}</p>}
          {notice && <p className="mb-3 text-caption text-accent">{notice}</p>}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
          </Button>

          <div className="mt-4 flex flex-col items-center gap-1.5 text-caption text-text-muted">
            {mode === 'login' && (
              <>
                <span>
                  No account?{' '}
                  <Link to="/register" className="font-medium text-accent">
                    Register
                  </Link>
                </span>
                <Link to="/reset" className="text-text-muted">
                  Forgot password?
                </Link>
              </>
            )}
            {mode !== 'login' && (
              <Link to="/login" className="font-medium text-accent">
                Back to sign in
              </Link>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-text-muted">
          Educational training insights only — not medical or individualized advice.
        </p>
      </div>
    </div>
  )
}
