import type { ExerciseType, PerformedSet, SessionExercise } from '../../db/types'

export type SetValues = Pick<PerformedSet, 'weightKg' | 'reps' | 'durationSec'>

/**
 * Last time's same set for each set: same kind, same place among the sets of that kind done then (the
 * 2nd warm-up pairs with the 2nd warm-up, the 3rd working set with the 3rd). Undefined where last time
 * had fewer.
 */
export function previousSets(sets: PerformedSet[], last: SessionExercise | undefined): (PerformedSet | undefined)[] {
  const done: Record<PerformedSet['kind'], PerformedSet[]> = { warmup: [], normal: [] }
  for (const set of last?.sets ?? []) if (set.done) done[set.kind].push(set)
  const seen = { warmup: 0, normal: 0 }
  return sets.map((set) => done[set.kind][seen[set.kind]++])
}

/**
 * What checking a set off records when nothing is typed: its own values (typed in the app, or set
 * from the notification), else last time's same set, else the template's target. Only what the
 * exercise records: load and reps, reps, or a duration. The set screen and the Android notification
 * both start from here, so the two agree.
 */
export function checkedValues(set: SetValues & Pick<PerformedSet, 'target'>, previous: PerformedSet | undefined, type: ExerciseType): SetValues {
  return {
    weightKg: type === 'weight_reps' ? (set.weightKg ?? previous?.weightKg ?? set.target?.weightKg) : undefined,
    reps: type === 'time' ? undefined : (set.reps ?? previous?.reps ?? set.target?.reps),
    durationSec: type === 'time' ? (set.durationSec ?? previous?.durationSec ?? set.target?.durationSec) : undefined,
  }
}
