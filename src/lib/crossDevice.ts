/**
 * Cross-device active workout handling (spec 11.5): if another device has an
 * active workout, the user gets a clear choice — resume here or discard the
 * other — instead of a silent merge or overwrite.
 */

import type { ActiveWorkout, LoggedExercise, LoggedSet, SetType } from '../types'
import { getSupabase } from './supabase'
import { kvSet, KV_ACTIVE_WORKOUT } from './idb'
import { useWorkout } from '../store/workout'
import { deviceId } from './uuid'

export interface OtherWorkout {
  id: string
  title: string | null
  device_id: string | null
  startedAt: number
}

export async function checkOtherDeviceWorkout(): Promise<OtherWorkout | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return null
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: rows, error } = await supabase
    .from('workouts')
    .select('id, title, device_id, started_at')
    .eq('user_id', userId)
    .is('finished_at', null)
    .neq('device_id', deviceId())
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(1)
  if (error || !rows || rows.length === 0) return null
  const r = rows[0]
  return {
    id: r.id,
    title: r.title,
    device_id: r.device_id,
    startedAt: new Date(r.started_at).getTime(),
  }
}

/** Rebuild the workout locally from the server snapshot and open it here. */
export async function resumeOtherWorkout(other: OtherWorkout): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return false

  const { data: wRows } = await supabase
    .from('workouts')
    .select('id, title, notes, started_at')
    .eq('id', other.id)
    .maybeSingle()
  if (!wRows) return false

  const { data: exRows } = await supabase
    .from('workout_exercises')
    .select('id, exercise_id, name, position, notes')
    .eq('workout_id', other.id)
    .order('position')
  const { data: setRows } = await supabase
    .from('sets')
    .select('id, workout_exercise_id, exercise_id, weight, reps, rpe, set_type, completed, performed_at')
    .eq('workout_id', other.id)
    .order('performed_at')

  const exercises: LoggedExercise[] = (exRows ?? []).map((ex) => {
    const sets: LoggedSet[] = (setRows ?? [])
      .filter((s) => s.workout_exercise_id === ex.id)
      .map((s) => ({
        id: s.id,
        weight: s.weight == null ? '' : String(s.weight),
        reps: s.reps == null ? '' : String(s.reps),
        rpe: s.rpe == null ? '' : String(s.rpe),
        setType: s.set_type as SetType,
        completed: s.completed,
        performedAt: s.performed_at ? new Date(s.performed_at).getTime() : undefined,
      }))
    // Always keep one prefilled draft row ready.
    if (!sets.some((s) => !s.completed)) {
      const last = [...sets].reverse().find((s) => s.completed)
      sets.push({
        id: crypto.randomUUID(),
        weight: last?.weight ?? '',
        reps: last?.reps ?? '',
        rpe: last?.rpe ?? '',
        setType: 'working',
        completed: false,
      })
    }
    return {
      id: ex.id,
      exerciseId: ex.exercise_id,
      name: ex.name,
      position: ex.position,
      notes: ex.notes ?? '',
      sets,
    }
  })

  const active: ActiveWorkout = {
    id: other.id,
    startedAt: new Date(wRows.started_at).getTime(),
    title: wRows.title ?? 'Workout',
    notes: wRows.notes ?? '',
    routineId: null,
    exercises,
    currentExerciseIndex: 0,
    restTimer: null,
    finishedAt: null,
    updatedAt: Date.now(),
  }
  try {
    await kvSet(KV_ACTIVE_WORKOUT, active)
  } catch {
    return false
  }
  useWorkout.setState({ workout: active, lastDeleted: null })
  return true
}

/** Mark the other device's workout finished so it stops prompting. */
export async function discardOtherWorkout(other: OtherWorkout): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return false
  const { error } = await supabase
    .from('workouts')
    .update({ finished_at: new Date().toISOString() })
    .eq('id', other.id)
    .eq('user_id', userId)
  return !error
}
