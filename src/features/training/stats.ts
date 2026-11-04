import type {
  Equipment,
  Exercise,
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
const LOAD_STEP: Record<Equipment, number> = {
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
