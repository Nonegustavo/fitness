import type { Exercise, ExerciseType, MuscleGroup, PlannedSet, SessionExercise, WorkoutSession, WorkoutTemplate } from '../../db/types'
import { formatClock, formatNumber } from '../../lib/format'
import { formatReps, formatSet } from './catalog'

const kg = (weight: number) => formatNumber(weight, 2)

/** One planned set as the session screen writes sets: "40×8–12", "PC×12", "0:45", "40 kg", "8–12 reps" or "". */
export function plannedSetText(set: PlannedSet, type: ExerciseType): string {
  const reps = formatReps(set.reps, set.repsMax)
  if (type === 'time') return set.durationSec === undefined ? '' : formatClock(set.durationSec)
  if (type === 'reps') return reps ? `PC×${reps}` : ''
  if (set.weightKg) return reps ? `${kg(set.weightKg)}×${reps}` : `${kg(set.weightKg)} kg`
  return reps ? `${reps} reps` : ''
}

const setCount = (count: number) => (count === 1 ? '1 série' : `${count} séries`)

/**
 * Sets as a ficha writes them: the same set repeated reads "3 × 8–12 · 40 kg" (or "4 × 10", "3 × 0:45",
 * "3 séries" when the ficha has no numbers); sets that differ are listed, "40×12 · 42,5×10 · 45×8".
 */
export function plannedSetsText(sets: PlannedSet[], type: ExerciseType): string {
  if (sets.length === 0) return ''
  const texts = sets.map((set) => plannedSetText(set, type))
  if (texts.some((text) => text !== texts[0])) return texts.map((text) => text || '—').join(' · ')
  const [first] = sets
  if (type === 'time') return first.durationSec === undefined ? setCount(sets.length) : `${sets.length} × ${formatClock(first.durationSec)}`
  const reps = formatReps(first.reps, first.repsMax)
  const count = reps ? `${sets.length} × ${reps}` : setCount(sets.length)
  return type === 'weight_reps' && first.weightKg ? `${count} · ${kg(first.weightKg)} kg` : count
}

/** The working sets done last time, "40×12 · 40×11 · 40×10"; "" when only warm-ups were done. */
export const doneSetsText = (exercise: SessionExercise, type: ExerciseType): string =>
  exercise.sets
    .filter((set) => set.done && set.kind === 'normal')
    .map((set) => formatSet(set, type))
    .filter(Boolean)
    .join(' · ')

export interface TemplateTotals {
  exercises: number
  /** Working sets: warm-ups don't count, as everywhere in the app. */
  sets: number
  /** The muscles worked, in the ficha's order. */
  muscles: MuscleGroup[]
}

export function templateTotals(template: Pick<WorkoutTemplate, 'exercises'>, exercises: Map<string, Exercise>): TemplateTotals {
  const muscles = new Set<MuscleGroup>()
  for (const exercise of template.exercises) {
    const muscle = exercises.get(exercise.exerciseId)?.muscle
    if (muscle) muscles.add(muscle)
  }
  return {
    exercises: template.exercises.length,
    sets: template.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.kind === 'normal').length, 0),
    muscles: [...muscles],
  }
}

/** The latest finished workout of a ficha. */
export function lastTemplateSession(sessions: WorkoutSession[], templateId: string): WorkoutSession | undefined {
  let found: WorkoutSession | undefined
  for (const session of sessions) {
    if (session.deleted || !session.endedAt || session.templateId !== templateId) continue
    if (!found || session.startedAt > found.startedAt) found = session
  }
  return found
}
