import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useWorkout } from '../store/workout'
import { useRestTimer } from '../hooks/useRestTimer'
import {
  IconHome,
  IconHistory,
  IconDumbbell,
  IconInsights,
  IconSettings,
  IconLibrary,
  IconChevronRight,
  IconTimer,
} from './icons'
import { cn } from './ui'

const NAV = [
  { to: '/', label: 'Home', icon: IconHome, match: (p: string) => p === '/' },
  { to: '/history', label: 'History', icon: IconHistory, match: (p: string) => p.startsWith('/history') },
  { to: '/log', label: 'Log', icon: IconDumbbell, match: (p: string) => p.startsWith('/log') },
  { to: '/insights', label: 'Insights', icon: IconInsights, match: (p: string) => p.startsWith('/insights') },
  { to: '/settings', label: 'Settings', icon: IconSettings, match: (p: string) => p.startsWith('/settings') },
]

function NavItem({
  to,
  label,
  icon: Icon,
  active,
  accent,
}: {
  to: string
  label: string
  icon: typeof IconHome
  active: boolean
  accent?: boolean
}) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'press flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5',
        active ? 'bg-accent-soft text-accent' : 'text-text-muted',
        accent && 'flex-none',
      )}
    >
      {accent ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-accent-glow">
          <Icon width={22} height={22} />
        </span>
      ) : (
        <>
          <Icon width={22} height={22} />
          <span className="text-[10px] font-medium">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 md:hidden',
        // Hidden inside the full-screen workout logger (spec 11.1).
        pathname.startsWith('/log') && 'hidden',
      )}
    >
      <div className="mx-auto mb-[max(env(safe-area-inset-bottom),0.5rem)] w-[calc(100%-2rem)] max-w-md">
        <div className="glass flex items-center justify-between gap-1 rounded-full p-1.5 shadow-glass-raised">
          {NAV.slice(0, 2).map((n) => (
            <NavItem key={n.to} {...n} active={n.match(pathname)} />
          ))}
          <NavItem to="/log" label="Log" icon={IconDumbbell} accent active={false} />
          {NAV.slice(3).map((n) => (
            <NavItem key={n.to} {...n} active={n.match(pathname)} />
          ))}
        </div>
      </div>
    </nav>
  )
}

export function Sidebar() {
  const { pathname } = useLocation()
  const items = [...NAV.slice(0, 2), NAV[3], NAV[4], { to: '/exercises', label: 'Exercises', icon: IconLibrary, match: (p: string) => p.startsWith('/exercises') }]
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col p-4 md:flex">
      <div className="glass flex h-full flex-col rounded-card p-3 shadow-glass">
        <div className="mb-6 flex items-center gap-2 px-2 pt-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-contrast">
            <IconInsights width={20} height={20} />
          </span>
          <span className="text-headline font-semibold">Orbit Lifting</span>
        </div>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
          {items.map((n) => (
            <NavItem
              key={n.to}
              to={n.to}
              label={n.label}
              icon={n.icon}
              active={n.match(pathname)}
            />
          ))}
        </nav>
        <p className="px-2 text-[10px] leading-relaxed text-text-muted">
          Educational training insights only — not medical advice.
        </p>
      </div>
    </aside>
  )
}

/** Floating mini-bar during an active workout (spec 14.5). */
export function FloatingMiniBar() {
  const workout = useWorkout((s) => s.workout)
  const { pathname } = useLocation()
  const { remainingSec, restTimer } = useRestTimer()
  if (!workout || pathname.startsWith('/log')) return null
  if (workout.finishedAt) return null
  const current = workout.exercises[workout.currentExerciseIndex]
  return (
    <NavLink
      to="/log"
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-full glass-raised px-4 py-2.5 shadow-glass-raised md:left-60"
      aria-label="Return to the active workout"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-contrast">
        <IconDumbbell width={18} height={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-semibold">
          {current?.name ?? 'Active workout'}
        </span>
        <span className="block text-[11px] text-text-muted">
          {restTimer && remainingSec > 0 ? `Rest ${remainingSec.toFixed(0)}s left` : 'Workout in progress'}
        </span>
      </span>
      {restTimer && remainingSec > 0 && (
        <span className="flex items-center gap-1 text-caption tabular text-accent">
          <IconTimer width={14} height={14} />
          {new Date(remainingSec * 1000).toISOString().slice(14, 19)}
        </span>
      )}
      <IconChevronRight width={18} height={18} className="text-text-muted" />
    </NavLink>
  )
}

export function AppShell() {
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <main className="mx-auto w-full max-w-xl px-4 pb-[calc(env(safe-area-inset-bottom)+118px)] pt-[calc(env(safe-area-inset-top)+1rem)] md:pl-[17rem] md:pr-6 desktop:max-w-6xl desktop:px-6">
        <div className="desktop:mx-auto desktop:max-w-5xl">
          <Outlet />
        </div>
      </main>
      <BottomNav />
      <FloatingMiniBar />
    </div>
  )
}
