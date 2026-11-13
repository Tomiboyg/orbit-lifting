/** Data ownership: full export (CSV + JSON) (spec 12.6). */

import { getSupabase } from './supabase'
import type { RawSet } from './analytics'
import { fetchSetsSince } from './history'
import { useSettings } from '../store/settings'

export async function exportData(): Promise<{ json: string; csv: string }> {
  const sets = await fetchSetsSince(0)
  const supabase = getSupabase()
  let workouts: unknown[] = []
  let exercises: unknown[] = []
  if (supabase) {
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (userId) {
      const [w, e] = await Promise.all([
        supabase.from('workouts').select('*').eq('user_id', userId).order('started_at'),
        supabase.from('exercises').select('*'),
      ])
      workouts = w.data ?? []
      exercises = e.data ?? []
    }
  }
  const json = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'Orbit Lifting',
      settings: useSettings.getState().settings,
      workouts,
      exercises,
      sets,
    },
    null,
    2,
  )
  return { json, csv: setsToCsv(sets) }
}

export function setsToCsv(sets: RawSet[]): string {
  const head = 'performed_at,exercise,weight,reps,rpe,set_type,completed,workout_id'
  const lines = sets.map((s) =>
    [
      new Date(s.performedAt).toISOString(),
      csv(s.exerciseName),
      s.weight,
      s.reps,
      s.rpe ?? '',
      s.setType,
      s.completed ? 'true' : 'false',
      s.workoutId,
    ].join(','),
  )
  return [head, ...lines].join('\n')
}

function csv(v: string): string {
  return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
}

export function downloadFile(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
