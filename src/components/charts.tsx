/** One shared chart style (spec 14.5): accent + neutrals, rounded bars,
 *  thin gridlines, readable labels, touch-friendly tooltips. */

import { useState } from 'react'

const W = 340
const H = 190
const PAD = { top: 14, right: 8, bottom: 26, left: 34 }

export interface ChartDatum {
  label: string
  value: number
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const n = v / base
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * base
}

function Ticks(max: number, count = 4): number[] {
  const out: number[] = []
  for (let i = 0; i <= count; i++) out.push((max / count) * i)
  return out
}

function Tooltip({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g>
      <rect
        x={Math.min(Math.max(x - 54, 2), W - 110)}
        y={Math.max(y - 30, 2)}
        width="108"
        height="24"
        rx="8"
        fill="var(--solid-surface-2)"
        stroke="var(--glass-border)"
      />
      <text
        x={Math.min(Math.max(x - 54, 2), W - 110) + 8}
        y={Math.max(y - 30, 2) + 16}
        fontSize="11"
        fill="var(--text-primary)"
      >
        {text.slice(0, 18)}
      </text>
    </g>
  )
}

export function BarChart({ data, unit = '' }: { data: ChartDatum[]; unit?: string }) {
  const [active, setActive] = useState<number | null>(null)
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const bw = data.length > 0 ? (innerW / data.length) * 0.6 : 0
  const gap = data.length > 0 ? innerW / data.length : 0
  const ticks = Ticks(max)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart">
      {ticks.map((t, i) => {
        const y = PAD.top + innerH - (t / max) * innerH
        return (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--glass-border)" strokeWidth="1" />
            <text x={PAD.left - 6} y={y + 3.5} fontSize="9.5" textAnchor="end" fill="var(--text-muted)">
              {Math.round(t * 10) / 10}
            </text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const h = (d.value / max) * innerH
        const x = PAD.left + gap * i + (gap - bw) / 2
        const y = PAD.top + innerH - h
        return (
          <rect
            key={d.label}
            x={x}
            y={y}
            width={bw}
            height={Math.max(h, d.value > 0 ? 2 : 0)}
            rx="5"
            fill={active === i ? 'var(--accent)' : 'var(--accent-soft)'}
            stroke="var(--accent)"
            strokeWidth="1"
            onPointerDown={() => setActive(i === active ? null : i)}
          />
        )
      })}
      {data.map((d, i) => (
        <text
          key={`l-${d.label}`}
          x={PAD.left + gap * i + gap / 2}
          y={H - 8}
          fontSize="9.5"
          textAnchor="middle"
          fill="var(--text-muted)"
        >
          {d.label}
        </text>
      ))}
      {active != null && data[active] && (
        <Tooltip
          x={PAD.left + gap * active + gap / 2}
          y={PAD.top + innerH - (data[active].value / max) * innerH}
          text={`${data[active].label}: ${Math.round(data[active].value * 10) / 10}${unit}`}
        />
      )}
    </svg>
  )
}

export function LineChart({ data, unit = '' }: { data: ChartDatum[]; unit?: string }) {
  const [active, setActive] = useState<number | null>(null)
  const values = data.map((d) => d.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = Math.max(hi - lo, 0.5)
  const max = hi + span * 0.15
  const min = Math.max(0, lo - span * 0.15)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const px = (i: number) => PAD.left + (data.length <= 1 ? innerW / 2 : (innerW / (data.length - 1)) * i)
  const py = (v: number) => PAD.top + innerH - ((v - min) / Math.max(max - min, 0.0001)) * innerH
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(d.value)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Line chart">
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--glass-border)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.25" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle
          key={d.label}
          cx={px(i)}
          cy={py(d.value)}
          r={active === i ? 5 : 3}
          fill="var(--accent)"
          onPointerDown={() => setActive(i === active ? null : i)}
        />
      ))}
      {data.map((d, i) =>
        i % Math.ceil(data.length / 6 || 1) === 0 ? (
          <text key={`l-${d.label}`} x={px(i)} y={H - 8} fontSize="9.5" textAnchor="middle" fill="var(--text-muted)">
            {d.label}
          </text>
        ) : null,
      )}
      {active != null && data[active] && (
        <Tooltip x={px(active)} y={py(data[active].value)} text={`${data[active].label}: ${Math.round(data[active].value * 10) / 10}${unit}`} />
      )}
    </svg>
  )
}
