/** Shared UI primitives built on the design tokens (spec 14.5). */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { create } from 'zustand'
import { IconCheck, IconX } from './icons'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ------------------------------------------------------------------ Button */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonProps) {
  const base =
    'press inline-flex items-center justify-center gap-2 rounded-control font-medium select-none disabled:opacity-50 disabled:pointer-events-none'
  const sizes = {
    sm: 'min-h-[36px] px-3 text-caption',
    md: 'min-h-[44px] px-4 text-body',
    lg: 'min-h-[52px] px-6 text-body',
  }
  const variants = {
    primary: 'bg-accent text-accent-contrast shadow-accent-glow',
    secondary: 'glass text-text-primary',
    ghost: 'text-text-muted hover:text-text-primary',
    danger: 'bg-[#d64545] text-white',
  }
  return <button className={cn(base, sizes[size], variants[variant], className)} {...rest} />
}

/* -------------------------------------------------------------------- Card */

export function Card({
  children,
  className,
  elevated,
}: {
  children: ReactNode
  className?: string
  elevated?: boolean
}) {
  return (
    <section
      className={cn(
        elevated ? 'glass-raised rounded-card shadow-glass-raised' : 'glass rounded-card shadow-glass',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 desktop:px-6 desktop:pt-5">
      <h2 className="text-headline font-semibold">{title}</h2>
      {action}
    </div>
  )
}

/* -------------------------------------------------------------- Segmented */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  ariaLabel?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="glass inline-flex rounded-full p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'press rounded-full font-medium transition-colors',
              size === 'sm' ? 'min-h-[32px] px-2.5 text-caption' : 'min-h-[40px] px-3.5 text-caption',
              active ? 'bg-accent text-accent-contrast' : 'text-text-muted',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------- StepperInput */

export function StepperInput({
  label,
  value,
  onChange,
  onCommit,
  step = 2.5,
  min = 0,
  max = 1000,
  inputMode = 'decimal',
  suffix,
  width = 'w-[76px]',
  ariaLabel,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onCommit?: () => void
  step?: number
  min?: number
  max?: number
  inputMode?: 'decimal' | 'numeric'
  suffix?: string
  width?: string
  ariaLabel?: string
}) {
  const bump = (dir: 1 | -1) => {
    const cur = parseFloat(value)
    const base = Number.isFinite(cur) ? cur : 0
    let next = Math.round((base + dir * step) * 100) / 100
    if (next < min) next = min
    if (next > max) next = max
    onChange(String(next))
    onCommit?.()
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn('flex items-stretch overflow-hidden rounded-control solid', width)}>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => bump(-1)}
          className="w-9 shrink-0 text-lg text-text-muted press"
        >
          −
        </button>
        <input
          className={cn(
            'w-full min-w-0 bg-transparent text-center tabular text-body font-semibold outline-none',
          )}
          value={value}
          inputMode={inputMode}
          pattern={inputMode === 'decimal' ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
          aria-label={ariaLabel ?? label}
          placeholder="0"
          onChange={(e) => onChange(e.target.value.replace(',', '.'))}
          onBlur={onCommit}
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => bump(1)}
          className="w-9 shrink-0 text-lg text-text-muted press"
        >
          +
        </button>
      </div>
      <span className="text-caption text-text-muted">
        {label}
        {suffix ? ` ${suffix}` : ''}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ Input */

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'min-h-[44px] w-full rounded-control glass px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      )}
      {...rest}
    />
  )
}

/* ------------------------------------------------------------------ Sheet */

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
}) {
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    if (!open) setDragY(0)
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-dim"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="glass-sheet absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-hero px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2 shadow-glass-sheet"
        style={{ transform: `translateY(${dragY}px)` }}
      >
        <div
          className="mx-auto mb-2 h-1.5 w-10 cursor-grab rounded-full bg-glass-border"
          onPointerDown={(e) => {
            startY.current = e.clientY
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (startY.current != null) {
              setDragY(Math.max(0, e.clientY - startY.current))
            }
          }}
          onPointerUp={() => {
            if (dragY > 90) onClose()
            else setDragY(0)
            startY.current = null
          }}
          aria-hidden="true"
        />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-headline font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="press p-2 text-text-muted">
            <IconX width={20} height={20} />
          </button>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Toast */

interface ToastState {
  toasts: Array<{ id: number; text: string; action?: { label: string; run: () => void } }>
  push(text: string, action?: { label: string; run: () => void }): void
  dismiss(id: number): void
}

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push(text, action) {
    const id = Date.now() + Math.random()
    set({ toasts: [...get().toasts, { id, text, action }] })
    setTimeout(() => get().dismiss(id), action ? 5000 : 2600)
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
}))

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="glass-raised pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-card px-4 py-3 shadow-glass-raised"
          role="status"
        >
          <span className="flex-1 text-caption">{t.text}</span>
          {t.action && (
            <button
              className="press rounded-full px-3 py-1.5 text-caption font-semibold text-accent"
              onClick={() => {
                t.action?.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          {!t.action && (
            <button
              aria-label="Dismiss"
              className="press p-1 text-text-muted"
              onClick={() => dismiss(t.id)}
            >
              <IconX width={16} height={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-card', className)} />
}

/* ------------------------------------------------------------ EmptyState */

export function EmptyState({
  title,
  body,
  children,
  crab,
}: {
  title: string
  body?: string
  children?: ReactNode
  /** Rare tasteful easter-egg illustration (spec 14.9). */
  crab?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {crab && <CrabDoodle />}
      <h3 className="text-headline font-semibold">{title}</h3>
      {body && <p className="max-w-xs text-caption text-text-muted">{body}</p>}
      {children}
    </div>
  )
}

/** Small original crab illustration for rare empty states (spec 14.9). */
export function CrabDoodle() {
  return (
    <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden="true" className="text-accent">
      <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <ellipse cx="48" cy="38" rx="20" ry="13" />
        <path d="M28 34c-6-2-10-7-9-12 3 1 7 3 10 6" />
        <path d="M68 34c6-2 10-7 9-12-3 1-7 3-10 6" />
        <path d="M36 50c-3 3-7 4-10 3M60 50c3 3 7 4 10 3" />
        <circle cx="42" cy="35" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="54" cy="35" r="1.6" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------------ Modal */

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-dim" onClick={onClose} aria-hidden="true" />
      <div className="glass-sheet relative w-full max-w-md rounded-hero p-5 shadow-glass-sheet">
        <h2 className="mb-3 text-title font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- TabContext */

const FocusRingContext = createContext(false)
export const useInsideFocusRing = () => useContext(FocusRingContext)

export function CheckItem({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full',
          checked ? 'bg-accent text-accent-contrast' : 'glass',
        )}
      >
        {checked && <IconCheck width={12} height={12} />}
      </span>
      <span className="text-caption">{label}</span>
    </div>
  )
}
