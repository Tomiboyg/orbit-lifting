import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Segmented, Sheet, TextInput, useToasts } from '../components/ui'
import { IconPlus, IconSearch, IconTrash } from '../components/icons'
import { fetchExerciseLibrary, insertCustomExercise } from '../lib/history'
import { FALLBACK_EXERCISES } from '../lib/exercises'
import { MUSCLE_GROUPS, type MuscleGroup } from '../types'

interface Row {
  id: string | null
  name: string
  category: string | null
  primary: string[]
  secondary: string[]
  secondaryWeight: number
  isCustom: boolean
}

export function Exercises() {
  const [rows, setRows] = useState<Row[]>(
    FALLBACK_EXERCISES.map((e) => ({ ...e, isCustom: false })),
  )
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'custom'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const push = useToasts((s) => s.push)

  const reload = async () => {
    const data = await fetchExerciseLibrary()
    if (data.length > 0) {
      setRows(
        data.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          primary: r.primary_muscles ?? [],
          secondary: r.secondary_muscles ?? [],
          secondaryWeight: r.secondary_weight ?? 0.5,
          isCustom: r.user_id != null,
        })),
      )
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (filter === 'all' || r.isCustom) &&
        (q === '' || r.name.toLowerCase().includes(q) || (r.primary.join(',') + r.secondary.join(',')).includes(q)),
    )
  }, [rows, query, filter])

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-large-title font-bold">Exercises</h1>
          <p className="text-caption text-text-muted">
            Global library plus your custom entries. Muscles drive volume maths.
          </p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} aria-label="Add custom exercise">
          <IconPlus width={18} height={18} />
        </Button>
      </header>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <IconSearch
            width={18}
            height={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <TextInput
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
            aria-label="Search exercises"
          />
        </div>
        <Segmented
          size="sm"
          options={[
            { value: 'all', label: 'All' },
            { value: 'custom', label: 'Mine' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      <ul className="flex flex-col gap-2">
        {filtered.map((r) => (
          <li key={`${r.id ?? r.name}-${r.isCustom}`}>
            <Card className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium">{r.name}</span>
                <span className="block text-caption text-text-muted">
                  {r.category ? `${r.category} · ` : ''}
                  {r.primary.join(', ') || 'no primary muscle'}
                  {r.secondary.length > 0 ? ` + ${r.secondary.join(', ')} (×${r.secondaryWeight})` : ''}
                </span>
              </span>
              {r.isCustom && (
                <button
                  aria-label={`Delete ${r.name}`}
                  className="press flex h-9 w-9 items-center justify-center rounded-full text-text-muted"
                  onClick={async () => {
                    // Deleting via the API keeps ownership rules (user-owned only).
                    const { getSupabase } = await import('../lib/supabase')
                    const supabase = getSupabase()
                    if (!supabase || r.id == null) return
                    const { error } = await supabase.from('exercises').delete().eq('id', r.id)
                    if (error) push('Deleting needs a connection')
                    else {
                      push('Exercise deleted')
                      void reload()
                    }
                  }}
                >
                  <IconTrash width={16} height={16} />
                </button>
              )}
            </Card>
          </li>
        ))}
        {filtered.length === 0 && (
          <Card className="px-4 py-8 text-center text-caption text-text-muted">
            Nothing matches. You can add a custom exercise.
          </Card>
        )}
      </ul>

      <AddCustomSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={async () => {
          await reload()
          push('Custom exercise added')
        }}
      />
    </div>
  )
}

function AddCustomSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [primary, setPrimary] = useState<string[]>([])
  const [secondary, setSecondary] = useState<string[]>([])
  const [secondaryWeight, setSecondaryWeight] = useState(0.5)
  const [busy, setBusy] = useState(false)
  const push = useToasts((s) => s.push)

  const toggle = (list: string[], setList: (v: string[]) => void, m: string) => {
    setList(list.includes(m) ? list.filter((x) => x !== m) : [...list, m])
  }

  const create = async () => {
    if (!name.trim() || primary.length === 0) {
      push('Give it a name and at least one primary muscle')
      return
    }
    setBusy(true)
    await insertCustomExercise({
      name: name.trim(),
      category: category.trim() || null,
      primary,
      secondary,
      secondaryWeight,
    })
    setBusy(false)
    setName('')
    setCategory('')
    setPrimary([])
    setSecondary([])
    setSecondaryWeight(0.5)
    onClose()
    await onCreated()
  }

  return (
    <Sheet open={open} onClose={onClose} title="New custom exercise">
      <div className="flex flex-col gap-3 pb-2">
        <label className="text-caption text-text-muted">
          Name
          <TextInput value={name} onChange={(e) => setName(e.target.value)} className="mt-1 text-text-primary" />
        </label>
        <label className="text-caption text-text-muted">
          Category (optional)
          <TextInput
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Push / Pull / Legs / Core…"
            className="mt-1 text-text-primary"
          />
        </label>
        <MusclePicker label="Primary muscles (weight 1.0)" selected={primary} onToggle={(m) => toggle(primary, setPrimary, m)} />
        <MusclePicker
          label={`Secondary muscles (weight ${secondaryWeight})`}
          selected={secondary}
          onToggle={(m) => toggle(secondary, setSecondary, m)}
        />
        <div className="flex items-center justify-between rounded-control glass px-3 py-2">
          <span className="text-caption">Secondary muscle weight</span>
          <Segmented
            size="sm"
            options={[
              { value: 0, label: '0' },
              { value: 0.25, label: '0.25' },
              { value: 0.5, label: '0.5' },
              { value: 0.75, label: '0.75' },
            ]}
            value={secondaryWeight}
            onChange={setSecondaryWeight}
          />
        </div>
        <Button variant="primary" disabled={busy} onClick={() => void create()}>
          {busy ? 'Saving…' : 'Create exercise'}
        </Button>
      </div>
    </Sheet>
  )
}

function MusclePicker({
  label,
  selected,
  onToggle,
}: {
  label: string
  selected: string[]
  onToggle: (m: string) => void
}) {
  return (
    <div>
      <p className="mb-1.5 text-caption text-text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {MUSCLE_GROUPS.map((m: MuscleGroup) => (
          <button
            key={m}
            type="button"
            aria-pressed={selected.includes(m)}
            onClick={() => onToggle(m)}
            className={
              selected.includes(m)
                ? 'press rounded-full bg-accent px-3 py-1.5 text-caption capitalize text-accent-contrast'
                : 'press rounded-full glass px-3 py-1.5 text-caption capitalize text-text-muted'
            }
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  )
}
