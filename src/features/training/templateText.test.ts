import { describe, expect, it } from 'vitest'
import type { Exercise, PlannedSet, SessionExercise, WorkoutSession } from '../../db/types'
import { doneSetsText, lastTemplateSession, plannedSetText, plannedSetsText, templateTotals } from './templateText'

const normal = (set: Omit<PlannedSet, 'kind'> = {}): PlannedSet => ({ kind: 'normal', ...set })
const warmup = (set: Omit<PlannedSet, 'kind'> = {}): PlannedSet => ({ kind: 'warmup', ...set })

describe('plannedSetText', () => {
  it('writes a set as the session screen does, with the rep range', () => {
    expect(plannedSetText(normal({ weightKg: 40, reps: 8, repsMax: 12 }), 'weight_reps')).toBe('40×8–12')
    expect(plannedSetText(normal({ weightKg: 62.5, reps: 10 }), 'weight_reps')).toBe('62,5×10')
    expect(plannedSetText(normal({ weightKg: 40 }), 'weight_reps')).toBe('40 kg')
    expect(plannedSetText(normal({ reps: 10 }), 'weight_reps')).toBe('10 reps')
    expect(plannedSetText(normal({ reps: 12 }), 'reps')).toBe('PC×12')
    expect(plannedSetText(normal({ durationSec: 45 }), 'time')).toBe('0:45')
    expect(plannedSetText(normal(), 'weight_reps')).toBe('')
  })
})

describe('plannedSetsText', () => {
  it('writes the same set repeated as sets × reps, with the load once', () => {
    const set = normal({ weightKg: 40, reps: 8, repsMax: 12 })
    expect(plannedSetsText([set, set, set], 'weight_reps')).toBe('3 × 8–12 · 40 kg')
    expect(plannedSetsText([normal({ reps: 10 }), normal({ reps: 10 })], 'weight_reps')).toBe('2 × 10')
    expect(plannedSetsText([normal({ reps: 15 }), normal({ reps: 15 })], 'reps')).toBe('2 × 15')
    expect(plannedSetsText([normal({ durationSec: 45 }), normal({ durationSec: 45 })], 'time')).toBe('2 × 0:45')
  })

  it('counts sets the ficha left without numbers', () => {
    expect(plannedSetsText([normal(), normal(), normal()], 'weight_reps')).toBe('3 séries')
    expect(plannedSetsText([warmup()], 'weight_reps')).toBe('1 série')
    expect(plannedSetsText([normal({ weightKg: 30 }), normal({ weightKg: 30 })], 'weight_reps')).toBe('2 séries · 30 kg')
  })

  it('lists sets that differ, one by one', () => {
    const sets = [normal({ weightKg: 40, reps: 12 }), normal({ weightKg: 42.5, reps: 10 }), normal({ weightKg: 45, reps: 8 })]
    expect(plannedSetsText(sets, 'weight_reps')).toBe('40×12 · 42,5×10 · 45×8')
    expect(plannedSetsText([normal({ reps: 10 }), normal()], 'weight_reps')).toBe('10 reps · —')
  })

  it('is empty without sets', () => {
    expect(plannedSetsText([], 'weight_reps')).toBe('')
  })
})

describe('doneSetsText', () => {
  it('lists the working sets done, leaving warm-ups and skipped sets out', () => {
    const exercise: SessionExercise = {
      key: 'e',
      exerciseId: 'supino',
      restSec: 90,
      sets: [
        { key: '1', kind: 'warmup', weightKg: 20, reps: 10, done: true },
        { key: '2', kind: 'normal', weightKg: 40, reps: 12, done: true },
        { key: '3', kind: 'normal', weightKg: 40, reps: 10, done: true, rir: 1 },
        { key: '4', kind: 'normal', weightKg: 40, done: false },
      ],
    }
    expect(doneSetsText(exercise, 'weight_reps')).toBe('40×12 · 40×10')
    expect(doneSetsText({ ...exercise, sets: exercise.sets.slice(0, 1) }, 'weight_reps')).toBe('')
  })
})

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const

describe('templateTotals', () => {
  it('counts exercises, working sets and the muscles in order', () => {
    const exercises = new Map<string, Exercise>([
      ['remada', { id: 'remada', name: 'Remada', muscle: 'back', equipment: 'cable', type: 'weight_reps', ...meta }],
      ['rosca', { id: 'rosca', name: 'Rosca', muscle: 'biceps', equipment: 'dumbbell', type: 'weight_reps', ...meta }],
      ['puxada', { id: 'puxada', name: 'Puxada', muscle: 'back', equipment: 'cable', type: 'weight_reps', ...meta }],
    ])
    const exercise = (exerciseId: string, sets: PlannedSet[]) => ({ key: exerciseId, exerciseId, restSec: 90, sets })
    const totals = templateTotals(
      {
        exercises: [
          exercise('remada', [warmup(), normal(), normal(), normal()]),
          exercise('rosca', [normal(), normal()]),
          exercise('puxada', [normal(), normal(), normal()]),
          exercise('apagado', [normal()]),
        ],
      },
      exercises,
    )
    expect(totals).toEqual({ exercises: 4, sets: 9, muscles: ['back', 'biceps'] })
  })
})

describe('lastTemplateSession', () => {
  const session = (id: string, startedAt: number, changes: Partial<WorkoutSession> = {}): WorkoutSession => ({
    id,
    name: 'PULL DAY',
    templateId: 'pull',
    date: '2026-11-01',
    startedAt,
    endedAt: startedAt + 3_600_000,
    exercises: [],
    ...meta,
    ...changes,
  })

  it('finds the latest finished workout of the ficha', () => {
    const sessions = [
      session('old', 1_000),
      session('latest', 5_000),
      session('running', 9_000, { endedAt: undefined }),
      session('deleted', 8_000, { deleted: 1 }),
      session('other', 7_000, { templateId: 'push' }),
    ]
    expect(lastTemplateSession(sessions, 'pull')?.id).toBe('latest')
    expect(lastTemplateSession(sessions, 'legs')).toBeUndefined()
  })
})
