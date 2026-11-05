import { describe, expect, it } from 'vitest'
import type { Exercise, PerformedSet, WorkoutSession, WorkoutTemplate } from '../../db/types'
import {
  compareSet,
  epley,
  lastPerformance,
  loadSuggestion,
  nextTemplate,
  personalRecords,
  setE1rm,
  setsByMuscle,
  suggestNextWeight,
  summarize,
} from './stats'

const meta = { updatedAt: 0, deleted: 0 as const, dirty: 0 as const }

const set = (weightKg: number, reps: number, changes: Partial<PerformedSet> = {}): PerformedSet => ({
  key: `${weightKg}x${reps}`,
  kind: 'normal',
  weightKg,
  reps,
  done: true,
  ...changes,
})

const session = (
  id: string,
  startedAt: number,
  exercises: Record<string, PerformedSet[]>,
  changes: Partial<WorkoutSession> = {},
): WorkoutSession => ({
  id,
  name: id,
  date: '2026-11-02',
  startedAt,
  endedAt: startedAt + 3_600_000,
  exercises: Object.entries(exercises).map(([exerciseId, sets]) => ({ key: exerciseId, exerciseId, restSec: 90, sets })),
  ...meta,
  ...changes,
})

describe('epley', () => {
  it('estimates the one-rep max', () => {
    expect(epley(100, 1)).toBe(100)
    expect(epley(100, 10)).toBeCloseTo(133.33)
  })
})

describe('compareSet', () => {
  it('compares the estimated 1RM of sets with a load', () => {
    expect(setE1rm({ weightKg: 62.5, reps: 10 })).toBeCloseTo(83.33)
    expect(compareSet({ weightKg: 62.5, reps: 10 }, { weightKg: 60, reps: 10 }, 'weight_reps')).toEqual({
      metric: 'e1rm',
      value: epley(62.5, 10),
      trend: 'up',
    })
    // Fewer reps with more load can still be less.
    expect(compareSet({ weightKg: 62.5, reps: 6 }, { weightKg: 60, reps: 10 }, 'weight_reps')?.trend).toBe('down')
  })

  it('calls equal what shows equal, to a tenth of a kilo', () => {
    expect(compareSet({ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 10 }, 'weight_reps')?.trend).toBe('same')
    // 68,6 × 5 ≈ 80,03 against 60 × 10 = 80: both read "1RM 80".
    expect(compareSet({ weightKg: 68.6, reps: 5 }, { weightKg: 60, reps: 10 }, 'weight_reps')?.trend).toBe('same')
    expect(compareSet({ weightKg: 68.7, reps: 5 }, { weightKg: 60, reps: 10 }, 'weight_reps')?.trend).toBe('up')
  })

  it('shows the 1RM without a trend when last time had nothing comparable', () => {
    expect(compareSet({ weightKg: 60, reps: 10 }, undefined, 'weight_reps')).toEqual({ metric: 'e1rm', value: 80 })
    expect(compareSet({ weightKg: 60, reps: 10 }, { reps: 12 }, 'weight_reps')?.trend).toBeUndefined()
  })

  it('compares reps at body weight', () => {
    expect(compareSet({ reps: 12 }, { reps: 10 }, 'reps')).toEqual({ metric: 'reps', delta: 2, trend: 'up' })
    expect(compareSet({ weightKg: 0, reps: 9 }, { reps: 10 }, 'weight_reps')).toEqual({ metric: 'reps', delta: -1, trend: 'down' })
    expect(compareSet({ reps: 10 }, { reps: 10 }, 'reps')?.trend).toBe('same')
    // A load last time and none now (or no last time): nothing to say.
    expect(compareSet({ reps: 12 }, { weightKg: 10, reps: 8 }, 'weight_reps')).toBeUndefined()
    expect(compareSet({ reps: 12 }, undefined, 'reps')).toBeUndefined()
  })

  it('compares the duration of timed sets', () => {
    expect(compareSet({ durationSec: 70 }, { durationSec: 60 }, 'time')).toEqual({ metric: 'time', delta: 10, trend: 'up' })
    expect(compareSet({ durationSec: 50 }, { durationSec: 60 }, 'time')?.trend).toBe('down')
    expect(compareSet({ durationSec: 50 }, undefined, 'time')).toBeUndefined()
  })

  it('says nothing until there are reps (or a time)', () => {
    expect(compareSet({ weightKg: 60 }, { weightKg: 60, reps: 10 }, 'weight_reps')).toBeUndefined()
    expect(compareSet({}, { reps: 10 }, 'reps')).toBeUndefined()
    expect(compareSet({}, { durationSec: 30 }, 'time')).toBeUndefined()
  })
})

describe('summarize', () => {
  it('counts only done working sets', () => {
    const s = session('s', 0, {
      bench: [set(40, 12, { kind: 'warmup' }), set(60, 10), set(60, 8, { done: false })],
    })
    expect(summarize(s)).toEqual({ sets: 1, volumeKg: 600, durationMs: 3_600_000 })
  })
})

describe('setsByMuscle', () => {
  it('adds working sets per primary muscle within the period', () => {
    const exercises = new Map<string, Exercise>([
      ['bench', { id: 'bench', name: 'Supino', muscle: 'chest', equipment: 'barbell', type: 'weight_reps', ...meta }],
    ])
    const sessions = [
      session('in', 0, { bench: [set(60, 10), set(60, 10)] }),
      session('out', 0, { bench: [set(60, 10)] }, { date: '2026-10-20' }),
      session('active', 0, { bench: [set(60, 10)] }, { endedAt: undefined }),
    ]
    expect(setsByMuscle(sessions, exercises, '2026-11-02', '2026-11-08')).toEqual(new Map([['chest', 2]]))
  })
})

describe('lastPerformance', () => {
  it('finds the latest finished session before a moment that has the exercise', () => {
    const sessions = [
      session('old', 1_000, { bench: [set(55, 10)] }),
      session('recent', 2_000, { bench: [set(60, 10)] }),
      session('other', 3_000, { squat: [set(100, 5)] }),
      session('later', 9_000, { bench: [set(65, 10)] }),
    ]
    expect(lastPerformance(sessions, 'bench', 5_000)?.session.id).toBe('recent')
  })
})

describe('suggestNextWeight', () => {
  const target = { reps: 8, repsMax: 12 }

  it('goes up one step once every set reached the top of the range', () => {
    expect(suggestNextWeight([set(60, 12, { target }), set(60, 12, { target })], 'barbell')).toBe(62.5)
    expect(suggestNextWeight([set(20, 12, { target })], 'dumbbell')).toBe(22)
  })

  it('waits while any set is short of the top', () => {
    expect(suggestNextWeight([set(60, 12, { target }), set(60, 10, { target })], 'barbell')).toBeUndefined()
  })

  it('needs a rep target', () => {
    expect(suggestNextWeight([set(60, 12)], 'barbell')).toBeUndefined()
  })

  it('goes up when every set had 3 or more reps in reserve, even short of the top', () => {
    const easy = [set(60, 9, { target, rir: 3 }), set(60, 9, { target, rir: 4 })]
    expect(loadSuggestion(easy, 'barbell')).toEqual({ weightKg: 62.5, reason: 'rir' })
    // Without a rep target too.
    expect(suggestNextWeight([set(20, 10, { rir: 3 })], 'dumbbell')).toBe(22)
    // One set with less in reserve, or one not told, isn't enough.
    expect(suggestNextWeight([set(60, 9, { target, rir: 3 }), set(60, 9, { target, rir: 2 })], 'barbell')).toBeUndefined()
    expect(suggestNextWeight([set(60, 9, { target, rir: 3 }), set(60, 9, { target })], 'barbell')).toBeUndefined()
  })

  it('stays when the last set was 0 or 1 rep from failure, even at the top', () => {
    expect(suggestNextWeight([set(60, 12, { target, rir: 2 }), set(60, 12, { target, rir: 1 })], 'barbell')).toBeUndefined()
    expect(suggestNextWeight([set(60, 12, { target }), set(60, 12, { target, rir: 0 })], 'barbell')).toBeUndefined()
    // Only the last set counts for this: an earlier hard set doesn't hold the load back.
    expect(loadSuggestion([set(60, 12, { target, rir: 0 }), set(60, 12, { target, rir: 2 })], 'barbell')).toEqual({
      weightKg: 62.5,
      reason: 'top',
    })
  })
})

describe('nextTemplate', () => {
  const template = (id: string, order: number): WorkoutTemplate => ({ id, name: id, exercises: [], order, ...meta })
  const templates = [template('B', 1), template('A', 0), template('C', 2)]

  it('starts with the first template', () => {
    expect(nextTemplate(templates, [])?.id).toBe('A')
  })

  it('follows the last template used and wraps around', () => {
    expect(nextTemplate(templates, [session('s', 1, {}, { templateId: 'A' })])?.id).toBe('B')
    expect(nextTemplate(templates, [session('s', 1, {}, { templateId: 'C' })])?.id).toBe('A')
  })

  it('leaves archived templates out of the rotation', () => {
    const withOld = [...templates, { ...template('Old', 3), archived: 1 as const }]
    expect(nextTemplate(withOld, [session('s', 1, {}, { templateId: 'C' })])?.id).toBe('A')
    // A workout from an archived template doesn't move the rotation.
    const sessions = [session('s1', 1, {}, { templateId: 'A' }), session('s2', 2, {}, { templateId: 'Old' })]
    expect(nextTemplate(withOld, sessions)?.id).toBe('B')
  })
})

describe('personalRecords', () => {
  it('flags exercises whose estimated 1RM beats every earlier session', () => {
    const earlier = session('earlier', 1_000, { bench: [set(60, 10)], squat: [set(100, 5)] })
    const today = session('today', 2_000, { bench: [set(62.5, 10)], squat: [set(100, 4)], row: [set(50, 10)] })
    expect(personalRecords(today, [earlier, today])).toEqual(new Set(['bench']))
  })
})

describe('stalledExercises', () => {
  const meta = { updatedAt: 0, deleted: 0 as const, dirty: 0 as const }
  const session = (day: number, weightKg: number) => ({
    ...meta,
    id: `s${day}`,
    name: 'A',
    date: `2026-10-${String(day).padStart(2, '0')}`,
    startedAt: day * 86_400_000,
    endedAt: day * 86_400_000 + 3_600_000,
    exercises: [
      {
        key: 'k',
        exerciseId: 'bench',
        restSec: 90,
        sets: [{ key: 'set', kind: 'normal' as const, done: true, weightKg, reps: 8 }],
      },
    ],
  })

  it('flags an exercise whose last 3 sessions did not beat the earlier best', async () => {
    const { stalledExercises, needsDeload } = await import('./stats')
    const stalls = stalledExercises([session(1, 60), session(5, 62.5), session(9, 62.5), session(13, 62.5), session(17, 62.5)], '2026-10-20')
    expect(stalls.map((s) => s.exerciseId)).toEqual(['bench'])
    expect(needsDeload(stalls)).toBe(false)
    expect(needsDeload(stalls.concat(stalls, stalls))).toBe(true)
  })

  it('leaves a progressing exercise alone', async () => {
    const { stalledExercises } = await import('./stats')
    expect(stalledExercises([session(1, 60), session(5, 62.5), session(9, 65), session(13, 67.5)], '2026-10-20')).toEqual([])
  })
})

describe('platesPerSide', () => {
  it('loads each side with the fewest plates', async () => {
    const { platesPerSide, DEFAULT_GYM } = await import('./stats')
    expect(platesPerSide(100, 20, DEFAULT_GYM.plates)).toEqual({ perSide: [25, 15], missing: 0 })
    expect(platesPerSide(62.5, 20, DEFAULT_GYM.plates)).toEqual({ perSide: [20, 1.25], missing: 0 })
  })

  it('finds combinations heaviest-first misses, and says what is missing', async () => {
    const { platesPerSide } = await import('./stats')
    expect(platesPerSide(32, 20, [4, 3])).toEqual({ perSide: [3, 3], missing: 0 })
    expect(platesPerSide(21, 20, [1.25])).toEqual({ perSide: [], missing: 0.5 })
    expect(platesPerSide(15, 20, [5])).toEqual({ perSide: [], missing: 0 })
  })
})

describe('workout helpers', () => {
  const meta = { updatedAt: 0, deleted: 0 as const, dirty: 0 as const }
  const set = (key: string, done: boolean, weightKg?: number) => ({ key, kind: 'normal' as const, done, weightKg, reps: 8, target: { reps: 8, weightKg } })
  const session = {
    ...meta,
    id: 's',
    name: 'A',
    date: '2026-11-04',
    startedAt: 0,
    exercises: [
      { key: 'a', exerciseId: 'supino', restSec: 90, sets: [set('1', true, 60), set('2', false, 60)], supersetWithNext: true },
      { key: 'b', exerciseId: 'remada', restSec: 90, sets: [set('3', false, 50)] },
    ],
  }

  it('rests only after the last exercise of a bi-set', async () => {
    const { restsAfter } = await import('./training')
    expect(restsAfter(session.exercises, 0)).toBe(false)
    expect(restsAfter(session.exercises, 1)).toBe(true)
  })

  it('moves the load of the sets still to do', async () => {
    const { shiftLoad } = await import('./training')
    const shifted = shiftLoad(session.exercises[0], 2.5, 60)
    expect(shifted.sets.map((s) => s.weightKg)).toEqual([60, 62.5])
  })

  it('swaps an exercise, keeping the sets already done with the original', async () => {
    const { swapExercise } = await import('./training')
    const swapped = swapExercise(session, 'a', 'supino-halteres')
    expect(swapped.exercises.map((e) => [e.exerciseId, e.sets.length])).toEqual([
      ['supino', 1],
      ['supino-halteres', 1],
      ['remada', 1],
    ])
    expect(swapped.exercises[1].sets[0].weightKg).toBeUndefined()
    expect(swapped.exercises[0].supersetWithNext).toBe(false)
    expect(swapped.exercises[1].supersetWithNext).toBe(true)
    const fresh = swapExercise(session, 'b', 'remada-baixa')
    expect(fresh.exercises.map((e) => e.exerciseId)).toEqual(['supino', 'remada-baixa'])
    expect(fresh.exercises[1].key).toBe('b')
  })
})
