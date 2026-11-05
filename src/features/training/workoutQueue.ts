import { db } from '../../db/schema'
import type { Exercise, ExerciseType, PerformedSet, SessionExercise, SetKind, WorkoutSession } from '../../db/types'
import { setRest, type RestTimer } from './restTimer'
import { checkedValues, previousSets, type SetValues } from './setValues'
import { LOAD_STEP, lastPerformance } from './stats'
import { changeSet, completeSet, restOf, updateSession } from './training'

/** A set still to do, in the order the workout goes. */
export interface PendingSet {
  exerciseIndex: number
  setIndex: number
  /** Its place among the exercise's sets of the same kind: 0 is the first warm-up, or the first working set. */
  position: number
  /** How many sets of that kind the exercise has. */
  count: number
  /** Seconds of rest once it's checked: none inside a bi-set round, nor after the workout's last set. */
  restSec: number
}

/** Exercises done together: a bi-set (or a longer chain) is one group, any other exercise its own. */
function groups(exercises: SessionExercise[]): number[][] {
  const result: number[][] = []
  let group: number[] = []
  exercises.forEach((exercise, index) => {
    group.push(index)
    if (!exercise.supersetWithNext || index === exercises.length - 1) {
      result.push(group)
      group = []
    }
  })
  return result
}

const KINDS: SetKind[] = ['warmup', 'normal']

/**
 * A group's sets still to do: the warm-ups, then the working sets, in rounds that alternate between
 * its exercises (A1, B1, A2, B2…). Sets pair by position, so a round keeps its place when one of its
 * sets was checked out of order. The rest comes after the last set still to do in each round.
 */
function groupSets(exercises: SessionExercise[], group: number[]): PendingSet[] {
  const result: PendingSet[] = []
  for (const kind of KINDS) {
    const columns = group.map((exerciseIndex) =>
      exercises[exerciseIndex].sets.flatMap((set, setIndex) => (set.kind === kind ? [{ set, setIndex }] : [])),
    )
    const rounds = Math.max(0, ...columns.map((column) => column.length))
    for (let position = 0; position < rounds; position++) {
      const round = group.flatMap((exerciseIndex, column): PendingSet[] => {
        const entry = columns[column][position]
        if (!entry || entry.set.done) return []
        return [{ exerciseIndex, setIndex: entry.setIndex, position, count: columns[column].length, restSec: 0 }]
      })
      const last = round.at(-1)
      if (last) last.restSec = restOf(exercises[last.exerciseIndex], kind)
      result.push(...round)
    }
  }
  return result
}

/** The exercise (its index) of the set checked off last. */
function latestDone(exercises: SessionExercise[]): number | undefined {
  let found: number | undefined
  let latest = -Infinity
  exercises.forEach((exercise, index) => {
    for (const set of exercise.sets) {
      if (set.done && set.completedAt !== undefined && set.completedAt > latest) {
        latest = set.completedAt
        found = index
      }
    }
  })
  return found
}

/**
 * The sets still to do in the order the notification walks them: from the exercise (or bi-set) of
 * the set checked last, so it follows the user when they change the order, then the ones after it,
 * then the ones left behind.
 */
export function pendingSets(session: WorkoutSession): PendingSet[] {
  const { exercises } = session
  const all = groups(exercises)
  const latest = latestDone(exercises)
  const start = latest === undefined ? 0 : Math.max(0, all.findIndex((group) => group.includes(latest)))
  const sets = [...all.slice(start), ...all.slice(0, start)].flatMap((group) => groupSets(exercises, group))
  // Nothing to rest for after the last one.
  const final = sets.at(-1)
  if (final) final.restSec = 0
  return sets
}

/** "Aquecimento 1 de 2", "Série 2 de 4". */
export const setLabel = (kind: SetKind, position: number, count: number): string =>
  `${kind === 'warmup' ? 'Aquecimento' : 'Série'} ${position + 1} de ${count}`

/** The load −/+ step: the equipment's, as the app's load stepper, and 2.5 kg when it has none. */
export const loadStep = (info: Exercise | undefined): number =>
  info && LOAD_STEP[info.equipment] > 0 ? LOAD_STEP[info.equipment] : 2.5

/** One set as the notification shows it. */
export interface NotificationSet extends SetValues {
  exerciseKey: string
  setKey: string
  /** The exercise's name. */
  exercise: string
  /** "Aquecimento 1 de 2", "Série 2 de 4". */
  label: string
  kind: SetKind
  type: ExerciseType
  /** Load −/+ step, kg. */
  step: number
  /** Seconds of rest once it's checked (0: none). */
  restSec: number
  /** Where −/+ start for a value the app has nothing for: the exercise's latest set done today. */
  seed?: SetValues
}

/** What the Android notification shows, as the app pushes it to the native side. */
export interface NotificationState {
  sessionId: string
  /** The workout's name. */
  title: string
  /** The sets still to do, in order; the first is the current one. */
  sets: NotificationSet[]
  rest: RestTimer | null
}

/** For the values the app has nothing for, the same exercise's latest set done today (same kind first). */
function seedFor(exercise: SessionExercise, set: PerformedSet, values: SetValues, type: ExerciseType): SetValues | undefined {
  const done = exercise.sets
    .filter((other) => other.done)
    .sort((a, b) => Number(b.kind === set.kind) - Number(a.kind === set.kind) || (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const latest = (key: keyof SetValues) => done.find((other) => other[key] !== undefined)?.[key]
  const seed: SetValues = {
    weightKg: type === 'weight_reps' && values.weightKg === undefined ? latest('weightKg') : undefined,
    reps: type !== 'time' && values.reps === undefined ? latest('reps') : undefined,
    durationSec: type === 'time' && values.durationSec === undefined ? latest('durationSec') : undefined,
  }
  return Object.values(seed).some((value) => value !== undefined) ? seed : undefined
}

/**
 * The notification's state for the workout in progress: each set still to do with the values the
 * app would check it with, and the rest running.
 */
export function notificationState(
  session: WorkoutSession,
  exercises: Map<string, Exercise>,
  history: WorkoutSession[],
  rest: RestTimer | null,
): NotificationState {
  const previous = new Map<number, (PerformedSet | undefined)[]>()
  const previousOf = (index: number) => {
    let sets = previous.get(index)
    if (!sets) {
      const exercise = session.exercises[index]
      const last = lastPerformance(history, exercise.exerciseId, session.startedAt)
      sets = previousSets(exercise.sets, last?.exercise)
      previous.set(index, sets)
    }
    return sets
  }
  const sets = pendingSets(session).map(({ exerciseIndex, setIndex, position, count, restSec }): NotificationSet => {
    const exercise = session.exercises[exerciseIndex]
    const set = exercise.sets[setIndex]
    const info = exercises.get(exercise.exerciseId)
    const type = info?.type ?? 'weight_reps'
    const values = checkedValues(set, previousOf(exerciseIndex)[setIndex], type)
    const seed = seedFor(exercise, set, values, type)
    return {
      exerciseKey: exercise.key,
      setKey: set.key,
      exercise: info?.name ?? 'Exercício',
      label: setLabel(set.kind, position, count),
      kind: set.kind,
      type,
      ...values,
      step: loadStep(info),
      restSec,
      ...(seed && { seed }),
    }
  })
  return { sessionId: session.id, title: session.name, sets, rest }
}

interface SetAction extends SetValues {
  /** Its place in the phone's queue, counting from 1 and never reused. */
  id: number
  sessionId: string
  exerciseKey: string
  setKey: string
}

/** −/+ on the current set: the value it was changed to (only that one). */
export interface ValuesAction extends SetAction {
  type: 'values'
}

/** "Concluir": the set done with the values shown, when, and the rest it started (none in a bi-set). */
export interface CompleteAction extends SetAction {
  type: 'complete'
  at: number
  rest?: RestTimer
}

/** "+15 s" or "Pular": the rest as it is after the tap; null once skipped. */
export interface RestAction {
  id: number
  type: 'rest'
  rest: RestTimer | null
}

/** Something done in the notification, queued on the phone until the app applies it. */
export type WorkoutAction = ValuesAction | CompleteAction | RestAction

const VALUE_KEYS = ['weightKg', 'reps', 'durationSec'] as const

const findSet = (session: WorkoutSession, exerciseKey: string, setKey: string): PerformedSet | undefined =>
  session.exercises.find((exercise) => exercise.key === exerciseKey)?.sets.find((set) => set.key === setKey)

/** The workout with the values −/+ left on a set still to do; null when that changes nothing. */
export function withValues(session: WorkoutSession, action: ValuesAction): WorkoutSession | null {
  const set = findSet(session, action.exerciseKey, action.setKey)
  if (!set || set.done) return null
  const changes: SetValues = {}
  for (const key of VALUE_KEYS) {
    // The native side leaves out what didn't change; JSON may bring an empty one as null.
    if (key in action) changes[key] = action[key] ?? undefined
  }
  if (VALUE_KEYS.every((key) => !(key in changes) || changes[key] === set[key])) return null
  return changeSet(session, action.exerciseKey, action.setKey, (current) => ({ ...current, ...changes }))
}

/** Whether "Concluir" still has a set to check: the same tap can arrive twice, or after one in the app. */
export const isPending = (session: WorkoutSession, exerciseKey: string, setKey: string): boolean => {
  const set = findSet(session, exerciseKey, setKey)
  return !!set && !set.done
}

/**
 * Applies to the workout and the rest timer something done in the notification. Safe to repeat:
 * values and rests are absolute, and a set already done stays as it is.
 */
export async function applyAction(action: WorkoutAction): Promise<void> {
  if (action.type === 'rest') {
    setRest(action.rest)
    return
  }
  const session = await db.workoutSessions.get(action.sessionId)
  if (!session || session.deleted) return
  if (action.type === 'values') {
    if (withValues(session, action)) await updateSession(session.id, (current) => withValues(current, action) ?? current)
    return
  }
  if (isPending(session, action.exerciseKey, action.setKey)) {
    const values = { weightKg: action.weightKg ?? undefined, reps: action.reps ?? undefined, durationSec: action.durationSec ?? undefined }
    await completeSet(session.id, action.exerciseKey, action.setKey, values, action.at)
  }
  if (action.rest) setRest(action.rest)
}
