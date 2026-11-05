import { describe, expect, it } from 'vitest'
import type { Habit } from '../../db/types'
import { dayRange, shiftDay } from '../../lib/dates'
import type { HabitDays } from './habits'
import { habitStrength, STRENGTH_DAYS, strengthPercent } from './strength'

// A Wednesday; its week started on Sunday 11-01.
const TODAY = '2026-11-04'
const habit = (changes: Partial<Habit> = {}): Habit => ({
  id: 'h',
  name: 'Hábito',
  kind: 'check',
  polarity: 'good',
  startDate: '2025-01-01',
  archived: 0,
  order: 0,
  updatedAt: 0,
  deleted: 0,
  dirty: 0,
  ...changes,
})
const days = (values: Record<string, number>, skipped: string[] = []): HabitDays => ({
  values: new Map(Object.entries(values)),
  skipped: new Set(skipped),
})
const every = (from: string, to: string, value = 1) => Object.fromEntries(dayRange(from, to).map((day) => [day, value]))
const yearAgo = shiftDay(TODAY, -STRENGTH_DAYS)

describe('habitStrength of a daily habit', () => {
  it('builds up: two perfect weeks make half', () => {
    const fresh = habit({ startDate: shiftDay(TODAY, -13) })
    expect(habitStrength(fresh, days(every(fresh.startDate, TODAY)), TODAY)).toBeCloseTo(0.5, 3)
    expect(habitStrength(fresh, days({}), TODAY)).toBe(0)
  })

  it('loses some points to a few misses after a long run, and none to skipped days', () => {
    const run = every(yearAgo, shiftDay(TODAY, -4))
    // 3 days missed: 2^(-3/14), 86%.
    expect(habitStrength(habit(), days(run), TODAY)).toBeCloseTo(2 ** (-3 / 14), 3)
    // 1 missed: 95%.
    expect(habitStrength(habit(), days(every(yearAgo, shiftDay(TODAY, -2))), TODAY)).toBeCloseTo(2 ** (-1 / 14), 3)
    const rain = [1, 2, 3].map((n) => shiftDay(TODAY, -n))
    expect(habitStrength(habit(), days(run, rain), TODAY)).toBeGreaterThan(0.999)
  })

  it('waits for today, which only counts once done', () => {
    const young = habit({ startDate: shiftDay(TODAY, -6) })
    const sixDays = every(young.startDate, shiftDay(TODAY, -1))
    expect(habitStrength(young, days(sixDays), TODAY)).toBeCloseTo(1 - 2 ** (-6 / 14), 6)
    expect(habitStrength(young, days({ ...sixDays, [TODAY]: 1 }), TODAY)).toBeCloseTo(1 - 2 ** (-7 / 14), 6)
  })

  it('keeps a day to avoid while within the limit, and gives a count its share of the goal', () => {
    const avoid = habit({ polarity: 'bad', startDate: shiftDay(TODAY, -13) })
    expect(habitStrength(avoid, days({}), TODAY)).toBeCloseTo(0.5, 3)
    expect(habitStrength(avoid, days({ [shiftDay(TODAY, -1)]: 1 }), TODAY)).toBeLessThan(0.48)
    const water = habit({ kind: 'count', target: 8 })
    expect(habitStrength(water, days(every(yearAgo, TODAY, 4)), TODAY)).toBeCloseTo(0.5, 3)
  })
})

describe('habitStrength of a weekly habit', () => {
  const thrice = (changes: Partial<Habit> = {}) => habit({ frequency: { times: 3, per: 'week' }, ...changes })
  /** Monday to Wednesday (or fewer days) of every week from `from`, a Sunday, to `to`. */
  const weeksDone = (from: string, to: string, perWeek = 3) =>
    Object.fromEntries(
      dayRange(from, to)
        .filter((_, i) => i % 7 >= 1 && i % 7 <= perWeek)
        .map((day) => [day, 1]),
    )
  // Every week met from a year ago to the week of 10-18.
  const longRun = weeksDone('2025-11-02', '2026-10-24')

  it('builds up by weeks: four met make half, the current one waiting until met', () => {
    const fresh = thrice({ startDate: '2026-10-04' })
    const fourWeeks = weeksDone('2026-10-04', '2026-10-31')
    expect(habitStrength(fresh, days(fourWeeks), TODAY)).toBeCloseTo(0.5, 3)
    expect(habitStrength(fresh, days({ ...fourWeeks, '2026-11-02': 1 }), TODAY)).toBeCloseTo(0.5, 3)
    expect(habitStrength(fresh, days({ ...fourWeeks, ...weeksDone('2026-11-01', '2026-11-04') }), TODAY)).toBeCloseTo(1 - 2 ** (-5 / 4), 3)
  })

  it('takes a missed week as a few points, and a week short of a day as fewer', () => {
    // A week missed: 2^(-1/4), 84%.
    expect(habitStrength(thrice(), days(longRun), TODAY)).toBeCloseTo(2 ** (-1 / 4), 3)
    const twoOfThree = { ...longRun, ...weeksDone('2026-10-25', '2026-10-31', 2) }
    expect(habitStrength(thrice(), days(twoOfThree), TODAY)).toBeCloseTo(1 - (1 - 2 ** (-1 / 4)) / 3, 3)
    expect(strengthPercent(habitStrength(thrice(), days(twoOfThree), TODAY))).toBe('95%')
  })

  it('leaves a week with every day skipped out', () => {
    const away = dayRange('2026-10-25', '2026-10-31')
    expect(habitStrength(thrice(), days(longRun, away), TODAY)).toBeGreaterThan(0.999)
  })

  it('counts a week to avoid as kept within the limit, the current one too', () => {
    const atMostTwice = habit({ polarity: 'bad', frequency: { times: 2, per: 'week' } })
    expect(habitStrength(atMostTwice, days({}), TODAY)).toBeGreaterThan(0.999)
    // Over the limit in the week of 10-25 (3 days), back within it this week.
    const over = days({ '2026-10-26': 1, '2026-10-28': 1, '2026-10-30': 1 })
    expect(habitStrength(atMostTwice, over, TODAY)).toBeCloseTo(1 - (1 - 2 ** (-1 / 4)) * 2 ** (-1 / 4), 3)
  })
})
