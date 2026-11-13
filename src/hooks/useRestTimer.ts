import { useEffect, useState } from 'react'
import { useWorkout } from '../store/workout'
import { formatClock } from '../lib/time'

/**
 * Timestamp-based rest timer display (spec 11.1): remaining time is always
 * computed from the stored end timestamp, never an incrementing counter,
 * so it stays correct when the tab is backgrounded or the app is killed.
 */
export function useRestTimer() {
  const restTimer = useWorkout((s) => s.workout?.restTimer ?? null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!restTimer) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [restTimer?.endsAt, restTimer?.startedAt])

  const remainingSec = restTimer ? Math.max(0, (restTimer.endsAt - now) / 1000) : 0
  const finished = restTimer != null && restTimer.endsAt <= now
  return { restTimer, remainingSec, finished, display: formatClock(remainingSec) }
}

/** Wake Lock where supported, only while the logger is open and visible. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    type Sentinel = { release: () => Promise<void>; released: boolean }
    let sentinel: Sentinel | null = null
    let disposed = false

    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<Sentinel> }
    }

    const request = async () => {
      if (disposed || document.visibilityState !== 'visible') return
      if (!nav.wakeLock || sentinel) return
      try {
        sentinel = await nav.wakeLock.request('screen')
      } catch {
        // Not supported or denied — no-op.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void request()
      } else {
        // The system releases the lock on hide; forget the stale sentinel so
        // the next visible tick can re-acquire.
        sentinel = null
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    void request()
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisible)
      const s = sentinel
      sentinel = null
      try {
        void s?.release?.()
      } catch {
        // ignore
      }
    }
  }, [enabled])
}
