import type {
  Equipment,
  Exercise,
  ExerciseType,
  MuscleGroup,
  PerformedSet,
  SessionExercise,
  WorkoutSession,
  WorkoutTemplate,
} from '../../db/types'
import { shiftDay, type DayKey } from '../../lib/dates'

/** Estimated one-rep max (Epley). Only meaningful up to ~12 reps. */
export const epley = (weightKg: number, reps: number): number => (reps <= 1 ? weightKg : weightKg * (1 + reps / 30))

/** Done, non-warm-up sets: the ones that count for volume, weekly sets and records. */
export const workingSets = (exercise: SessionExercise): PerformedSet[] =>
  exercise.sets.filter((set) => set.done && set.kind === 'normal')

export function bestE1rm(sets: PerformedSet[]): number | undefined {
  let best: number | undefined
  for (const set of sets) {
    if (!set.weightKg || !set.reps || set.reps > 12) continue
    const value = epley(set.weightKg, set.reps)
    if (best === undefined || value > best) best = value
  }
  return best
}

type SetValues = Pick<PerformedSet, 'weightKg' | 'reps' | 'durationSec'>

/** A set's estimated 1RM, when it has a load and reps. */
export const setE1rm = (set: SetValues): number | undefined =>
  set.weightKg !== undefined && set.weightKg > 0 && set.reps !== undefined && set.reps > 0
    ? epley(set.weightKg, set.reps)
    : undefined

export type Trend = 'up' | 'down' | 'same'

/** A set against the same set last time (same kind, same position). */
export type SetComparison =
  /** With a load: its estimated 1RM, and the trend when last time's had a load too. */
  | { metric: 'e1rm'; value: number; trend?: Trend }
  /** At body weight: reps more or fewer than last time. */
  | { metric: 'reps'; delta: number; trend: Trend }
  /** Timed: seconds more or fewer than last time. */
  | { metric: 'time'; delta: number; trend: Trend }

const trendOf = (delta: number): Trend => (delta > 0 ? 'up' : delta < 0 ? 'down' : 'same')

/**
 * How a set compares with the same set last time: its estimated 1RM when it has a load (to a tenth
 * of a kilo, as shown), the reps at body weight, the duration when timed. Undefined when there's
 * nothing to show: no reps or time yet, or, at body weight or timed, nothing to compare with.
 */
export function compareSet(
  set: SetValues,
  previous: SetValues | undefined,
  type: ExerciseType,
): SetComparison | undefined {
  if (type === 'time') {
    if (set.durationSec === undefined || previous?.durationSec === undefined) return undefined
    const delta = Math.round(set.durationSec) - Math.round(previous.durationSec)
    return { metric: 'time', delta, trend: trendOf(delta) }
  }
  const loaded = (values: SetValues) => type === 'weight_reps' && (values.weightKg ?? 0) > 0
  if (loaded(set)) {
    const value = setE1rm(set)
    if (value === undefined) return undefined
    const before = previous && loaded(previous) ? setE1rm(previous) : undefined
    return {
      metric: 'e1rm',
      value,
      trend: before === undefined ? undefined : trendOf(Math.round(value * 10) - Math.round(before * 10)),
    }
  }
  // Body weight: reps against last time's, when that one had no load either.
  if (set.reps === undefined || previous?.reps === undefined || loaded(previous)) return undefined
  const delta = set.reps - previous.reps
  return { metric: 'reps', delta, trend: trendOf(delta) }
}

export interface SessionSummary {
  sets: number
  volumeKg: number
  durationMs?: number
}

export function summarize(session: WorkoutSession): SessionSummary {
  let sets = 0
  let volumeKg = 0
  for (const exercise of session.exercises) {
    for (const set of workingSets(exercise)) {
      sets++
      volumeKg += (set.weightKg ?? 0) * (set.reps ?? 0)
    }
  }
  return { sets, volumeKg, durationMs: session.endedAt ? session.endedAt - session.startedAt : undefined }
}

/** Working sets per primary muscle in the finished sessions between two days. */
export function setsByMuscle(
  sessions: WorkoutSession[],
  exercises: Map<string, Exercise>,
  from: DayKey,
  to: DayKey,
): Map<MuscleGroup, number> {
  const counts = new Map<MuscleGroup, number>()
  for (const session of sessions) {
    if (!session.endedAt || session.date < from || session.date > to) continue
    for (const exercise of session.exercises) {
      const muscle = exercises.get(exercise.exerciseId)?.muscle
      const sets = workingSets(exercise).length
      if (muscle && sets > 0) counts.set(muscle, (counts.get(muscle) ?? 0) + sets)
    }
  }
  return counts
}

export interface Performance {
  session: WorkoutSession
  exercise: SessionExercise
}

/** The latest finished session started before `before` (ms) in which the exercise had done sets. */
export function lastPerformance(sessions: WorkoutSession[], exerciseId: string, before: number): Performance | undefined {
  let found: Performance | undefined
  for (const session of sessions) {
    if (!session.endedAt || session.startedAt >= before) continue
    if (found && session.startedAt <= found.session.startedAt) continue
    const exercise = session.exercises.find((e) => e.exerciseId === exerciseId && e.sets.some((set) => set.done))
    if (exercise) found = { session, exercise }
  }
  return found
}

/** Next load step by equipment; barbells take a pair of 1.25 kg plates. */
export const LOAD_STEP: Record<Equipment, number> = {
  barbell: 2.5,
  smith: 2.5,
  dumbbell: 2,
  machine: 5,
  cable: 2.5,
  kettlebell: 4,
  other: 2.5,
  bodyweight: 0,
  band: 0,
}

/**
 * Double progression: once every working set reached the top of its rep target,
 * suggest the next load step. Undefined when it isn't time to go up yet.
 */
export function suggestNextWeight(last: PerformedSet[], equipment: Equipment): number | undefined {
  const working = last.filter((set) => set.done && set.kind === 'normal')
  const step = LOAD_STEP[equipment]
  if (working.length === 0 || step === 0) return undefined
  const reachedTop = working.every((set) => {
    const top = set.target?.repsMax ?? set.target?.reps
    return top !== undefined && set.reps !== undefined && set.reps >= top
  })
  const heaviest = Math.max(...working.map((set) => set.weightKg ?? 0))
  return reachedTop && heaviest > 0 ? heaviest + step : undefined
}

/** The template after the one used last, wrapping around (A → B → C → A); archived ones are out. */
export function nextTemplate(templates: WorkoutTemplate[], sessions: WorkoutSession[]): WorkoutTemplate | undefined {
  const ordered = templates.filter((template) => !template.archived).sort((a, b) => a.order - b.order)
  let last: WorkoutSession | undefined
  for (const session of sessions) {
    if (!session.endedAt || !ordered.some((t) => t.id === session.templateId)) continue
    if (!last || session.startedAt > last.startedAt) last = session
  }
  if (!last) return ordered[0]
  const index = ordered.findIndex((template) => template.id === last.templateId)
  return ordered[(index + 1) % ordered.length]
}

/** Exercises whose best estimated 1RM in this session beats every earlier one (needs some history). */
export function personalRecords(session: WorkoutSession, sessions: WorkoutSession[]): Set<string> {
  const records = new Set<string>()
  for (const exercise of session.exercises) {
    const best = bestE1rm(workingSets(exercise))
    if (best === undefined) continue
    let previous = 0
    for (const other of sessions) {
      if (other.id === session.id || !other.endedAt || other.startedAt >= session.startedAt) continue
      for (const earlier of other.exercises) {
        if (earlier.exerciseId === exercise.exerciseId) previous = Math.max(previous, bestE1rm(workingSets(earlier)) ?? 0)
      }
    }
    if (previous > 0 && best > previous) records.add(exercise.exerciseId)
  }
  return records
}

export interface Stall {
  exerciseId: string
  /** Sessions in a row without beating the earlier best. */
  sessions: number
  bestKg: number
}

/**
 * Exercises that stopped progressing: done lately (last 3 weeks), with at least 4 sessions, and whose
 * best estimated 1RM of the last 3 sessions doesn't beat the best before them.
 */
export function stalledExercises(sessions: WorkoutSession[], today: DayKey, recentDays = 21): Stall[] {
  const byExercise = new Map<string, { date: DayKey; best: number }[]>()
  const finished = sessions.filter((s) => s.endedAt).sort((a, b) => a.startedAt - b.startedAt)
  for (const session of finished) {
    for (const exercise of session.exercises) {
      const best = bestE1rm(workingSets(exercise))
      if (best === undefined) continue
      byExercise.set(exercise.exerciseId, [...(byExercise.get(exercise.exerciseId) ?? []), { date: session.date, best }])
    }
  }
  const cutoff = shiftDay(today, -recentDays)
  const stalls: Stall[] = []
  for (const [exerciseId, history] of byExercise) {
    if (history.length < 4 || history.at(-1)!.date < cutoff) continue
    const before = Math.max(...history.slice(0, -3).map((h) => h.best))
    const last = history.slice(-3)
    // Half a percent of slack: the same load for one more rep isn't a stall.
    if (Math.max(...last.map((h) => h.best)) <= before * 1.005) {
      // Count how far back the stall goes.
      let count = 3
      for (let i = history.length - 4; i > 0; i--) {
        if (history[i].best > Math.max(...history.slice(0, i).map((h) => h.best)) * 1.005) break
        count++
      }
      stalls.push({ exerciseId, sessions: count, bestKg: before })
    }
  }
  return stalls.sort((a, b) => b.sessions - a.sessions)
}

/** Average effort (RPE) of the last sessions that have one, when at least 2 do. */
export function recentEffort(sessions: WorkoutSession[], count = 3): number | undefined {
  const rated = sessions
    .filter((s) => s.endedAt && s.effort !== undefined)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, count)
  if (rated.length < 2) return undefined
  return rated.reduce((total, s) => total + s.effort!, 0) / rated.length
}

/**
 * Time for a lighter week: progress stalled in 3 or more exercises, or in 2 while the sessions feel
 * very hard (RPE 9+).
 */
export const needsDeload = (stalls: Stall[], effort?: number): boolean =>
  stalls.length >= 3 || (stalls.length >= 2 && effort !== undefined && effort >= 9)

/** Olympic bar and the usual plates of a Brazilian gym. */
export const DEFAULT_GYM = { barKg: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] }
export const PLATE_OPTIONS = [25, 20, 15, 10, 5, 4, 3, 2.5, 2, 1.25, 1, 0.5]

export interface PlateLoad {
  /** Heaviest first, for one side of the bar. */
  perSide: number[]
  /** What the plates can't make up, per side (0 when exact). */
  missing: number
}

/**
 * The plates for each side of the bar: the closest load at or under the target, with as few
 * plates as possible. Exact over any plate set (4 kg and 3 kg make 6, where heaviest-first can't).
 */
export function platesPerSide(totalKg: number, barKg: number, plates: number[]): PlateLoad {
  const unit = 0.25
  const target = Math.max(0, Math.round((totalKg - barKg) / 2 / unit))
  const sizes = [...new Set(plates.map((p) => Math.round(p / unit)).filter((p) => p > 0))]
  // fewest[a]: the fewest plates making exactly a units; from[a]: the last plate used.
  const fewest = new Array<number>(target + 1).fill(Infinity)
  const from = new Array<number>(target + 1).fill(0)
  fewest[0] = 0
  for (let a = 1; a <= target; a++) {
    for (const size of sizes) {
      if (size <= a && fewest[a - size] + 1 < fewest[a]) {
        fewest[a] = fewest[a - size] + 1
        from[a] = size
      }
    }
  }
  let reach = target
  while (reach > 0 && fewest[reach] === Infinity) reach--
  const perSide: number[] = []
  for (let a = reach; a > 0; a -= from[a]) perSide.push(from[a] * unit)
  return { perSide: perSide.sort((x, y) => y - x), missing: (target - reach) * unit }
}
