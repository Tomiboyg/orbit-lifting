import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from './components/nav'
import { ToastHost } from './components/ui'
import { useTheme } from './store/theme'
import { useSettings } from './store/settings'
import { useWorkout } from './store/workout'
import { useAuth } from './hooks/useAuth'
import { isSupabaseConfigured } from './lib/env'
import { SetupRequired } from './pages/SetupRequired'
import { AuthPage } from './pages/AuthPage'
import { Dashboard } from './pages/Dashboard'
import { Logger } from './pages/Logger'
import { History } from './pages/History'
import { HistoryDetail } from './pages/HistoryDetail'
import { Insights } from './pages/Insights'
import { Exercises } from './pages/Exercises'
import { Settings } from './pages/Settings'
import { NotFound } from './pages/NotFound'
import { Splash } from './pages/Splash'

/** Registration and login are required — no guest mode (spec 12.2). */
function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user)
  const ready = useAuth((s) => s.ready)
  const hydrated = useWorkout((s) => s.hydrated)
  const hasActive = useWorkout((s) => !!s.workout)
  const location = useLocation()
  if (!ready || !hydrated) return <Splash />
  if (!user && !hasActive) {
    // Restore must not depend on a valid session (spec 11.5): an active
    // workout opens even with an expired session.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}

export default function App() {
  const navigate = useNavigate()

  useEffect(() => {
    useTheme.getState().init()
    useSettings.getState().load()
    void useAuth.getState().init()
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      const base = import.meta.env.BASE_URL || '/'
      navigator.serviceWorker.register(`${base}sw.js`).catch(() => undefined)
    }

    // Restore on launch (spec 11.5): before the home screen shows, check
    // IndexedDB for an active workout and route straight into the logger.
    void (async () => {
      await useWorkout.getState().hydrate()
      const w = useWorkout.getState().workout
      if (w && !w.finishedAt) navigate('/log', { replace: true })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isSupabaseConfigured) {
    return (
      <>
        <SetupRequired />
        <ToastHost />
      </>
    )
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/reset" element={<AuthPage mode="reset" />} />

        <Route element={<AppShell />}>
          <Route
            path="/"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/log"
            element={
              <RequireAuth>
                <Logger />
              </RequireAuth>
            }
          />
          <Route
            path="/history"
            element={
              <RequireAuth>
                <History />
              </RequireAuth>
            }
          />
          <Route
            path="/history/:id"
            element={
              <RequireAuth>
                <HistoryDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/insights"
            element={
              <RequireAuth>
                <Insights />
              </RequireAuth>
            }
          />
          <Route
            path="/exercises"
            element={
              <RequireAuth>
                <Exercises />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            }
          />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      <ToastHost />
    </>
  )
}
