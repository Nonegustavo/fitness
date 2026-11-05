import type { Equipment, ExerciseType, MuscleGroup } from '../../db/types'
import { formatClock, formatNumber } from '../../lib/format'
import type { SetComparison } from './stats'

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

/** "60×10", "PC×12" (peso corporal: no load) or "0:45", depending on how the exercise is recorded. */
export function formatSet(
  set: { weightKg?: number; reps?: number; durationSec?: number },
  type: ExerciseType,
): string {
  if (type === 'time') return set.durationSec === undefined ? '' : formatClock(set.durationSec)
  if (type === 'reps' || !set.weightKg) return set.reps === undefined ? '' : `PC×${set.reps}`
  return `${formatNumber(set.weightKg, 2)}×${set.reps ?? '?'}`
}

/** Reps in reserve: "RIR 2", and "RIR 4+" for 4 or more. */
export const formatRir = (rir: number): string => (rir >= 4 ? 'RIR 4+' : `RIR ${rir}`)

/** "80×8 RIR 2", or the set alone when no RIR was told. */
export function formatSetWithRir(set: { weightKg?: number; reps?: number; durationSec?: number; rir?: number }, type: ExerciseType): string {
  const text = formatSet(set, type)
  return set.rir === undefined || type === 'time' ? text : `${text} ${formatRir(set.rir)}`
}

/** "1RM 83,3": an estimated one-rep max, to a tenth of a kilo. */
export const formatE1rm = (kg: number): string => `1RM ${formatNumber(kg, 1)}`

/** The line under a set: "1RM 83,3", "+2 reps", "−1 rep", "±0 reps", "+0:10"… */
export function formatComparison(comparison: SetComparison): string {
  if (comparison.metric === 'e1rm') return formatE1rm(comparison.value)
  const { delta } = comparison
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
  const size = Math.abs(delta)
  if (comparison.metric === 'time') return `${sign}${formatClock(size)}`
  return `${sign}${size} ${size === 1 ? 'rep' : 'reps'}`
}
