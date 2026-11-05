import { describe, expect, it } from 'vitest'
import type { Habit } from '../../db/types'
import { daysByHabit, habitTime, isSuccess, skippedBetween, streak, successRate, type HabitDays } from './habits'

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

const days = (entries: Record<string, number>, skipped: string[] = []): HabitDays => ({
  values: new Map(Object.entries(entries)),
  skipped: new Set(skipped),
})

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

describe('habitTime', () => {
  it('takes the habit time, or the reminder time of habits from before it existed', () => {
    expect(habitTime(habit({ time: '07:30', reminder: { time: '20:00', days: [1] } }))).toBe('07:30')
    expect(habitTime(habit({ reminder: { time: '20:00', days: [1] } }))).toBe('20:00')
    expect(habitTime(habit({}))).toBeUndefined()
  })
})

describe('daysByHabit', () => {
  it('groups the values by habit and keeps the days skipped apart', () => {
    const byHabit = daysByHabit([
      { habitId: 'a', date: '2026-11-01', value: 1 },
      { habitId: 'a', date: '2026-11-02', value: 0, skipped: 1 },
      { habitId: 'b', date: '2026-11-01', value: 3 },
    ])
    expect(byHabit.get('a')).toEqual(days({ '2026-11-01': 1, '2026-11-02': 0 }, ['2026-11-02']))
    expect(byHabit.get('b')?.skipped.size).toBe(0)
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

  it('steps over skipped days: they neither break it nor add to it', () => {
    const rainy = days({ '2026-11-01': 1, '2026-10-31': 0, '2026-10-30': 1, '2026-10-29': 1 }, ['2026-10-31'])
    expect(streak(habit({}), rainy, '2026-11-02')).toBe(3)
    // A skipped today leaves the streak as it was yesterday.
    expect(streak(habit({}), days({ '2026-11-01': 1, '2026-11-02': 0 }, ['2026-11-02']), '2026-11-02')).toBe(1)
  })
})

describe('successRate', () => {
  it('ignores the days before the habit started', () => {
    const recent = habit({ startDate: '2026-11-01' })
    expect(successRate(recent, days({ '2026-11-01': 1 }), '2026-10-01', '2026-11-02')).toBe(0.5)
  })

  it('leaves the skipped days out, and has nothing to say when every day was skipped', () => {
    const week = days({ '2026-11-01': 1, '2026-11-03': 1 }, ['2026-11-02'])
    expect(successRate(habit({}), week, '2026-11-01', '2026-11-04')).toBeCloseTo(2 / 3)
    expect(successRate(habit({}), days({}, ['2026-11-01']), '2026-11-01', '2026-11-01')).toBeUndefined()
  })
})

describe('skippedBetween', () => {
  it('lists the skipped days of a period, in order', () => {
    expect(skippedBetween(days({}, ['2026-11-03', '2026-10-20', '2026-11-01']), '2026-11-01', '2026-11-04')).toEqual([
      '2026-11-01',
      '2026-11-03',
    ])
  })
})
