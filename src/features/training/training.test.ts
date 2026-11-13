import { describe, expect, it } from 'vitest'
import type { ExerciseType, PerformedSet, SessionExercise, TemplateExercise, WorkoutSession, WorkoutTemplate } from '../../db/types'
import {
  addSet,
  DEFAULT_WARMUP_REST_SEC,
  exerciseBlocks,
  keepDone,
  lastCheckedSet,
  matchTemplate,
  pastSession,
  removeExercise,
  reorderExercises,
  restOf,
  restSecAfter,
  templateInOrder,
  usualMinutes,
} from './training'

const exercise = (changes: Partial<SessionExercise> = {}): SessionExercise => ({
  key: changes.key ?? 'e',
  exerciseId: 'x',
  restSec: 90,
  sets: [],
  ...changes,
})

describe('rest after a set', () => {
  it('is the exercise rest after a working set and the warm-up rest after a warm-up', () => {
    expect(restOf(exercise(), 'normal')).toBe(90)
    expect(restOf(exercise(), 'warmup')).toBe(DEFAULT_WARMUP_REST_SEC)
    expect(restOf(exercise({ warmupRestSec: 45 }), 'warmup')).toBe(45)
  })

  it('waits for the second exercise of a bi-set', () => {
    const pair = [exercise({ key: 'a', supersetWithNext: true, restSec: 60 }), exercise({ key: 'b', restSec: 120 })]
    expect(restSecAfter(pair, 0, 'normal')).toBe(0)
    expect(restSecAfter(pair, 0, 'warmup')).toBe(0)
    expect(restSecAfter(pair, 1, 'normal')).toBe(120)
    expect(restSecAfter(pair, 1, 'warmup')).toBe(DEFAULT_WARMUP_REST_SEC)
  })

  it('rests after the last exercise even when it was left linked', () => {
    expect(restSecAfter([exercise({ supersetWithNext: true })], 0, 'normal')).toBe(90)
    expect(restSecAfter([], 0, 'normal')).toBe(0)
  })
})

/** Exercises named by their key ("a+b" links a to b), the exercise id being the key's letter. */
const workout = (spec: string): SessionExercise[] =>
  spec.split(' ').flatMap((block) =>
    block.split('+').map((key, i, keys) => exercise({ key, exerciseId: key[0], supersetWithNext: i < keys.length - 1 || undefined })),
  )
/** The same notation back: keys in order, "+" between linked ones. */
const notation = (exercises: { key: string; supersetWithNext?: boolean }[]): string =>
  exercises.map((e, i) => e.key + (i === exercises.length - 1 ? '' : e.supersetWithNext ? '+' : ' ')).join('')

describe('reordering exercises', () => {
  it('groups bi-sets (and longer runs) into blocks', () => {
    expect(exerciseBlocks(workout('a b+c d')).map((block) => block.map((e) => e.key))).toEqual([['a'], ['b', 'c'], ['d']])
    expect(exerciseBlocks(workout('a+b+c d')).map((block) => block.length)).toEqual([3, 1])
    expect(exerciseBlocks([])).toEqual([])
  })

  it('moves a bi-set as one block, still linked', () => {
    expect(notation(reorderExercises(workout('a b+c d'), ['d', 'b', 'a']))).toBe('d b+c a')
    expect(notation(reorderExercises(workout('a+b+c d'), ['d', 'a']))).toBe('d a+b+c')
  })

  it('unlinks a stale link so it never pairs with the new neighbor', () => {
    // b's pair was removed, leaving it linked to nothing at the end.
    const stale = [exercise({ key: 'a' }), exercise({ key: 'b', supersetWithNext: true })]
    const reordered = reorderExercises(stale, ['b', 'a'])
    expect(reordered.map((e) => e.key)).toEqual(['b', 'a'])
    expect(reordered[0].supersetWithNext).toBe(false)
  })

  it('puts blocks the order leaves out at the end', () => {
    expect(notation(reorderExercises(workout('a b c'), ['c', 'a']))).toBe('c a b')
  })
})

describe('saving the order to the template', () => {
  const plan = (key: string, exerciseId = key[0], supersetWithNext?: boolean): TemplateExercise => ({
    key,
    exerciseId,
    restSec: 90,
    sets: [],
    supersetWithNext,
  })
  const done = (key: string, exerciseId = key[0], supersetWithNext?: boolean) => exercise({ key, exerciseId, supersetWithNext })
  const keys = (list: { key: string }[]) => list.map((e) => e.key)

  it('matches by key first, so a swapped exercise keeps its template place', () => {
    const template = [plan('t1', 'leg'), plan('t2', 'squat')]
    // t2 swapped for a hack squat: same key, another exercise.
    const matches = matchTemplate(template, [done('t2', 'hack'), done('t1', 'leg')])
    expect(matches.map((m) => m?.key)).toEqual(['t2', 't1'])
    expect(keys(templateInOrder(template, [done('t2', 'hack'), done('t1', 'leg')]))).toEqual(['t2', 't1'])
  })

  it('matches by exercise otherwise, a repeated one to its own copy in order', () => {
    const template = [plan('t1', 'abs'), plan('t2', 'bench'), plan('t3', 'abs')]
    const exercises = [done('x1', 'bench'), done('x2', 'abs'), done('x3', 'abs'), done('x4', 'abs')]
    expect(matchTemplate(template, exercises).map((m) => m?.key)).toEqual(['t2', 't1', 't3', undefined])
    expect(keys(templateInOrder(template, exercises))).toEqual(['t2', 't1', 't3'])
  })

  it('keeps the template as it is when the order is the same', () => {
    const template = [plan('t1', 'a'), plan('t2', 'b', true), plan('t3', 'c'), plan('t4', 'd')]
    const ordered = templateInOrder(template, [done('t1', 'a'), done('t2', 'b', true), done('t3', 'c'), done('t4', 'd')])
    expect(ordered).toEqual(template)
  })

  it('moves the template bi-sets whole, even when only one of the pair was done', () => {
    const template = [plan('t1', 'a'), plan('t2', 'b', true), plan('t3', 'c'), plan('t4', 'd')]
    // c was left out today; d came first.
    const ordered = templateInOrder(template, [done('x4', 'd'), done('x2', 'b'), done('x1', 'a')])
    expect(notation(ordered)).toBe('t4 t2+t3 t1')
  })

  it('leaves out exercises only in the workout and keeps the ones it lacks after what they followed', () => {
    const template = [plan('t1', 'a'), plan('t2', 'b'), plan('t3', 'c'), plan('t4', 'd')]
    // b was skipped, e was added.
    const ordered = templateInOrder(template, [done('x4', 'd'), done('x5', 'e'), done('x1', 'a'), done('x3', 'c')])
    expect(keys(ordered)).toEqual(['t4', 't1', 't2', 't3'])
    // Skipped ones at the start stay at the start.
    expect(keys(templateInOrder(template, [done('x4', 'd'), done('x3', 'c'), done('x2', 'b')]))).toEqual(['t1', 't4', 't3', 't2'])
  })

  it('unlinks a template exercise left linked at the end once it moves', () => {
    const template = [plan('t1', 'a'), plan('t2', 'b', true)]
    const ordered = templateInOrder(template, [done('t2', 'b'), done('t1', 'a')])
    expect(keys(ordered)).toEqual(['t2', 't1'])
    expect(ordered[0].supersetWithNext).toBe(false)
  })
})

describe('sets and exercises during a workout', () => {
  const performed = (key: string, kind: PerformedSet['kind'], reps?: number): PerformedSet => ({
    key,
    kind,
    done: false,
    target: reps === undefined ? undefined : { reps },
  })

  it('adds a working set at the end with the last working target', () => {
    const added = addSet(exercise({ sets: [performed('w', 'warmup', 15), performed('1', 'normal', 8)] }), 'normal')
    expect(added.sets.map((s) => s.kind)).toEqual(['warmup', 'normal', 'normal'])
    expect(added.sets[2]).toMatchObject({ kind: 'normal', done: false, target: { reps: 8 } })
  })

  it('adds a warm-up after the warm-ups already there, or first', () => {
    const sets = [performed('w', 'warmup', 15), performed('1', 'normal', 8), performed('2', 'normal', 8)]
    const added = addSet(exercise({ sets }), 'warmup')
    expect(added.sets.map((s) => s.key.length > 1 ? 'new' : s.key)).toEqual(['w', 'new', '1', '2'])
    expect(added.sets[1].target).toEqual({ reps: 15 })
    const first = addSet(exercise({ sets: sets.slice(1) }), 'warmup')
    expect(first.sets.map((s) => s.kind)).toEqual(['warmup', 'normal', 'normal'])
    expect(first.sets[0].target).toBeUndefined()
  })

  it('removes an exercise without linking the one before to the next', () => {
    const session = (exercises: SessionExercise[]): WorkoutSession => ({
      id: 's',
      name: 'A',
      date: '2026-11-05',
      startedAt: 0,
      exercises,
      updatedAt: 0,
      deleted: 0,
      dirty: 0,
    })
    // The second of a pair: the first is unlinked.
    expect(notation(removeExercise(session(workout('a+b c')), 'b').exercises)).toBe('a c')
    // The middle of a run of three: the run goes on.
    expect(notation(removeExercise(session(workout('a+b+c d')), 'b').exercises)).toBe('a+c d')
    // The first of a pair: the second one stays as it was.
    expect(notation(removeExercise(session(workout('a+b c')), 'a').exercises)).toBe('b c')
    expect(removeExercise(session(workout('a b')), 'z').exercises).toHaveLength(2)
  })
})

describe('the set checked last', () => {
  const checked = (key: string, completedAt?: number, kind: PerformedSet['kind'] = 'normal'): PerformedSet => ({
    key,
    kind,
    done: true,
    completedAt,
  })
  const session = (exercises: SessionExercise[]): WorkoutSession => ({
    id: 's',
    name: 'A',
    date: '2026-11-05',
    startedAt: 0,
    exercises,
    updatedAt: 0,
    deleted: 0,
    dirty: 0,
  })

  it('is the working set checked latest, leaving out warm-ups and timed exercises', () => {
    const list = [
      exercise({ key: 'a', exerciseId: 'bench', sets: [checked('a1', 10), checked('a2', 30), { key: 'a3', kind: 'normal', done: false }] }),
      exercise({ key: 'b', exerciseId: 'row', sets: [checked('b1', 20), checked('bw', 40, 'warmup')] }),
      exercise({ key: 'c', exerciseId: 'plank', sets: [checked('c1', 50)] }),
    ]
    expect(lastCheckedSet(session(list), (id) => id === 'plank')).toBe('a2')
    expect(lastCheckedSet(session([]), () => false)).toBeUndefined()
  })

  it('falls back to the order without the times', () => {
    expect(lastCheckedSet(session([exercise({ sets: [checked('1'), checked('2')] })]), () => false)).toBe('2')
  })
})

describe('finishing a workout', () => {
  it('drops the sets not done, and an emptied exercise without leaving its partner linked', () => {
    const set = (key: string, done: boolean): PerformedSet => ({ key, kind: 'normal', done })
    const [a, b, c] = workout('a+b c')
    const finished = keepDone({
      id: 's',
      name: 'A',
      date: '2026-11-05',
      startedAt: 0,
      exercises: [
        { ...a, sets: [set('a1', true), set('a2', false)] },
        { ...b, sets: [set('b1', false)] },
        { ...c, sets: [set('c1', true)] },
      ],
      updatedAt: 0,
      deleted: 0,
      dirty: 0,
    })
    expect(notation(finished.exercises)).toBe('a c')
    expect(finished.exercises[0].sets.map((s) => s.key)).toEqual(['a1'])
  })
})

describe('a workout logged afterwards', () => {
  const HOUR = 3_600_000
  const at = Date.UTC(2026, 10, 10, 21, 0)
  // A warm-up and two working sets of bench press, then a bi-set of curls and a timed plank.
  const template: WorkoutTemplate = {
    id: 't',
    name: 'Treino A',
    order: 0,
    updatedAt: 0,
    deleted: 0,
    dirty: 0,
    exercises: [
      {
        key: 'bench',
        exerciseId: 'bench',
        restSec: 120,
        warmupRestSec: 45,
        sets: [
          { kind: 'warmup', reps: 12, weightKg: 20 },
          { kind: 'normal', reps: 8, repsMax: 10, weightKg: 60 },
          { kind: 'normal', reps: 8, repsMax: 10, weightKg: 60 },
        ],
        supersetWithNext: undefined,
      },
      { key: 'curl', exerciseId: 'curl', restSec: 60, sets: [{ kind: 'normal', reps: 12 }], supersetWithNext: true },
      { key: 'dip', exerciseId: 'dip', restSec: 60, sets: [{ kind: 'normal' }] },
      { key: 'plank', exerciseId: 'plank', restSec: 30, sets: [{ kind: 'normal', durationSec: 45 }] },
    ],
  }
  const types: Record<string, ExerciseType> = { bench: 'weight_reps', curl: 'weight_reps', dip: 'reps', plank: 'time' }
  const typeOf = (id: string) => types[id] ?? 'weight_reps'
  const done = (kind: PerformedSet['kind'], values: Partial<PerformedSet>): PerformedSet => ({
    key: Math.random().toString(36),
    kind,
    done: true,
    completedAt: 1,
    ...values,
  })
  const before = (startedAt: number, exercises: SessionExercise[], templateId = 't'): WorkoutSession => ({
    id: `s${startedAt}`,
    templateId,
    name: 'Treino A',
    date: '2026-11-03',
    startedAt,
    endedAt: startedAt + 50 * 60_000,
    exercises,
    updatedAt: 0,
    deleted: 0,
    dirty: 0,
  })

  it('is finished, at the given time and length, with no time on any set', () => {
    const session = pastSession(template, at, 75, [], typeOf)
    expect(session).toMatchObject({ templateId: 't', name: 'Treino A', startedAt: at, endedAt: at + 75 * 60_000 })
    expect(session.date).toMatch(/^2026-11-1[01]$/)
    expect(session.exercises.flatMap((e) => e.sets).every((set) => set.completedAt === undefined)).toBe(true)
  })

  it('fills each set with the plan when the exercise has no history', () => {
    const [bench, curl, dip, plank] = pastSession(template, at, 60, [], typeOf).exercises
    expect(bench.sets.map(({ kind, weightKg, reps, done }) => ({ kind, weightKg, reps, done }))).toEqual([
      { kind: 'warmup', weightKg: 20, reps: 12, done: true },
      { kind: 'normal', weightKg: 60, reps: 8, done: true },
      { kind: 'normal', weightKg: 60, reps: 8, done: true },
    ])
    expect(bench.sets[1].target).toEqual({ reps: 8, repsMax: 10, weightKg: 60 })
    expect(bench).toMatchObject({ key: 'bench', restSec: 120, warmupRestSec: 45 })
    // The bi-set stays linked.
    expect(curl.supersetWithNext).toBe(true)
    expect(curl.sets[0]).toMatchObject({ reps: 12, done: true })
    expect(curl.sets[0].weightKg).toBeUndefined()
    // Nothing to fill it with: left to check.
    expect(dip.sets[0].done).toBe(false)
    expect(plank.sets[0]).toMatchObject({ durationSec: 45, done: true })
    expect(plank.sets[0].reps).toBeUndefined()
  })

  it('fills each set with the same set the last time before it, warm-ups with warm-ups', () => {
    const sessions = [
      before(at - 7 * 24 * HOUR, [exercise({ key: 'bench', exerciseId: 'bench', sets: [done('normal', { weightKg: 55, reps: 10 })] })]),
      before(at - 2 * 24 * HOUR, [
        exercise({
          key: 'bench',
          exerciseId: 'bench',
          sets: [
            done('warmup', { weightKg: 30, reps: 10 }),
            done('normal', { weightKg: 62.5, reps: 9 }),
            done('normal', { weightKg: 62.5, reps: 7 }),
          ],
        }),
        exercise({ key: 'dip', exerciseId: 'dip', sets: [done('normal', { reps: 11 })] }),
        exercise({ key: 'plank', exerciseId: 'plank', sets: [done('normal', { durationSec: 60 })] }),
      ]),
      // Done after the moment logged: not what came before.
      before(at + 24 * HOUR, [exercise({ key: 'bench', exerciseId: 'bench', sets: [done('normal', { weightKg: 70, reps: 5 })] })]),
    ]
    const [bench, curl, dip, plank] = pastSession(template, at, 60, sessions, typeOf).exercises
    expect(bench.sets.map(({ weightKg, reps }) => [weightKg, reps])).toEqual([
      [30, 10],
      [62.5, 9],
      [62.5, 7],
    ])
    expect(bench.sets.every((set) => set.done && set.completedAt === undefined)).toBe(true)
    expect(curl.sets[0]).toMatchObject({ reps: 12, done: true })
    expect(dip.sets[0]).toMatchObject({ reps: 11, done: true })
    expect(plank.sets[0]).toMatchObject({ durationSec: 60, done: true })
  })

  it('is an empty free workout without a template', () => {
    const session = pastSession(undefined, at, 60, [], typeOf)
    expect(session).toMatchObject({ name: 'Treino livre', exercises: [] })
    expect(session.templateId).toBeUndefined()
  })

  it('is marked as logged afterwards, finished, with or without a template', () => {
    expect(pastSession(template, at, 45, [], typeOf)).toMatchObject({ loggedLater: true, startedAt: at, endedAt: at + 45 * 60_000 })
    expect(pastSession(undefined, at, 60, [], typeOf).loggedLater).toBe(true)
  })

  it('lasts as long as the template usually does', () => {
    // null: a free workout.
    const lasting = (startedAt: number, minutes: number, templateId: string | null = 't') => ({
      ...before(startedAt, []),
      templateId: templateId ?? undefined,
      endedAt: startedAt + minutes * 60_000,
    })
    expect(usualMinutes([], 't')).toBe(60)
    const sessions = [
      lasting(1, 40),
      lasting(2, 70),
      lasting(3, 52),
      lasting(4, 55),
      lasting(5, 58),
      lasting(6, 61),
      lasting(7, 30, null),
    ]
    // The last five: 70, 52, 55, 58 and 61.
    expect(usualMinutes(sessions, 't')).toBe(58)
    expect(usualMinutes(sessions, undefined)).toBe(30)
    expect(usualMinutes(sessions, 'other')).toBe(60)
  })
})
