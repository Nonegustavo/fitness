import { describe, expect, it } from 'vitest'
import type { Habit } from '../../db/types'
import { shiftDay } from '../../lib/dates'
import {
  daysByHabit,
  describeHabit,
  frequencyText,
  habitTime,
  isSuccess,
  skippedBetween,
  stepDay,
  streak,
  streakText,
  successRate,
  weeklyTimes,
  weekProgressText,
  weekResult,
  weekResults,
  type HabitDays,
} from './habits'

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

describe('stepDay', () => {
  it('lands where shiftDay does, across months, years, leap days and daylight saving', () => {
    const cases: [string, number][] = [
      ['2026-01-31', 1],
      ['2024-02-28', 1],
      ['2024-03-01', -1],
      ['2026-12-31', 1],
      ['2026-11-04', -364],
      ['2018-11-03', 1],
      ['2018-11-05', -1],
      ['2026-03-08', 7],
    ]
    for (const [key, days] of cases) expect(stepDay(key, days)).toBe(shiftDay(key, days))
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

// Weeks run Sunday to Saturday: 2026-10-25 to 10-31, 11-01 to 11-07 (11-04 is a Wednesday).
const TODAY = '2026-11-04'
const thrice = (changes: Partial<Habit> = {}) => habit({ frequency: { times: 3, per: 'week' }, ...changes })
const twiceAtMost = (changes: Partial<Habit> = {}) => habit({ polarity: 'bad', frequency: { times: 2, per: 'week' }, ...changes })
const done = (...list: string[]) => days(Object.fromEntries(list.map((day) => [day, 1])))

describe('weeklyTimes and frequencyText', () => {
  it('reads 1 to 6 days a week, anything else is daily', () => {
    expect(weeklyTimes(thrice())).toBe(3)
    expect(weeklyTimes(habit({}))).toBeUndefined()
    expect(weeklyTimes(habit({ frequency: { times: 7, per: 'week' } }))).toBeUndefined()
    expect(weeklyTimes(habit({ frequency: { times: 0, per: 'week' } }))).toBeUndefined()
  })

  it('says it as at least or at most', () => {
    expect(frequencyText(thrice())).toBe('3 vezes por semana')
    expect(frequencyText(habit({ frequency: { times: 1, per: 'week' } }))).toBe('1 vez por semana')
    expect(frequencyText(twiceAtMost())).toBe('até 2 dias por semana')
    expect(frequencyText(habit({}))).toBeUndefined()
    expect(describeHabit(twiceAtMost({ name: 'Álcool' }))).toBe('Evitar · até 2 dias por semana')
    expect(describeHabit(thrice({ kind: 'count', target: 8, unit: 'copos' }))).toBe('Meta: 8 copos · 3 vezes por semana')
    expect(describeHabit(thrice(), { frequency: false })).toBe('Fazer')
  })
})

describe('weekResult', () => {
  it('meets a habit to do with enough days done, at any time of the week', () => {
    expect(weekResult(thrice(), done('2026-10-26', '2026-10-28', '2026-10-30'), '2026-10-25', TODAY)).toEqual({
      week: '2026-10-25',
      count: 3,
      times: 3,
      met: true,
      outcome: 'met',
    })
    // The current week is met as soon as the third day is done.
    expect(weekResult(thrice(), done('2026-11-01', '2026-11-02', '2026-11-03'), '2026-11-01', TODAY).outcome).toBe('met')
  })

  it('misses a week over with too few days, and leaves the current one open', () => {
    expect(weekResult(thrice(), done('2026-10-26', '2026-10-28'), '2026-10-25', TODAY)).toMatchObject({ count: 2, outcome: 'missed' })
    expect(weekResult(thrice(), done('2026-11-02'), '2026-11-01', TODAY)).toMatchObject({ count: 1, met: false, outcome: 'open' })
    // Saturday is still part of the week.
    expect(weekResult(thrice(), done('2026-11-02'), '2026-11-01', '2026-11-07').outcome).toBe('open')
  })

  it('takes skipped days out without lowering the target, and sets aside a week all skipped', () => {
    const week = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']
    expect(weekResult(thrice(), days({}, week), '2026-10-25', TODAY).outcome).toBe('aside')
    const travel = days({ '2026-10-30': 1, '2026-10-31': 1 }, week.slice(0, 5))
    expect(weekResult(thrice(), travel, '2026-10-25', TODAY)).toMatchObject({ count: 2, outcome: 'missed' })
    // A skipped day doesn't count even with something logged.
    expect(weekResult(thrice(), days({ '2026-10-26': 1, '2026-10-27': 1, '2026-10-28': 1 }, ['2026-10-28']), '2026-10-25', TODAY).count).toBe(2)
  })

  it('sets aside a first week started too late to reach the target, but not one with time enough', () => {
    expect(weekResult(thrice({ startDate: '2026-10-30' }), done('2026-10-30'), '2026-10-25', TODAY).outcome).toBe('aside')
    expect(weekResult(thrice({ startDate: '2026-10-28' }), done('2026-10-30'), '2026-10-25', TODAY).outcome).toBe('missed')
    expect(weekResult(thrice({ startDate: '2026-10-29' }), done('2026-10-29', '2026-10-30', '2026-10-31'), '2026-10-25', TODAY).outcome).toBe('met')
  })

  it('counts the days a habit to avoid happened (past its daily limit) against its weekly limit', () => {
    expect(weekResult(twiceAtMost(), done('2026-10-26', '2026-10-29'), '2026-10-25', TODAY)).toMatchObject({ count: 2, met: true, outcome: 'met' })
    expect(weekResult(twiceAtMost(), done('2026-10-26', '2026-10-27', '2026-10-29'), '2026-10-25', TODAY)).toMatchObject({
      count: 3,
      met: false,
      outcome: 'missed',
    })
    // Within the limit so far, the current week counts; past it, it isn't over yet.
    expect(weekResult(twiceAtMost(), days({}), '2026-11-01', TODAY).outcome).toBe('met')
    expect(weekResult(twiceAtMost(), done('2026-11-01', '2026-11-02', '2026-11-03'), '2026-11-01', TODAY).outcome).toBe('open')
    // With a daily limit of 2 doses, only the days past it count.
    const doses = twiceAtMost({ kind: 'count', target: 2 })
    expect(weekResult(doses, days({ '2026-10-26': 1, '2026-10-27': 2, '2026-10-28': 4 }), '2026-10-25', TODAY).count).toBe(1)
  })

  it('maps every weekly habit to its week, and says the progress', () => {
    const run = thrice({ id: 'run' })
    const results = weekResults(
      [run, habit({ id: 'daily' })],
      [
        { habitId: 'run', date: '2026-11-02', value: 1 },
        { habitId: 'run', date: '2026-11-03', value: 1 },
      ],
      '2026-11-01',
      TODAY,
    )
    expect([...results.keys()]).toEqual(['run'])
    expect(weekProgressText(results.get('run')!)).toBe('2/3 na semana')
  })
})

describe('streak of a weekly habit', () => {
  const metWeeks = ['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-28', '2026-10-30']

  it('counts weeks met, the current one only once met', () => {
    expect(streak(thrice(), done(...metWeeks, '2026-11-02'), TODAY)).toBe(3)
    expect(streak(thrice(), done(...metWeeks, '2026-11-02', '2026-11-03', '2026-11-04'), TODAY)).toBe(4)
  })

  it('breaks on a missed week and steps over a week all skipped', () => {
    expect(streak(thrice(), done(...metWeeks.filter((day) => day !== '2026-10-21')), TODAY)).toBe(1)
    const vacation = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']
    const away = days(Object.fromEntries(metWeeks.filter((day) => !vacation.includes(day)).map((day) => [day, 1])), vacation)
    expect(streak(thrice(), away, TODAY)).toBe(2)
  })

  it('counts the weeks a habit to avoid stayed within its limit, back to its start', () => {
    // Started on Thursday 10-01: the weeks from 09-27 to the current one.
    expect(streak(twiceAtMost(), days({}), TODAY)).toBe(6)
    expect(streak(twiceAtMost(), done('2026-10-19', '2026-10-20', '2026-10-21'), TODAY)).toBe(2)
  })

  it('reads in weeks', () => {
    expect(streakText(thrice(), 3)).toBe('3 semanas seguidas')
    expect(streakText(thrice(), 1)).toBe('1 semana seguida')
    expect(streakText(twiceAtMost(), 2)).toBe('2 semanas dentro do limite')
    expect(streakText(habit({}), 5)).toBe('5 dias seguidos')
    expect(streakText(habit({ polarity: 'bad' }), 1)).toBe('1 dia sem')
    expect(streakText(thrice(), 0)).toBe('sem sequência')
  })
})

describe('successRate of a weekly habit', () => {
  // Met the weeks of 10-04 and 10-18, missed 10-11 and 10-25 (2 days).
  const weeks = done('2026-10-05', '2026-10-06', '2026-10-07', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-26', '2026-10-27')

  it('is the share of weeks met, the current week counting only once met', () => {
    expect(successRate(thrice(), weeks, '2026-10-06', TODAY, TODAY)).toBe(0.5)
    const thisWeek = done(...[...weeks.values.keys()], '2026-11-01', '2026-11-02', '2026-11-03')
    expect(successRate(thrice(), thisWeek, '2026-10-06', TODAY, TODAY)).toBe(0.6)
  })

  it('takes a week ending on `to` as over, by default', () => {
    expect(successRate(thrice(), weeks, '2026-10-25', '2026-10-31')).toBe(0)
    expect(successRate(thrice(), weeks, '2026-11-01', '2026-11-07')).toBe(0)
    expect(successRate(thrice(), weeks, '2026-11-01', '2026-11-07', TODAY)).toBeUndefined()
  })
})
