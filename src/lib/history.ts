/** Data access layer over Supabase. All functions are offline-safe no-ops. */

import { getSupabase } from './supabase'
import type { RawSet } from './analytics'
import type { SetType } from '../types'

export interface WorkoutRecord {
  id: string
  title: string | null
  notes: string | null
  startedAt: number
  finishedAt: number | null
  setCount: number
  totalVolume: number
}

export interface WorkoutDetail extends WorkoutRecord {
  exercises: Array<{
    id: string
    name: string
    exerciseId: string | null
    position: number
    notes: string | null
    sets: Array<{
      id: string
      weight: number | null
      reps: number | null
      rpe: number | null
      setType: SetType
      completed: boolean
      performedAt: number | null
    }>
  }>
}

async function requireUser(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function isSignedIn(): Promise<boolean> {
  return (await requireUser()) != null
}

export async function fetchSetsSince(sinceTs: number): Promise<RawSet[]> {
  const supabase = getSupabase()
  const userId = await requireUser()
  if (!supabase || !userId) return []
  const since = new Date(sinceTs).toISOString()
  const { data, error } = await supabase
    .from('sets')
    .select('id, workout_id, exercise_id, weight, reps, rpe, set_type, completed, performed_at, workout_exercises(name)')
    .eq('user_id', userId)
    .eq('completed', true)
    .gte('performed_at', since)
    .order('performed_at', { ascending: true })
  if (error || !data) return []
  return data.map((row) => {
    const r = row as {
      id: string
      workout_id: string
      exercise_id: string | null
      weight: number | null
      reps: number | null
      rpe: number | null
      set_type: string
      performed_at: string | null
      workout_exercises: { name: string } | { name: string }[] | null
    }
    const we = r.workout_exercises
    const weName = Array.isArray(we) ? we[0]?.name : we?.name
    return {
      id: r.id,
      exerciseId: r.exercise_id,
      exerciseName: weName ?? 'Unknown exercise',
      weight: r.weight ?? 0,
      reps: r.reps ?? 0,
      rpe: r.rpe,
      setType: r.set_type as SetType,
      completed: r.completed,
      performedAt: r.performed_at ? new Date(r.performed_at).getTime() : Date.now(),
      workoutId: r.workout_id,
    }
  })
}

export async function fetchWorkouts(limit = 60): Promise<WorkoutRecord[]> {
  const supabase = getSupabase()
  const userId = await requireUser()
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from('workouts')
    .select('id, title, notes, started_at, finished_at, sets(weight, reps, completed)')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data.map((row) => {
    const r = row as {
      id: string
      title: string | null
      notes: string | null
      started_at: string
      finished_at: string | null
      sets: { weight: number | null; reps: number | null; completed: boolean }[] | null
    }
    const sets = r.sets ?? []
    const completed = sets.filter((s) => s.completed)
    return {
      id: r.id,
      title: r.title,
      notes: r.notes,
      startedAt: new Date(r.started_at).getTime(),
      finishedAt: r.finished_at ? new Date(r.finished_at).getTime() : null,
      setCount: completed.length,
      totalVolume: completed.reduce((a, s) => a + (s.weight ?? 0) * (s.reps ?? 0), 0),
    }
  })
}

export async function fetchWorkoutDetail(id: string): Promise<WorkoutDetail | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('workouts')
    .select(
      'id, title, notes, started_at, finished_at, workout_exercises(id, name, exercise_id, position, notes, sets(id, weight, reps, rpe, set_type, completed, performed_at))',
    )
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  const r = data as {
    id: string
    title: string | null
    notes: string | null
    started_at: string
    finished_at: string | null
    workout_exercises: Array<{
      id: string
      name: string
      exercise_id: string | null
      position: number
      notes: string | null
      sets: Array<{
        id: string
        weight: number | null
        reps: number | null
        rpe: number | null
        set_type: string
        completed: boolean
        performed_at: string | null
      }>
    }>
  }
  const exercises = (r.workout_exercises ?? [])
    .sort((a, b) => a.position - b.position)
    .map((we) => ({
      id: we.id,
      name: we.name,
      exerciseId: we.exercise_id,
      position: we.position,
      notes: we.notes,
      sets: (we.sets ?? [])
        .sort((a, b) => (a.performed_at ?? '').localeCompare(b.performed_at ?? ''))
        .map((s) => ({
          id: s.id,
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe,
          setType: s.set_type as SetType,
          completed: s.completed,
          performedAt: s.performed_at ? new Date(s.performed_at).getTime() : null,
        })),
    }))
  const allSets = exercises.flatMap((e) => e.sets).filter((s) => s.completed)
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    startedAt: new Date(r.started_at).getTime(),
    finishedAt: r.finished_at ? new Date(r.finished_at).getTime() : null,
    setCount: allSets.length,
    totalVolume: allSets.reduce((a, s) => a + (s.weight ?? 0) * (s.reps ?? 0), 0),
    exercises,
  }
}

export async function deleteWorkout(id: string): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false
  const { error } = await supabase.from('workouts').delete().eq('id', id)
  return !error
}

export async function updateSetRemote(
  setId: string,
  patch: { weight?: number | null; reps?: number | null; rpe?: number | null; set_type?: SetType },
): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false
  const { error } = await supabase.from('sets').update(patch).eq('id', setId)
  return !error
}

export async function deleteSetRemote(setId: string): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false
  const { error } = await supabase.from('sets').delete().eq('id', setId)
  return !error
}

export async function fetchExerciseLibrary(): Promise<
  Array<{ id: string | null; user_id: string | null; name: string; category: string | null; primary_muscles: string[]; secondary_muscles: string[]; secondary_weight: number }>
> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('exercises')
    .select('id, user_id, name, category, primary_muscles, secondary_muscles, secondary_weight')
    .order('name')
  if (error || !data) return []
  return data as Array<{
    id: string | null
    user_id: string | null
    name: string
    category: string | null
    primary_muscles: string[]
    secondary_muscles: string[]
    secondary_weight: number
  }>
}

export async function insertCustomExercise(def: {
  name: string
  category: string | null
  primary: string[]
  secondary: string[]
  secondaryWeight: number
}): Promise<{ id: string | null }> {
  const supabase = getSupabase()
  if (!supabase) return { id: null }
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return { id: null }
  const { data: row, error } = await supabase
    .from('exercises')
    .insert({
      user_id: userId,
      name: def.name,
      category: def.category,
      primary_muscles: def.primary,
      secondary_muscles: def.secondary,
      secondary_weight: def.secondaryWeight,
    })
    .select('id')
    .single()
  if (error || !row) return { id: null }
  return { id: row.id }
}
