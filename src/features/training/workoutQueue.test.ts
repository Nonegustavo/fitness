import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/schema'
import type { Exercise, PerformedSet, SessionExercise, WorkoutSession } from '../../db/types'
import { getRestTimer, stopRest } from './restTimer'
import { checkedValues, previousSets } from './setValues'
import { DEFAULT_WARMUP_REST_SEC } from './training'
import {
  applyAction,
  isPending,
  notificationState,
  pendingSets,
  withValues,
  type CompleteAction,
  type ValuesAction,
} from './workoutQueue'

const meta = { updatedAt: 0, deleted: 0 as const, dirty: 0 as const }

const set = (key: string, changes: Partial<PerformedSet> = {}): PerformedSet => ({
  key,
  kind: 'normal',
  done: false,
  ...changes,
})

const warmup = (key: string, changes: Partial<PerformedSet> = {}) => set(key, { kind: 'warmup', ...changes })

const exercise = (key: string, sets: PerformedSet[], changes: Partial<SessionExercise> = {}): SessionExercise => ({
  key,
  exerciseId: key,
  restSec: 90,
  sets,
  ...changes,
})

const workout = (exercises: SessionExercise[], changes: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: 'w',
  name: 'Treino A',
  date: '2026-11-05',
  startedAt: 10_000,
  exercises,
  ...meta,
  ...changes,
})

const info = (id: string, changes: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id.toUpperCase(),
  muscle: 'chest',
  equipment: 'barbell',
  type: 'weight_reps',
  ...meta,
  ...changes,
})

/** "a:1" for the set "1" of the exercise "a", with its rest: the order the notification walks. */
const walk = (session: WorkoutSession) =>
  pendingSets(session).map(({ exerciseIndex, setIndex, restSec }) => {
    const exercise = session.exercises[exerciseIndex]
    return `${exercise.key}:${exercise.sets[setIndex].key}/${restSec}`
  })

describe('previousSets and checkedValues', () => {
  it('pairs each set with the same kind and place last time, skipping what was not done', () => {
    const last = exercise('a', [
      warmup('w1', { done: true, weightKg: 20 }),
      warmup('w2', { done: false, weightKg: 30 }),
      set('1', { done: true, weightKg: 60 }),
      set('2', { done: true, weightKg: 62.5 }),
    ])
    const now = [warmup('x1'), set('x2'), warmup('x3'), set('x4'), set('x5')]
    expect(previousSets(now, last).map((previous) => previous?.weightKg)).toEqual([20, 60, undefined, 62.5, undefined])
    expect(previousSets(now, undefined)).toEqual([undefined, undefined, undefined, undefined, undefined])
  })

  it('checks with the set own values, else last time, else the target, as the exercise records', () => {
    const target = { reps: 8, repsMax: 12, weightKg: 50, durationSec: 30 }
    const previous = set('p', { done: true, weightKg: 60, reps: 10, durationSec: 45 })
    expect(checkedValues(set('1', { target, reps: 9 }), previous, 'weight_reps')).toEqual({ weightKg: 60, reps: 9, durationSec: undefined })
    expect(checkedValues(set('1', { target }), undefined, 'weight_reps')).toEqual({ weightKg: 50, reps: 8, durationSec: undefined })
    expect(checkedValues(set('1', { target, weightKg: 40 }), previous, 'reps')).toEqual({ weightKg: undefined, reps: 10, durationSec: undefined })
    expect(checkedValues(set('1', { target }), previous, 'time')).toEqual({ weightKg: undefined, reps: undefined, durationSec: 45 })
    expect(checkedValues(set('1'), undefined, 'weight_reps')).toEqual({ weightKg: undefined, reps: undefined, durationSec: undefined })
  })
})

describe('pendingSets', () => {
  it('does the warm-ups first, rests after each set and not after the last one', () => {
    const session = workout([
      exercise('a', [warmup('w1'), warmup('w2'), set('1'), set('2')], { warmupRestSec: 45 }),
      exercise('b', [set('1')], { restSec: 120 }),
    ])
    expect(walk(session)).toEqual(['a:w1/45', 'a:w2/45', 'a:1/90', 'a:2/90', 'b:1/0'])
  })

  it('alternates a bi-set round by round, with the rest after the pair', () => {
    const session = workout([
      exercise('a', [warmup('w1'), set('1'), set('2'), set('3')], { supersetWithNext: true, restSec: 60 }),
      exercise('b', [set('1'), set('2')], { restSec: 120 }),
      exercise('c', [set('1')]),
    ])
    // A's warm-up has no pair; A's third set neither, so it rests on its own.
    expect(walk(session)).toEqual([`a:w1/${DEFAULT_WARMUP_REST_SEC}`, 'a:1/0', 'b:1/120', 'a:2/0', 'b:2/120', 'a:3/60', 'c:1/0'])
  })

  it('keeps the pairs when a set of the round was checked first', () => {
    const session = workout([
      exercise('a', [set('1', { done: true, completedAt: 20_000 }), set('2'), set('3')], { supersetWithNext: true }),
      exercise('b', [set('1'), set('2', { done: true, completedAt: 21_000 }), set('3')], { restSec: 120 }),
    ])
    // B1 still to do closes the first pair; A2 closes the second, where B2 was already done.
    expect(walk(session)).toEqual(['b:1/120', 'a:2/90', 'a:3/0', 'b:3/0'])
  })

  it('follows the exercise checked last, then the ones after it, then the ones left behind', () => {
    const session = workout([
      exercise('a', [set('1', { done: true, completedAt: 20_000 }), set('2')]),
      exercise('b', [set('1')]),
      exercise('c', [set('1', { done: true, completedAt: 30_000 }), set('2')]),
      exercise('d', [set('1')]),
    ])
    expect(walk(session)).toEqual(['c:2/90', 'd:1/90', 'a:2/90', 'b:1/0'])
  })

  it('treats a chain of linked exercises as one group, and a last one left linked as its own', () => {
    const session = workout([
      exercise('a', [set('1'), set('2')], { supersetWithNext: true }),
      exercise('b', [set('1'), set('2')], { supersetWithNext: true }),
      exercise('c', [set('1'), set('2')], { supersetWithNext: true }),
    ])
    expect(walk(session)).toEqual(['a:1/0', 'b:1/0', 'c:1/90', 'a:2/0', 'b:2/0', 'c:2/0'])
    expect(walk(workout([]))).toEqual([])
  })
})

describe('notificationState', () => {
  const library = new Map([
    ['a', info('a', { name: 'Supino reto', equipment: 'machine' })],
    ['b', info('b', { name: 'Prancha', equipment: 'bodyweight', type: 'time' })],
  ])
  const last = workout(
    [
      exercise('a', [warmup('w', { done: true, weightKg: 20, reps: 12 }), set('1', { done: true, weightKg: 70, reps: 10 })]),
      exercise('b', [set('1', { done: true, durationSec: 45 })]),
    ],
    { id: 'old', startedAt: 1_000, endedAt: 5_000 },
  )

  it('labels each set and starts it from what checking it in the app would record', () => {
    const session = workout([
      exercise('a', [warmup('w'), set('1', { reps: 8 }), set('2', { target: { reps: 12 } })]),
      exercise('b', [set('1'), set('2')], { restSec: 30 }),
    ])
    const rest = { endsAt: 99_000, totalSec: 90, label: 'Supino reto' }
    const state = notificationState(session, library, [session, last], rest)
    expect(state).toMatchObject({ sessionId: 'w', title: 'Treino A', rest })
    expect(state.sets).toEqual([
      expect.objectContaining({ exerciseKey: 'a', setKey: 'w', exercise: 'Supino reto', label: 'Aquecimento 1 de 1', kind: 'warmup', weightKg: 20, reps: 12, step: 5, restSec: DEFAULT_WARMUP_REST_SEC }),
      expect.objectContaining({ setKey: '1', label: 'Série 1 de 2', weightKg: 70, reps: 8, restSec: 90 }),
      expect.objectContaining({ setKey: '2', label: 'Série 2 de 2', weightKg: undefined, reps: 12 }),
      expect.objectContaining({ exerciseKey: 'b', setKey: '1', type: 'time', durationSec: 45, reps: undefined, step: 2.5, restSec: 30 }),
      expect.objectContaining({ exerciseKey: 'b', setKey: '2', label: 'Série 2 de 2', durationSec: undefined, restSec: 0 }),
    ])
  })

  it('gives −/+ a start for what the app has nothing for: the latest set done today, same kind first', () => {
    const session = workout([
      exercise('a', [
        warmup('w', { done: true, weightKg: 30, reps: 15, completedAt: 30_000 }),
        set('1', { done: true, weightKg: 80, reps: 9, completedAt: 20_000 }),
        set('2'),
        set('3', { weightKg: 85 }),
      ]),
    ])
    const [second, third] = notificationState(session, library, [session], null).sets
    expect(second).toMatchObject({ setKey: '2', seed: { weightKg: 80, reps: 9 } })
    expect(third).toMatchObject({ setKey: '3', weightKg: 85, seed: { reps: 9 } })
    expect(third.seed?.weightKg).toBeUndefined()
  })
})

describe('applying what was done in the notification', () => {
  const values = (changes: Partial<ValuesAction>): ValuesAction => ({
    id: 1,
    type: 'values',
    sessionId: 'w',
    exerciseKey: 'a',
    setKey: '2',
    ...changes,
  })
  const complete = (changes: Partial<CompleteAction>): CompleteAction => ({
    id: 2,
    type: 'complete',
    sessionId: 'w',
    exerciseKey: 'a',
    setKey: '2',
    at: 50_000,
    ...changes,
  })
  const session = workout([exercise('a', [set('1', { done: true, weightKg: 60, reps: 10 }), set('2', { reps: 10 })])])

  it('changes only the value sent, and only on a set still to do', () => {
    const changed = withValues(session, values({ weightKg: 62.5 }))
    expect(changed?.exercises[0].sets[1]).toEqual(set('2', { reps: 10, weightKg: 62.5 }))
    expect(withValues(session, values({ reps: 10 }))).toBeNull()
    expect(withValues(session, values({ setKey: '1', weightKg: 70 }))).toBeNull()
    expect(withValues(session, values({ setKey: 'gone', weightKg: 70 }))).toBeNull()
    expect(isPending(session, 'a', '2')).toBe(true)
    expect(isPending(session, 'a', '1')).toBe(false)
  })

  describe('to the stored workout and the rest timer', () => {
    beforeEach(async () => {
      stopRest()
      await db.workoutSessions.clear()
      await db.workoutSessions.put(session)
    })

    const stored = async () => (await db.workoutSessions.get('w'))!.exercises[0].sets[1]

    it('checks the set with the values shown and starts its rest, once', async () => {
      const rest = { endsAt: Date.now() + 60_000, totalSec: 90, label: 'Supino reto' }
      await applyAction(values({ weightKg: 62.5 }))
      await applyAction(complete({ weightKg: 62.5, reps: 8, rest }))
      expect(await stored()).toEqual(set('2', { done: true, weightKg: 62.5, reps: 8, durationSec: undefined, completedAt: 50_000 }))
      expect(getRestTimer()).toEqual(rest)
      expect((await db.workoutSessions.get('w'))?.dirty).toBe(1)

      // The same tap again (not acknowledged before the app closed) changes nothing.
      await applyAction(complete({ weightKg: 70, reps: 12, at: 60_000, rest }))
      await applyAction(values({ weightKg: 100 }))
      expect(await stored()).toMatchObject({ weightKg: 62.5, reps: 8, completedAt: 50_000 })
    })

    it('lengthens and skips the rest, and leaves no timer for a rest already over', async () => {
      const rest = { endsAt: Date.now() + 60_000, totalSec: 90, label: 'Supino reto' }
      await applyAction({ id: 3, type: 'rest', rest })
      await applyAction({ id: 4, type: 'rest', rest: { ...rest, endsAt: rest.endsAt + 15_000, totalSec: 105 } })
      expect(getRestTimer()).toEqual({ ...rest, endsAt: rest.endsAt + 15_000, totalSec: 105 })
      await applyAction({ id: 5, type: 'rest', rest: null })
      expect(getRestTimer()).toBeNull()
      await applyAction(complete({ reps: 10, rest: { ...rest, endsAt: Date.now() - 1_000 } }))
      expect(getRestTimer()).toBeNull()
      expect(await stored()).toMatchObject({ done: true, reps: 10 })
    })

    it('ignores a workout that is gone', async () => {
      await db.workoutSessions.put({ ...session, deleted: 1 })
      await applyAction(complete({ reps: 10, rest: { endsAt: Date.now() + 60_000, totalSec: 90, label: 'x' } }))
      expect(await stored()).toMatchObject({ done: false })
      expect(getRestTimer()).toBeNull()
    })
  })
})
