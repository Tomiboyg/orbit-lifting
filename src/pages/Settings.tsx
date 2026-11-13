import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardHeader, Modal, Segmented, TextInput, useToasts, cn } from '../components/ui'
import { useTheme, COLOURWAYS, COLOURWAY_LABELS, type Colourway } from '../store/theme'
import { useSettings } from '../store/settings'
import { useAuth } from '../hooks/useAuth'
import { getSupabase } from '../lib/supabase'
import { exportData, downloadFile } from '../lib/export'
import { requestPersistentStorage } from '../lib/idb'
import { MUSCLE_GROUPS } from '../types'

export function Settings() {
  const navigate = useNavigate()
  const theme = useTheme()
  const settings = useSettings((s) => s.settings)
  const updateSettings = useSettings((s) => s.update)
  const updateRec = useSettings((s) => s.updateRecommendations)
  const resetRec = useSettings((s) => s.resetRecommendations)
  const user = useAuth((s) => s.user)
  const push = useToasts((s) => s.push)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    void navigator.storage?.persisted?.().then((v) => setPersisted(v)).catch(() => undefined)
  }, [])

  const rec = settings.recommendations

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-large-title font-bold">Settings</h1>
        <p className="text-caption text-text-muted">
          {user?.email ?? 'Not signed in'}
        </p>
      </header>

      {/* Appearance (spec 14.2, 11.3) */}
      <Card>
        <CardHeader title="Appearance" />
        <div className="flex flex-col gap-4 px-4 py-4 desktop:px-6">
          <Row label="Theme" description="Light, dark, or follow the system.">
            <Segmented
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'auto', label: 'Auto' },
              ]}
              value={theme.mode}
              onChange={theme.setMode}
            />
          </Row>
          <Row label="Colourway" description="One accent per colourway, in both modes.">
            <div className="flex gap-2">
              {COLOURWAYS.map((c: Colourway) => (
                <button
                  key={c}
                  aria-label={COLOURWAY_LABELS[c]}
                  aria-pressed={theme.colourway === c}
                  onClick={() => theme.setColourway(c)}
                  className={cn(
                    'press h-9 w-9 rounded-full border',
                    theme.colourway === c ? 'border-accent border-2' : 'border-transparent',
                  )}
                  style={{ background: COLOURWAY_DOT[c] }}
                />
              ))}
            </div>
          </Row>
          <Row
            label="Reduce transparency"
            description="Glass becomes solid surfaces. Also respects the system reduced-transparency setting."
          >
            <Segmented
              options={[
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
              value={theme.reduceTransparency ? 'on' : 'off'}
              onChange={(v) => theme.setReduceTransparency(v === 'on')}
            />
          </Row>
        </div>
      </Card>

      {/* Logging */}
      <Card>
        <CardHeader title="Logging" />
        <div className="flex flex-col gap-4 px-4 py-4 desktop:px-6">
          <Row label="Week starts on" description="Used for weekly volume and completed-week comparisons.">
            <Segmented
              size="sm"
              options={[
                { value: 1, label: 'Monday' },
                { value: 0, label: 'Sunday' },
                { value: 6, label: 'Saturday' },
              ]}
              value={settings.weekStartDay}
              onChange={(v) => updateSettings({ weekStartDay: v })}
            />
          </Row>
          <Row label="Default rest" description="Rest timer length started after each working set.">
            <Segmented
              size="sm"
              options={[
                { value: 60, label: '1 min' },
                { value: 90, label: '1:30' },
                { value: 120, label: '2 min' },
                { value: 180, label: '3 min' },
              ]}
              value={settings.defaultRestSec}
              onChange={(v) => updateSettings({ defaultRestSec: v })}
            />
          </Row>
          <Row
            label="Volume counting"
            description="Warm-ups never count. Weighted sets = primary muscles ×1.0 + secondary muscles × weight."
          >
            <div className="flex flex-col gap-2">
              <Toggle
                label="Count drop sets"
                value={rec.countDrop}
                onChange={(v) => updateRec({ countDrop: v })}
              />
              <Toggle
                label="Count failure sets"
                value={rec.countFailure}
                onChange={(v) => updateRec({ countFailure: v })}
              />
            </div>
          </Row>
          <Row label="Secondary muscle weight" description="How much secondary muscles add to weighted volume.">
            <Segmented
              size="sm"
              options={[
                { value: 0, label: '0' },
                { value: 0.25, label: '¼' },
                { value: 0.5, label: '½' },
                { value: 0.75, label: '¾' },
              ]}
              value={rec.secondaryWeight}
              onChange={(v) => updateRec({ secondaryWeight: v })}
            />
          </Row>
        </div>
      </Card>

      {/* Recommendations (spec 10.10) */}
      <Card>
        <CardHeader
          title="Recommendations"
          action={
            <Button size="sm" variant="ghost" onClick={() => { resetRec(); push('Recommendation settings reset to defaults') }}>
              Reset to defaults
            </Button>
          }
        />
        <div className="flex flex-col gap-4 px-4 py-4 desktop:px-6">
          <Toggle
            label="Enable weekly insights"
            description="Rule-based and deterministic — no ML, and nothing is changed automatically."
            value={rec.enabled}
            onChange={(v) => updateRec({ enabled: v })}
          />
          <Row label="Analysis window" description={`Last ${rec.windowWeeks} completed weeks are analyzed. The current week is shown as in progress.`}>
            <NumberStepper
              value={rec.windowWeeks}
              min={2}
              max={8}
              onChange={(v) => updateRec({ windowWeeks: v })}
            />
          </Row>
          <Row label="Minimum weeks with data" description="Fewer completed weeks than this → insight says 'insufficient data'.">
            <NumberStepper value={rec.minWeeks} min={1} max={8} onChange={(v) => updateRec({ minWeeks: v })} />
          </Row>
          <Row label="Minimum workouts per week" description="A completed week only counts when it has at least this many workouts.">
            <NumberStepper value={rec.minWorkoutsPerWeek} min={1} max={7} onChange={(v) => updateRec({ minWorkoutsPerWeek: v })} />
          </Row>
          <Row label="Volume change threshold" description={`Weekly volume changes beyond ±${rec.volumeChangePct}% are flagged.`}>
            <NumberStepper value={rec.volumeChangePct} min={5} max={100} step={5} onChange={(v) => updateRec({ volumeChangePct: v })} />
          </Row>
          <Row label="Performance stability band" description={`Performance changes within ±${rec.stablePct}% count as stable.`}>
            <NumberStepper value={rec.stablePct} min={1} max={50} step={1} onChange={(v) => updateRec({ stablePct: v })} />
          </Row>
          <Row label="RPE coverage minimum" description={`RPE is excluded from insights when more than ${Math.round((1 - rec.rpeCoverageMin) * 100)}% of counted sets lack it.`}>
            <Segmented
              size="sm"
              options={[
                { value: 0.5, label: '50%' },
                { value: 0.7, label: '70%' },
                { value: 0.85, label: '85%' },
              ]}
              value={rec.rpeCoverageMin}
              onChange={(v) => updateRec({ rpeCoverageMin: v })}
            />
          </Row>
          <Row label="Dismissal cooldown" description="A dismissed insight of the same type and rule stays hidden for this many weeks.">
            <NumberStepper value={rec.cooldownWeeks} min={1} max={26} onChange={(v) => updateRec({ cooldownWeeks: v })} />
          </Row>
          <Row
            label="Reference ranges"
            description="Optional, off by default. Labelled 'commonly cited ranges, not personal requirements'. Fully editable."
          >
            <Toggle
              label="Show reference ranges"
              value={rec.showReferenceRanges}
              onChange={(v) => updateRec({ showReferenceRanges: v })}
            />
          </Row>
          {rec.showReferenceRanges && (
            <div className="rounded-control glass p-3">
              <p className="mb-2 text-[11px] text-text-muted">
                Commonly cited ranges, not personal requirements. Edit freely — empty means hidden.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {MUSCLE_GROUPS.map((m) => {
                  const range = rec.referenceRanges[m] ?? ['', '']
                  return (
                    <div key={m} className="flex items-center gap-1.5">
                      <span className="w-20 shrink-0 text-caption capitalize text-text-muted">{m}</span>
                      <TextInput
                        className="h-9 w-full px-2 text-center text-caption tabular"
                        inputMode="numeric"
                        placeholder="min"
                        value={String(range[0] ?? '')}
                        aria-label={`${m} minimum`}
                        onChange={(e) => {
                          const min = e.target.value === '' ? '' : Number(e.target.value)
                          updateRec({
                            referenceRanges: { ...rec.referenceRanges, [m]: [min, range[1] ?? ''] },
                          })
                        }}
                      />
                      <TextInput
                        className="h-9 w-full px-2 text-center text-caption tabular"
                        inputMode="numeric"
                        placeholder="max"
                        value={String(range[1] ?? '')}
                        aria-label={`${m} maximum`}
                        onChange={(e) => {
                          const max = e.target.value === '' ? '' : Number(e.target.value)
                          updateRec({
                            referenceRanges: { ...rec.referenceRanges, [m]: [range[0] ?? '', max] },
                          })
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Data ownership (spec 12.6) */}
      <Card>
        <CardHeader title="Your data" />
        <div className="flex flex-col gap-3 px-4 py-4 desktop:px-6">
          <p className="text-caption text-text-muted">
            Device storage persistence:{' '}
            {persisted == null ? 'checking…' : persisted ? 'granted' : 'not granted'}
            {persisted === false && (
              <>
                {' — '}
                <button
                  className="font-medium text-accent"
                  onClick={() =>
                    void requestPersistentStorage().then((v) => {
                      setPersisted(v)
                      push(v ? 'Storage persistence granted' : 'The browser declined for now')
                    })
                  }
                >
                  request it
                </button>
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                const { json, csv } = await exportData()
                downloadFile(`orbit-lifting-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json')
                downloadFile(`orbit-lifting-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv')
                push('Export downloaded')
              }}
            >
              Export all data (CSV + JSON)
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const supabase = getSupabase()
                if (supabase) await supabase.auth.signOut()
                navigate('/login')
              }}
            >
              Sign out
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete account data
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-text-muted">
            Deleting removes every row you own (workouts, sets, custom exercises, settings,
            recommendation history) from Supabase. Deleting the authentication account itself
            requires the dashboard or a support request — see the README.
          </p>
        </div>
      </Card>

      <p className="px-2 text-center text-[11px] text-text-muted">
        Orbit Lifting · Educational training insights only — not medical or individualized advice.
      </p>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete all account data?">
        <p className="text-body text-text-muted">
          This permanently deletes your workouts, sets, custom exercises, settings and recommendation
          history. Export first if you want a copy.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => void deleteAllData(push, navigate)}>
            Delete everything
          </Button>
        </div>
      </Modal>
    </div>
  )
}

const COLOURWAY_DOT: Record<Colourway, string> = {
  graphite: 'linear-gradient(135deg,#9db1ff,#4353d9)',
  ocean: 'linear-gradient(135deg,#4fc7e8,#0b7d9c)',
  aurora: 'linear-gradient(135deg,#43d9a5,#0f8f66)',
  ember: 'linear-gradient(135deg,#ffa666,#c94f0a)',
  sakura: 'linear-gradient(135deg,#ff9ec6,#c04a77)',
}

function Row({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 sm:max-w-[55%]">
        <p className="text-body font-medium">{label}</p>
        {description && <p className="text-caption text-text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-body font-medium">{label}</p>
        {description && <p className="text-caption text-text-muted">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={cn(
          'press relative h-7 w-12 shrink-0 rounded-full transition-colors',
          value ? 'bg-accent' : 'glass',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all',
            value ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  )
}

function NumberStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className="glass inline-flex items-center rounded-full p-0.5">
      <button
        className="press h-9 w-9 rounded-full text-text-muted"
        aria-label="Decrease"
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </button>
      <span className="w-10 text-center text-body font-semibold tabular">{value}</span>
      <button
        className="press h-9 w-9 rounded-full text-text-muted"
        aria-label="Increase"
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </button>
    </div>
  )
}

async function deleteAllData(push: (t: string) => void, navigate: ReturnType<typeof useNavigate>) {
  const supabase = getSupabase()
  if (!supabase) return
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return
  const tables = ['sets', 'workout_exercises', 'workouts', 'routines', 'exercises', 'recommendations', 'user_settings', 'profiles']
  for (const t of tables) {
    await supabase.from(t).delete().eq(t === 'profiles' || t === 'user_settings' ? 'id' : 'user_id', userId)
  }
  push('All account data deleted')
  await supabase.auth.signOut()
  navigate('/login')
}
