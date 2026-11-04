import { describe, expect, it } from 'vitest'
import type { Activity, WorkoutSession } from '../../db/types'
import { dayTime } from '../../lib/dates'
import {
  bestEffort,
  consistency,
  formatPace,
  heatmap,
  personalRecords,
  pooledPace,
  trainingDays,
  weeklyVolume,
  weekPace,
} from './running'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const TODAY = '2026-11-04' // a Wednesday; its week starts on Sunday 2026-11-01

const run = (id: string, date: string, km: number, minutes: number, subSport?: string): Activity => ({
  id,
  date,
  sport: 'running',
  subSport,
  startTime: dayTime(date, '07:00'),
  elapsedSec: minutes * 60,
  timerSec: minutes * 60,
  distanceM: km * 1000,
  laps: [],
  hasTrack: true,
  ...meta,
})

const gym = (id: string, date: string): WorkoutSession => ({
  id,
  date,
  name: 'A',
  startedAt: dayTime(date, '18:00'),
  endedAt: dayTime(date, '19:00'),
  exercises: [],
  ...meta,
})

describe('weeklyVolume', () => {
  it('adds up the runs of each Sunday-to-Saturday week, oldest first', () => {
    const weeks = weeklyVolume(
      [run('a', '2026-10-25', 5, 30), run('b', '2026-10-31', 10.04, 55), run('c', '2026-11-03', 6, 38), run('old', '2026-10-01', 9, 50)],
      TODAY,
      2,
    )
    expect(weeks).toEqual([
      { week: '2026-10-25', km: 15, runs: 2, seconds: 85 * 60 },
      { week: '2026-11-01', km: 6, runs: 1, seconds: 38 * 60 },
    ])
    expect(weekPace(weeks[0])).toBe(340)
    expect(weekPace({ ...weeks[1], km: 2 })).toBeUndefined()
    expect(pooledPace(weeks)).toBeCloseTo((123 * 60) / 21)
    expect(formatPace(332.4)).toBe('5:32')
  })
})

describe('consistency and heatmap', () => {
  it('counts the weeks in a row, the longest streak of days and the days trained', () => {
    const days = trainingDays(
      [run('a', '2026-10-13', 5, 30), run('b', '2026-10-20', 5, 30), run('c', '2026-10-21', 5, 30), run('d', '2026-10-29', 5, 30)],
      [gym('g', '2026-10-22'), { ...gym('open', '2026-11-04'), endedAt: undefined }],
    )
    // The current week has no workout yet: the count starts from last week (25/10, 18/10, 11/10).
    expect(consistency(days, TODAY, 4)).toEqual({ weeksInRow: 3, bestDayStreak: 3, daysTrained: 5 })
    const map = heatmap([run('c', '2026-11-03', 6, 38)], new Set(['2026-11-03', '2026-11-02']), TODAY, 2)
    expect(map).toHaveLength(2)
    expect(map[1][2]).toEqual({ date: '2026-11-03', km: 6, trained: true, future: false })
    expect(map[1][1]).toMatchObject({ km: 0, trained: true })
    expect(map[1][4].future).toBe(true)
  })
})

describe('bestEffort and personalRecords', () => {
  // 4 m/s for 300 s, then 5 m/s for 300 s, a sample every 2 s.
  const distance = Array.from({ length: 301 }, (_, i) => (i <= 150 ? i * 8 : 1200 + (i - 150) * 10))
  const stream = { step: 2, distance }

  it('finds the fastest stretch of a distance, interpolating its start', () => {
    expect(bestEffort(stream, 1000)).toBeCloseTo(200)
    // 1500 m in the fast part (300 s) and the other 500 m at 4 m/s (125 s).
    expect(bestEffort(stream, 2000)).toBeCloseTo(425)
    expect(bestEffort(stream, 3000)).toBeUndefined()
    expect(bestEffort({ step: 1, distance: [0, null, 5, 10] }, 10)).toBeCloseTo(3)
  })

  it('keeps the best of each distance over the outdoor runs, and the longest run', () => {
    const records = personalRecords(
      [run('long', '2026-10-01', 12, 70), { ...run('fast', '2026-10-10', 2.7, 10), id: 'fast' }, run('treadmill', '2026-10-12', 5, 20, 'treadmill')],
      new Map([
        ['long', { step: 10, distance: Array.from({ length: 421 }, (_, i) => (i * 12000) / 420) }],
        ['fast', stream],
        ['treadmill', { step: 1, distance: Array.from({ length: 1201 }, (_, i) => i * 5) }],
      ]),
    )
    expect(records.efforts.map(({ short, activityId }) => [short, activityId])).toEqual([
      ['1 km', 'fast'],
      ['5 km', 'long'],
      ['10 km', 'long'],
    ])
    expect(records.efforts[0].seconds).toBeCloseTo(200)
    expect(records.longest).toEqual({ km: 12, date: '2026-10-01', activityId: 'long' })
  })
})
