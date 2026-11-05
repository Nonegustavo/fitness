import { describe, expect, it } from 'vitest'
import type { SessionExercise } from '../../db/types'
import { DEFAULT_WARMUP_REST_SEC, restOf, restSecAfter } from './training'

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
