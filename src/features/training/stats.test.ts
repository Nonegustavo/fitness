import { describe, expect, it } from 'vitest'
import type { Exercise, PerformedSet, WorkoutSession, WorkoutTemplate } from '../../db/types'
import {
  epley,
  lastPerformance,
  nextTemplate,
  personalRecords,
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
})

describe('personalRecords', () => {
  it('flags exercises whose estimated 1RM beats every earlier session', () => {
    const earlier = session('earlier', 1_000, { bench: [set(60, 10)], squat: [set(100, 5)] })
    const today = session('today', 2_000, { bench: [set(62.5, 10)], squat: [set(100, 4)], row: [set(50, 10)] })
    expect(personalRecords(today, [earlier, today])).toEqual(new Set(['bench']))
  })
})
