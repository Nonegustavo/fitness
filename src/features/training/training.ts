import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { alive, mutate, remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type {
  Exercise,
  PerformedSet,
  PlannedSet,
  SessionExercise,
  WorkoutSession,
  WorkoutTemplate,
} from '../../db/types'
import { dayKey } from '../../lib/dates'
import { newId } from '../../lib/ids'
import { lastPerformance } from './stats'

export const DEFAULT_REST_SEC = 90

/** The library, without deleted exercises, by name. */
export function useExercises(): Exercise[] | undefined {
  return useLiveQuery(async () =>
    alive(await db.exercises.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  )
}

/** Every exercise by id, deleted ones included, so old workouts keep their names. */
export function useExerciseMap(): Map<string, Exercise> {
  const rows = useLiveQuery(() => db.exercises.toArray())
  return useMemo(() => new Map((rows ?? []).map((exercise) => [exercise.id, exercise])), [rows])
}

export function useTemplates(): WorkoutTemplate[] | undefined {
  return useLiveQuery(async () => alive(await db.workoutTemplates.toArray()).sort((a, b) => a.order - b.order))
}

/** All workouts, newest first. */
export function useSessions(): WorkoutSession[] | undefined {
  return useLiveQuery(async () =>
    alive(await db.workoutSessions.toArray()).sort((a, b) => b.startedAt - a.startedAt),
  )
}

export const findActive = (sessions: WorkoutSession[] | undefined): WorkoutSession | undefined =>
  sessions?.find((session) => !session.endedAt)

const setsFromPlan = (plan: PlannedSet[]): PerformedSet[] =>
  plan.map(({ kind, ...target }) => ({ key: newId(), kind, target, done: false }))

/** Starts a workout from a template, or an empty one to fill as you go. */
export async function startWorkout(template?: WorkoutTemplate): Promise<string> {
  const now = Date.now()
  const session = await save(db.workoutSessions, {
    templateId: template?.id,
    name: template?.name ?? 'Treino livre',
    date: dayKey(now),
    startedAt: now,
    exercises: (template?.exercises ?? []).map((exercise) => ({
      key: newId(),
      exerciseId: exercise.exerciseId,
      restSec: exercise.restSec,
      notes: exercise.notes,
      sets: setsFromPlan(exercise.sets),
      supersetWithNext: exercise.supersetWithNext,
    })),
  })
  return session.id
}

/** An exercise added during a workout: as many sets as last time, or three. */
export function newSessionExercise(exerciseId: string, sessions: WorkoutSession[], now: number): SessionExercise {
  const last = lastPerformance(sessions, exerciseId, now)
  const sets: PerformedSet[] = last
    ? last.exercise.sets.filter((set) => set.done).map((set) => ({ key: newId(), kind: set.kind, done: false }))
    : Array.from({ length: 3 }, () => ({ key: newId(), kind: 'normal' as const, done: false }))
  return { key: newId(), exerciseId, restSec: last?.exercise.restSec ?? DEFAULT_REST_SEC, sets }
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

/** Ends the workout, keeping only the sets that were done. */
export function finishWorkout(id: string) {
  return updateSession(id, (session) => ({
    ...session,
    endedAt: Date.now(),
    exercises: session.exercises
      .map((exercise) => ({ ...exercise, sets: exercise.sets.filter((set) => set.done) }))
      .filter((exercise) => exercise.sets.length > 0),
  }))
}

export const deleteWorkout = (id: string) => remove(db.workoutSessions, id)

/**
 * Whether checking a set of this exercise starts the rest: not in the middle of a bi-set, where the
 * next exercise comes right away.
 */
export const restsAfter = (exercises: SessionExercise[], index: number): boolean =>
  !exercises[index]?.supersetWithNext || index === exercises.length - 1

/** The weight still to lift moved by a step, on every working set not done yet. */
export function shiftLoad(exercise: SessionExercise, step: number, from: number): SessionExercise {
  const next = Math.max(0, Math.round((from + step) * 100) / 100)
  return {
    ...exercise,
    sets: exercise.sets.map((set) => (set.kind === 'normal' && !set.done ? { ...set, weightKg: next } : set)),
  }
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
