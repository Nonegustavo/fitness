import { describe, expect, it } from 'vitest'
import type { Exercise, PerformedSet, WorkoutSession } from '../../db/types'
import { gymText } from './contextParts'
import { setsWithRir } from './gymSets'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const set = (weightKg: number, reps: number, rir?: number): PerformedSet => ({
  key: `${weightKg}x${reps}x${rir}`,
  kind: 'normal',
  weightKg,
  reps,
  done: true,
  rir,
})

describe('setsWithRir', () => {
  it('lists the sets with the reps in reserve told', () => {
    expect(setsWithRir([set(80, 8, 2), set(80, 8, 1), set(80, 7)], 'weight_reps')).toBe('80×8 RIR 2, 80×8 RIR 1, 80×7')
    expect(setsWithRir([{ ...set(0, 12, 4), weightKg: undefined }], 'reps')).toBe('PC×12 RIR 4+')
  })

  it('says nothing when no set has it', () => {
    expect(setsWithRir([set(80, 8), set(80, 8)], 'weight_reps')).toBeUndefined()
    expect(setsWithRir([], 'weight_reps')).toBeUndefined()
  })
})

describe('gymText with RIR', () => {
  it('adds the sets and their RIR after the best set', () => {
    const bench: Exercise = { id: 'bench', name: 'Supino reto', muscle: 'chest', equipment: 'barbell', type: 'weight_reps', ...meta }
    const session: WorkoutSession = {
      id: 's',
      name: 'PUSH DAY',
      date: '2026-11-05',
      startedAt: 0,
      endedAt: 3_600_000,
      exercises: [{ key: 'a', exerciseId: 'bench', restSec: 90, sets: [set(80, 8, 2), set(80, 7, 0)] }],
      ...meta,
    }
    expect(gymText(session, new Map([['bench', bench]]))).toContain(
      'Supino reto 2 séries (melhor 80 kg × 8): 80×8 RIR 2, 80×7 RIR 0 — ',
    )
  })
})
