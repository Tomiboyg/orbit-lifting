/** Shared domain types. */

export type SetType = 'warm-up' | 'working' | 'drop' | 'failure'

export interface LoggedSet {
  id: string
  weight: string
  reps: string
  rpe: string
  setType: SetType
  completed: boolean
  performedAt?: number
}

export interface LoggedExercise {
  id: string
  exerciseId: string | null
  name: string
  position: number
  notes: string
  sets: LoggedSet[]
}

export interface RestTimerState {
  /** Absolute end timestamp (ms). Timers are timestamp-based, spec 11.1. */
  endsAt: number
  durationSec: number
  startedAt: number
}

export interface ActiveWorkout {
  id: string
  startedAt: number
  title: string
  notes: string
  routineId: string | null
  exercises: LoggedExercise[]
  currentExerciseIndex: number
  restTimer: RestTimerState | null
  /** Set when the user tapped Finish but the server has not confirmed. */
  finishedAt: number | null
  updatedAt: number
}

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export interface ExerciseDef {
  id: string | null
  name: string
  category: string | null
  primary: string[]
  secondary: string[]
  secondaryWeight: number
  isCustom: boolean
}
