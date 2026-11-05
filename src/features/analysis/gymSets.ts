import type { ExerciseType, PerformedSet } from '../../db/types'
import { formatSetWithRir } from '../training/catalog'

/**
 * An exercise's working sets one by one with the reps in reserve the user told, for the coach to read
 * how hard they were: "80×8 RIR 2, 80×8 RIR 1, 80×7 RIR 0". Undefined when no set has one.
 */
export function setsWithRir(sets: PerformedSet[], type: ExerciseType): string | undefined {
  if (type === 'time' || !sets.some((set) => set.rir !== undefined)) return undefined
  return sets.map((set) => formatSetWithRir(set, type)).join(', ')
}
