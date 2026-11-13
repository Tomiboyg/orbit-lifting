import type { ExerciseDef } from '../types'

/** Fallback global library, used when Supabase is not configured/offline. */
export const FALLBACK_EXERCISES: ExerciseDef[] = [
  { id: null, name: 'Barbell Bench Press', category: 'Push', primary: ['chest'], secondary: ['triceps', 'shoulders'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Incline Dumbbell Press', category: 'Push', primary: ['chest'], secondary: ['triceps', 'shoulders'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Cable Fly', category: 'Push', primary: ['chest'], secondary: ['shoulders'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Push-up', category: 'Push', primary: ['chest'], secondary: ['triceps', 'core'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Overhead Press', category: 'Push', primary: ['shoulders'], secondary: ['triceps'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Dumbbell Lateral Raise', category: 'Push', primary: ['shoulders'], secondary: [], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Face Pull', category: 'Pull', primary: ['shoulders'], secondary: ['back'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Pull-up', category: 'Pull', primary: ['back'], secondary: ['biceps'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Lat Pulldown', category: 'Pull', primary: ['back'], secondary: ['biceps'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Barbell Row', category: 'Pull', primary: ['back'], secondary: ['biceps'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Seated Cable Row', category: 'Pull', primary: ['back'], secondary: ['biceps'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Deadlift', category: 'Pull', primary: ['back'], secondary: ['hamstrings', 'glutes'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Barbell Curl', category: 'Pull', primary: ['biceps'], secondary: [], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Dumbbell Hammer Curl', category: 'Pull', primary: ['biceps'], secondary: [], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Triceps Pushdown', category: 'Push', primary: ['triceps'], secondary: [], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Skull Crusher', category: 'Push', primary: ['triceps'], secondary: [], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Barbell Squat', category: 'Legs', primary: ['quads'], secondary: ['glutes', 'core'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Leg Press', category: 'Legs', primary: ['quads'], secondary: ['glutes'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Bulgarian Split Squat', category: 'Legs', primary: ['quads'], secondary: ['glutes'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Leg Extension', category: 'Legs', primary: ['quads'], secondary: [], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Romanian Deadlift', category: 'Legs', primary: ['hamstrings'], secondary: ['glutes', 'back'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Leg Curl', category: 'Legs', primary: ['hamstrings'], secondary: [], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Hip Thrust', category: 'Legs', primary: ['glutes'], secondary: ['hamstrings'], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Standing Calf Raise', category: 'Legs', primary: ['calves'], secondary: [], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Seated Calf Raise', category: 'Legs', primary: ['calves'], secondary: [], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Plank', category: 'Core', primary: ['core'], secondary: [], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Cable Crunch', category: 'Core', primary: ['core'], secondary: [], secondaryWeight: 0.5, isCustom: false },
  { id: null, name: 'Hanging Leg Raise', category: 'Core', primary: ['core'], secondary: [], secondaryWeight: 0.5, isCustom: false },
]

export function exerciseDefByName(exercises: ExerciseDef[], name: string): ExerciseDef | undefined {
  return exercises.find((e) => e.name.toLowerCase() === name.toLowerCase())
}
