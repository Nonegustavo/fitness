import { describe, expect, it } from 'vitest'
import type { Habit } from '../../db/types'
import { isSuccess, streak, successRate } from './habits'

const habit = (changes: Partial<Habit>): Habit => ({
  id: 'h',
  name: 'Hábito',
  kind: 'check',
  polarity: 'good',
  startDate: '2026-10-01',
  archived: 0,
  order: 0,
  updatedAt: 0,
  deleted: 0,
  dirty: 0,
  ...changes,
})

const days = (entries: Record<string, number>) => new Map(Object.entries(entries))

describe('isSuccess', () => {
  it('needs the goal for good habits and stays within the limit for bad ones', () => {
    expect(isSuccess(habit({}), 1)).toBe(true)
    expect(isSuccess(habit({}), 0)).toBe(false)
    expect(isSuccess(habit({ kind: 'count', target: 3 }), 2)).toBe(false)
    expect(isSuccess(habit({ polarity: 'bad' }), 0)).toBe(true)
    expect(isSuccess(habit({ polarity: 'bad', kind: 'count', target: 2 }), 2)).toBe(true)
    expect(isSuccess(habit({ polarity: 'bad', kind: 'count', target: 2 }), 3)).toBe(false)
  })
})

describe('streak', () => {
  const values = days({ '2026-11-01': 1, '2026-10-31': 1, '2026-10-29': 1 })

  it('counts consecutive days, without breaking on a today not done yet', () => {
    expect(streak(habit({}), values, '2026-11-02')).toBe(2)
  })

  it('includes today once it is done', () => {
    expect(streak(habit({}), days({ '2026-11-02': 1, '2026-11-01': 1 }), '2026-11-02')).toBe(2)
  })

  it('counts days without a bad habit back to the start date', () => {
    const bad = habit({ polarity: 'bad', startDate: '2026-10-28' })
    expect(streak(bad, days({ '2026-10-30': 1 }), '2026-11-02')).toBe(3)
    expect(streak(bad, days({}), '2026-11-02')).toBe(6)
  })
})

describe('successRate', () => {
  it('ignores the days before the habit started', () => {
    const recent = habit({ startDate: '2026-11-01' })
    expect(successRate(recent, days({ '2026-11-01': 1 }), '2026-10-01', '2026-11-02')).toBe(0.5)
  })
})
