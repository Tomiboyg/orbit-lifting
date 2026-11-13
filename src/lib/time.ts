/** Local-timezone week math (spec 10.2: weeks are computed in the user's timezone). */

export const MS_DAY = 24 * 60 * 60 * 1000

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Start of the week containing `ts`, given the user's week start day
 * (0 = Sunday, 1 = Monday, per profiles.week_start_day).
 */
export function weekStartOf(ts: number, weekStartDay: number): number {
  const d = new Date(startOfDay(ts))
  const dow = d.getDay() // 0..6, Sunday = 0
  const diff = (dow - weekStartDay + 7) % 7
  d.setDate(d.getDate() - diff)
  return d.getTime()
}

export interface WeekSpan {
  start: number
  end: number // exclusive
}

/**
 * The last `count` completed weeks, oldest first. The current (in-progress)
 * week is never included (spec 10.2).
 */
export function lastCompletedWeeks(
  now: number,
  weekStartDay: number,
  count: number,
): WeekSpan[] {
  const current = weekStartOf(now, weekStartDay)
  const spans: WeekSpan[] = []
  for (let i = 1; i <= count; i++) {
    spans.push({ start: current - i * 7 * MS_DAY, end: current - (i - 1) * 7 * MS_DAY })
  }
  return spans.reverse()
}

export function currentWeekStart(now: number, weekStartDay: number): number {
  return weekStartOf(now, weekStartDay)
}

/** Elapsed ms between two timestamps, floored at 0. */
export function elapsedMs(start: number, now: number): number {
  return Math.max(0, now - start)
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatDay(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b)
}
