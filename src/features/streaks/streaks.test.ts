import { describe, expect, it } from 'vitest'
import type { Habit, MacroGoals } from '../../db/types'
import type { Records } from '../running/running'
import { dayStreak, milestoneMessage, recordNews, snapshotOf, streaks, type StreakSources } from './streaks'

const today = '2026-11-04'
const days = (...list: string[]) => new Set(list)

describe('dayStreak', () => {
  it('counts the days in a row up to today', () => {
    const met = days('2026-11-02', '2026-11-03', '2026-11-04', '2026-10-31')
    expect(dayStreak((date) => met.has(date), today)).toEqual({ count: 3, today: true })
  })

  it('keeps the streak up to yesterday alive while today is not met yet', () => {
    const met = days('2026-11-02', '2026-11-03')
    expect(dayStreak((date) => met.has(date), today)).toEqual({ count: 2, today: false })
    expect(dayStreak(() => false, today)).toEqual({ count: 0, today: false })
  })
})

const goals: MacroGoals = { kcal: 2400, protein: 150, carbs: 250, fat: 70 }
const habit = (changes: Partial<Habit>): Habit => ({
  id: 'h1',
  name: 'Creatina',
  kind: 'check',
  polarity: 'good',
  startDate: '2026-10-01',
  archived: 0,
  order: 0,
  updatedAt: 1,
  deleted: 0,
  dirty: 0,
  ...changes,
})
const base: StreakSources = {
  water: [],
  waterGoalMl: 3000,
  foodLogs: [],
  goalOn: () => goals,
  habits: [],
  habitLogs: [],
}

describe('streaks', () => {
  it('counts the water goal, adding up the glasses of each day', () => {
    const water = [
      { date: '2026-11-03', ml: 3000 },
      { date: '2026-11-04', ml: 2000 },
      { date: '2026-11-04', ml: 1000 },
      { date: '2026-11-02', ml: 2900 },
    ]
    expect(streaks({ ...base, water }, today).water).toEqual({ count: 2, today: true })
  })

  it('counts the protein goal of each day, and leaves it out without nutrition goals', () => {
    const food = (date: string, protein: number) => ({ date, nutrients: { kcal: 0, protein, carbs: 0, fat: 0 } })
    const foodLogs = [food('2026-11-02', 160), food('2026-11-03', 100), food('2026-11-03', 60), food('2026-11-04', 90)]
    expect(streaks({ ...base, foodLogs }, today).protein).toEqual({ count: 2, today: false })
    expect(streaks({ ...base, foodLogs, goalOn: () => undefined }, today).protein).toBeUndefined()
    expect(streaks({ ...base, waterGoalMl: 0 }, today).water).toBeUndefined()
  })

  it('counts days with every habit met, each habit from the day it started', () => {
    const habits = [habit({ id: 'a' }), habit({ id: 'b', startDate: '2026-11-03' }), habit({ id: 'c', polarity: 'bad' })]
    const habitLogs = [
      { id: 'a:2026-11-02', value: 1 },
      { id: 'a:2026-11-03', value: 1 },
      { id: 'b:2026-11-03', value: 1 },
      { id: 'a:2026-11-04', value: 1 },
      { id: 'b:2026-11-04', value: 1 },
      { id: 'c:2026-11-04', value: 0 },
      { id: 'a:2026-11-01', value: 1 },
      { id: 'c:2026-11-01', value: 1 },
    ]
    expect(streaks({ ...base, habits, habitLogs }, today).habits).toEqual({ count: 3, today: true })
    expect(streaks({ ...base, habits: [habit({ archived: 1 })] }, today).habits).toBeUndefined()
  })

  it('steps over days with every habit skipped, and asks a day only for the habits not skipped', () => {
    const habits = [habit({ id: 'a' }), habit({ id: 'b' })]
    const skip = { value: 0, skipped: 1 as const }
    const habitLogs = [
      { id: 'a:2026-10-31', value: 1 },
      { id: 'a:2026-11-01', value: 1 },
      { id: 'b:2026-11-01', value: 1 },
      { id: 'a:2026-11-02', ...skip },
      { id: 'b:2026-11-02', ...skip },
      { id: 'a:2026-11-03', value: 1 },
      { id: 'b:2026-11-03', ...skip },
      { id: 'a:2026-11-04', ...skip },
      { id: 'b:2026-11-04', ...skip },
    ]
    expect(streaks({ ...base, habits, habitLogs }, today).habits).toEqual({ count: 2, today: false, skippedToday: true })
  })

  it('asks the days only for the daily habits, and breaks the day a weekly limit is passed', () => {
    const habits = [
      habit({ id: 'a' }),
      habit({ id: 'run', frequency: { times: 3, per: 'week' } }),
      habit({ id: 'beer', polarity: 'bad', frequency: { times: 1, per: 'week' } }),
    ]
    // The week began on Sunday 11-01; one beer a week is fine, the second (11-03) is past the limit.
    const habitLogs = [
      { id: 'a:2026-11-01', value: 1 },
      { id: 'a:2026-11-02', value: 1 },
      { id: 'beer:2026-11-02', value: 1 },
      { id: 'a:2026-11-03', value: 1 },
      { id: 'beer:2026-11-03', value: 1 },
      { id: 'a:2026-11-04', value: 1 },
    ]
    expect(streaks({ ...base, habits, habitLogs }, today).habits).toEqual({ count: 1, today: true })
    const once = habitLogs.filter((log) => log.id !== 'beer:2026-11-03')
    expect(streaks({ ...base, habits, habitLogs: once }, today).habits).toEqual({ count: 4, today: true })
    // Only weekly habits: no day to keep.
    expect(streaks({ ...base, habits: habits.slice(1), habitLogs }, today).habits).toBeUndefined()
  })
})

describe('milestoneMessage', () => {
  it('celebrates a milestone reached today, only', () => {
    expect(milestoneMessage('water', { count: 7, today: true })).toBe('🔥 7 dias seguidos batendo a meta de água!')
    expect(milestoneMessage('water', { count: 7, today: false })).toBeUndefined()
    expect(milestoneMessage('habits', { count: 8, today: true })).toBeUndefined()
    expect(milestoneMessage('protein', undefined)).toBeUndefined()
  })
})

describe('recordNews', () => {
  const records = (fiveK: number, date: string, longest = 12): Records => ({
    efforts: [
      { meters: 1000, label: '1 km', short: '1 km', seconds: 270, date: '2026-09-01', activityId: 'old' },
      { meters: 5000, label: '5 km', short: '5 km', seconds: fiveK, date, activityId: 'run' },
    ],
    longest: { km: longest, seconds: 4000, date, activityId: 'run' },
  })

  it('announces a faster time from a recent run', () => {
    const previous = snapshotOf(records(1500, '2026-10-01'))
    expect(recordNews(previous, records(1471, '2026-11-03'), today)).toEqual(['🏆 Novo recorde nos 5 km: 24:31!'])
  })

  it('announces a first time over a distance and the longest run', () => {
    const previous = { best: { 1000: 270 }, longestKm: 10 }
    expect(recordNews(previous, records(1500, '2026-11-04', 12.4), today)).toEqual([
      '🏅 Primeira vez nos 5 km: 25:00!',
      '🏆 Sua corrida mais longa: 12,4 km!',
    ])
  })

  it('stays quiet about old runs and about what did not change', () => {
    const previous = snapshotOf(records(1500, '2026-10-01'))
    expect(recordNews(previous, records(1400, '2026-10-01'), today)).toEqual([])
    expect(recordNews(previous, records(1500, '2026-10-01'), today)).toEqual([])
  })
})
