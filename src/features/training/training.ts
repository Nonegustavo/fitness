import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { alive, mutate, remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import { useShared } from '../../db/shared'
import type {
  Exercise,
  ExerciseType,
  PerformedSet,
  PlannedSet,
  SessionExercise,
  SetKind,
  Synced,
  TemplateExercise,
  WorkoutSession,
  WorkoutTemplate,
} from '../../db/types'
import { dayKey } from '../../lib/dates'
import { newId } from '../../lib/ids'
import { lastPerformance } from './stats'
import { checkedValues, previousSets } from './setValues'

export const DEFAULT_REST_SEC = 90
/** The rest after a warm-up set, when the exercise doesn't say: warm-ups are light. */
export const DEFAULT_WARMUP_REST_SEC = 60

/** The library, without deleted exercises, by name. */
export function useExercises(): Exercise[] | undefined {
  return useLiveQuery(async () =>
    alive(await db.exercises.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  )
}

/** Every exercise by id, deleted ones included, so old workouts keep their names. */
export function useExerciseMap(): Map<string, Exercise> {
  const rows = useShared('exercises', () => db.exercises.toArray())
  return useMemo(() => new Map((rows ?? []).map((exercise) => [exercise.id, exercise])), [rows])
}

export function useTemplates(): WorkoutTemplate[] | undefined {
  return useShared('workoutTemplates', async () => alive(await db.workoutTemplates.toArray()).sort((a, b) => a.order - b.order))
}

/** All workouts, newest first. */
export function useSessions(): WorkoutSession[] | undefined {
  return useShared('workoutSessions', async () =>
    alive(await db.workoutSessions.toArray()).sort((a, b) => b.startedAt - a.startedAt),
  )
}

export const findActive = (sessions: WorkoutSession[] | undefined): WorkoutSession | undefined =>
  sessions?.find((session) => !session.endedAt)

const setsFromPlan = (plan: PlannedSet[]): PerformedSet[] =>
  plan.map(({ kind, ...target }) => ({ key: newId(), kind, target, done: false }))

/** The workout's exercises from a template's, with their sets still to do. */
const fromTemplate = (template: Pick<WorkoutTemplate, 'exercises'> | undefined): SessionExercise[] =>
  (template?.exercises ?? []).map((exercise, i, all) => ({
    // The template's own key (unless repeated), so its order can be saved back even after a swap.
    key: all.findIndex((other) => other.key === exercise.key) === i ? exercise.key : newId(),
    exerciseId: exercise.exerciseId,
    restSec: exercise.restSec,
    warmupRestSec: exercise.warmupRestSec,
    notes: exercise.notes,
    sets: setsFromPlan(exercise.sets),
    supersetWithNext: exercise.supersetWithNext,
  }))

/** Starts a workout from a template, or an empty one to fill as you go. */
export async function startWorkout(template?: WorkoutTemplate): Promise<string> {
  const now = Date.now()
  const session = await save(db.workoutSessions, {
    templateId: template?.id,
    name: template?.name ?? 'Treino livre',
    date: dayKey(now),
    startedAt: now,
    exercises: fromTemplate(template),
  })
  return session.id
}

/** The length of a workout logged afterwards when the template has no history. */
export const DEFAULT_PAST_MINUTES = 60

/**
 * How long the template's workouts usually take, in minutes: the median of its last five finished
 * ones (free workouts for none). DEFAULT_PAST_MINUTES without any.
 */
export function usualMinutes(sessions: WorkoutSession[], templateId: string | undefined): number {
  const minutes = sessions
    .filter((session) => session.endedAt && session.templateId === templateId)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 5)
    .map((session) => (session.endedAt! - session.startedAt) / 60_000)
    .sort((a, b) => a - b)
  if (minutes.length === 0) return DEFAULT_PAST_MINUTES
  const middle = Math.floor(minutes.length / 2)
  const median = minutes.length % 2 ? minutes[middle] : (minutes[middle - 1] + minutes[middle]) / 2
  return Math.max(1, Math.round(median))
}

/**
 * A workout done without the app (forgotten, or a dead phone), finished already. Its sets come filled
 * with what was most likely done, so only what differed needs correcting: last time's same set before
 * that moment, else the template's plan. A set with nothing to fill it with stays unchecked. No set has
 * a time of its own (`completedAt`): that is what tells it was logged afterwards.
 */
export function pastSession(
  template: Pick<WorkoutTemplate, 'id' | 'name' | 'exercises'> | undefined,
  startedAt: number,
  minutes: number,
  sessions: WorkoutSession[],
  typeOf: (exerciseId: string) => ExerciseType,
): Omit<WorkoutSession, keyof Synced> {
  return {
    templateId: template?.id,
    name: template?.name ?? 'Treino livre',
    date: dayKey(startedAt),
    startedAt,
    endedAt: startedAt + minutes * 60_000,
    exercises: fromTemplate(template).map((exercise) => {
      const type = typeOf(exercise.exerciseId)
      const previous = previousSets(exercise.sets, lastPerformance(sessions, exercise.exerciseId, startedAt)?.exercise)
      return {
        ...exercise,
        sets: exercise.sets.map((set, i) => {
          const values = checkedValues(set, previous[i], type)
          const filled = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))
          const done = type === 'time' ? values.durationSec !== undefined : values.reps !== undefined
          return { ...set, ...filled, done }
        }),
      }
    }),
  }
}

/** Saves a workout logged afterwards (see pastSession) and gives its id. */
export async function logPastWorkout(...args: Parameters<typeof pastSession>): Promise<string> {
  return (await save(db.workoutSessions, pastSession(...args))).id
}

/**
 * A finished workout logged afterwards: done sets, none with the time it was checked. A workout followed
 * in the app has every done set timed (checking, the set timer, the watch and the notification all
 * record it).
 */
export function loggedLater(session: WorkoutSession): boolean {
  if (!session.endedAt) return false
  const done = session.exercises.flatMap((exercise) => exercise.sets.filter((set) => set.done))
  return done.length > 0 && done.every((set) => set.completedAt === undefined)
}

/** An exercise added during a workout: as many sets as last time, or three. */
export function newSessionExercise(exerciseId: string, sessions: WorkoutSession[], now: number): SessionExercise {
  const last = lastPerformance(sessions, exerciseId, now)
  const sets: PerformedSet[] = last
    ? last.exercise.sets.filter((set) => set.done).map((set) => ({ key: newId(), kind: set.kind, done: false }))
    : Array.from({ length: 3 }, () => ({ key: newId(), kind: 'normal' as const, done: false }))
  return {
    key: newId(),
    exerciseId,
    restSec: last?.exercise.restSec ?? DEFAULT_REST_SEC,
    warmupRestSec: last?.exercise.warmupRestSec,
    sets,
  }
}

export const updateSession = (id: string, change: (session: WorkoutSession) => WorkoutSession) =>
  mutate(db.workoutSessions, id, change)

export function changeExercise(
  session: WorkoutSession,
  exerciseKey: string,
  change: (exercise: SessionExercise) => SessionExercise | null,
): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.flatMap((exercise) => {
      if (exercise.key !== exerciseKey) return [exercise]
      const changed = change(exercise)
      return changed ? [changed] : []
    }),
  }
}

export function changeSet(
  session: WorkoutSession,
  exerciseKey: string,
  setKey: string,
  change: (set: PerformedSet) => PerformedSet,
): WorkoutSession {
  return changeExercise(session, exerciseKey, (exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => (set.key === setKey ? change(set) : set)),
  }))
}

/**
 * The workout with only the sets that were done. An exercise left with none goes away without leaving
 * its bi-set partner linked to the next exercise.
 */
export function keepDone(session: WorkoutSession): WorkoutSession {
  const done = {
    ...session,
    exercises: session.exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.filter((set) => set.done) })),
  }
  return done.exercises
    .filter((exercise) => exercise.sets.length === 0)
    .reduce((current, empty) => removeExercise(current, empty.key), done)
}

/** Ends the workout, keeping only the sets that were done. */
export const finishWorkout = (id: string) =>
  updateSession(id, (session) => ({ ...keepDone(session), endedAt: Date.now() }))

export const deleteWorkout = (id: string) => remove(db.workoutSessions, id)

/**
 * Whether checking a set of this exercise starts the rest: not in the middle of a bi-set, where the
 * next exercise comes right away.
 */
export const restsAfter = (exercises: SessionExercise[], index: number): boolean =>
  !exercises[index]?.supersetWithNext || index === exercises.length - 1

/** The rest of a set of an exercise: shorter after a warm-up. */
export const restOf = (exercise: Pick<SessionExercise, 'restSec' | 'warmupRestSec'>, kind: SetKind): number =>
  kind === 'warmup' ? (exercise.warmupRestSec ?? DEFAULT_WARMUP_REST_SEC) : exercise.restSec

/**
 * Seconds of rest once this set of the exercise at `index` is checked: none in the middle of a bi-set,
 * where the next exercise comes right away, and the warm-up rest after a warm-up set.
 */
export const restSecAfter = (exercises: SessionExercise[], index: number, kind: SetKind): number =>
  restsAfter(exercises, index) && exercises[index] ? restOf(exercises[index], kind) : 0

/** Checks a set off with the amounts it was done with, now (or when the watch or the notification says). */
export const completeSet = (
  sessionId: string,
  exerciseKey: string,
  setKey: string,
  values: Pick<PerformedSet, 'weightKg' | 'reps' | 'durationSec'>,
  at = Date.now(),
) =>
  updateSession(sessionId, (session) =>
    changeSet(session, exerciseKey, setKey, (set) => ({ ...set, ...values, done: true, completedAt: at })),
  )

/**
 * The working set checked off last (by when, then by place), leaving out timed exercises: where the
 * RIR picker opens. Undefined before the first one.
 */
export function lastCheckedSet(session: WorkoutSession, timed: (exerciseId: string) => boolean): string | undefined {
  let found: string | undefined
  let latest = -Infinity
  for (const exercise of session.exercises) {
    if (timed(exercise.exerciseId)) continue
    for (const set of exercise.sets) {
      if (!set.done || set.kind !== 'normal' || (set.completedAt ?? 0) < latest) continue
      latest = set.completedAt ?? 0
      found = set.key
    }
  }
  return found
}

/**
 * Another exercise in the place of this one (the machine is busy): the sets not done yet move to
 * it, without the old loads. Sets already done stay with the original exercise.
 */
export function swapExercise(session: WorkoutSession, exerciseKey: string, exerciseId: string): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.flatMap((exercise) => {
      if (exercise.key !== exerciseKey) return [exercise]
      const done = exercise.sets.filter((set) => set.done)
      const left = exercise.sets
        .filter((set) => !set.done)
        .map((set) => ({ ...set, weightKg: undefined, target: set.target && { ...set.target, weightKg: undefined } }))
      const swapped = { ...exercise, exerciseId, sets: left, notes: undefined }
      if (done.length === 0) return [swapped]
      return [{ ...exercise, sets: done, supersetWithNext: false }, { ...swapped, key: newId() }]
    }),
  }
}

/**
 * One more set: a working set at the end, with the last working set's target, or a warm-up after the
 * warm-ups already there (first, when there are none), with the last warm-up's target.
 */
export function addSet(exercise: SessionExercise, kind: SetKind): SessionExercise {
  const target = exercise.sets.findLast((s) => s.kind === kind)?.target
  const set: PerformedSet = { key: newId(), kind, target, done: false }
  const at = kind === 'warmup' ? exercise.sets.findLastIndex((s) => s.kind === 'warmup') + 1 : exercise.sets.length
  return { ...exercise, sets: [...exercise.sets.slice(0, at), set, ...exercise.sets.slice(at)] }
}

/** The workout without an exercise. When it closed a bi-set, the one before isn't left linked to the next. */
export function removeExercise(session: WorkoutSession, exerciseKey: string): WorkoutSession {
  const index = session.exercises.findIndex((exercise) => exercise.key === exerciseKey)
  if (index < 0) return session
  const closesPair = !session.exercises[index].supersetWithNext || index === session.exercises.length - 1
  return {
    ...session,
    exercises: session.exercises.flatMap((exercise, i) => {
      if (i === index) return []
      const unlink = i === index - 1 && closesPair && exercise.supersetWithNext
      return [unlink ? { ...exercise, supersetWithNext: false } : exercise]
    }),
  }
}

/** Exercises in runs linked as bi-sets (or longer): what moves as one when reordering. */
export function exerciseBlocks<T extends { supersetWithNext?: boolean }>(exercises: T[]): T[][] {
  const blocks: T[][] = []
  exercises.forEach((exercise, i) => {
    if (i > 0 && exercises[i - 1].supersetWithNext) blocks[blocks.length - 1].push(exercise)
    else blocks.push([exercise])
  })
  return blocks
}

/** A link left on the last exercise of a block (its pair was removed) would pair it with its new neighbor. */
const unlinkLast = <T extends { supersetWithNext?: boolean }>(block: T[]): T[] =>
  block.map((exercise, i) =>
    i === block.length - 1 && exercise.supersetWithNext ? { ...exercise, supersetWithNext: false } : exercise,
  )

/**
 * The exercises with their blocks in a new order, given by the key of each block's first exercise: a
 * bi-set moves whole and stays linked. Blocks the order leaves out (added meanwhile) go at the end.
 */
export function reorderExercises(exercises: SessionExercise[], order: string[]): SessionExercise[] {
  const rank = (block: SessionExercise[]) => {
    const at = order.indexOf(block[0].key)
    return at < 0 ? order.length : at
  }
  return exerciseBlocks(exercises)
    .sort((a, b) => rank(a) - rank(b))
    .flatMap(unlinkLast)
}

/**
 * The template exercise each exercise of the workout came from: the same key (a workout keeps its
 * template's keys, even through a swap), or else the same exercise, in order, so a repeated exercise
 * finds its own copy. Undefined for exercises the template doesn't have.
 */
export function matchTemplate(
  template: TemplateExercise[],
  exercises: SessionExercise[],
): (TemplateExercise | undefined)[] {
  const free = new Set(template)
  const take = (found: TemplateExercise | undefined) => {
    if (found) free.delete(found)
    return found
  }
  const byKey = exercises.map((exercise) => take(template.find((t) => free.has(t) && t.key === exercise.key)))
  return byKey.map(
    (match, i) => match ?? take(template.find((t) => free.has(t) && t.exerciseId === exercises[i].exerciseId)),
  )
}

/**
 * The template's exercises in the workout's order, to save it back. Each of the template's bi-sets
 * moves whole, to where the first of its exercises is in the workout; one the workout doesn't have
 * stays after the exercise it followed. Exercises only in the workout stay out of the template.
 */
export function templateInOrder(template: TemplateExercise[], exercises: SessionExercise[]): TemplateExercise[] {
  const position = new Map<TemplateExercise, number>()
  matchTemplate(template, exercises).forEach((match, i) => match && position.set(match, i))
  let anchor = -1
  const placed = exerciseBlocks(template).map((block, i) => {
    const at = Math.min(...block.flatMap((exercise) => position.get(exercise) ?? []))
    if (Number.isFinite(at)) anchor = at
    // A block the workout lacks keeps following the one it came after (or stays first).
    return { block, at: Number.isFinite(at) ? at : anchor, after: Number.isFinite(at) ? 0 : 1, i }
  })
  return placed
    .sort((a, b) => a.at - b.at || a.after - b.after || a.i - b.i)
    .flatMap(({ block }) => unlinkLast(block))
}
