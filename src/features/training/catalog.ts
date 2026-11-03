import type { Equipment, ExerciseType, MuscleGroup } from '../../db/types'
import { formatClock, formatNumber } from '../../lib/format'

export const MUSCLES: Record<MuscleGroup, string> = {
  chest: 'Peito',
  back: 'Costas',
  shoulders: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebraços',
  abs: 'Abdômen',
  quads: 'Quadríceps',
  hamstrings: 'Posteriores de coxa',
  glutes: 'Glúteos',
  adductors: 'Adutores',
  calves: 'Panturrilhas',
  full_body: 'Corpo inteiro',
  cardio: 'Cardio',
}

export const EQUIPMENT: Record<Equipment, string> = {
  barbell: 'Barra',
  dumbbell: 'Halteres',
  machine: 'Máquina',
  cable: 'Polia',
  smith: 'Smith',
  bodyweight: 'Peso corporal',
  kettlebell: 'Kettlebell',
  band: 'Elástico',
  other: 'Outro',
}

export const EXERCISE_TYPES: Record<ExerciseType, string> = {
  weight_reps: 'Carga e repetições',
  reps: 'Só repetições',
  time: 'Tempo',
}

/** "8–12", "10" or "". */
export function formatReps(reps?: number, repsMax?: number): string {
  if (reps === undefined) return repsMax === undefined ? '' : String(repsMax)
  return repsMax !== undefined && repsMax !== reps ? `${reps}–${repsMax}` : String(reps)
}

/** "60×10", "12" or "0:45", depending on how the exercise is recorded. */
export function formatSet(
  set: { weightKg?: number; reps?: number; durationSec?: number },
  type: ExerciseType,
): string {
  if (type === 'time') return set.durationSec === undefined ? '' : formatClock(set.durationSec)
  if (type === 'reps' || !set.weightKg) return set.reps === undefined ? '' : String(set.reps)
  return `${formatNumber(set.weightKg, 2)}×${set.reps ?? '?'}`
}
