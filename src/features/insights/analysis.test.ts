import { describe as group, expect, it } from 'vitest'
import type { Activity, DailyHealth, Habit, HabitLog, WeightEntry } from '../../db/types'
import { dayRange, shiftDay } from '../../lib/dates'
import { analyze, describe, highlights, lagFor, pairPoints, roundSplit, strongestFirst, type Finding } from './analysis'
import { buildDailyData, formatMetric, type Metric, type Sources } from './metrics'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const FROM = '2026-09-01'
const TO = '2026-10-30'
const days = dayRange(FROM, TO)

const empty: Sources = { health: [], weights: [], foodLogs: [], waterLogs: [], habits: [], habitLogs: [], activities: [], sessions: [] }

/** Every third day has the habit, and the night after it HRV runs 10 ms lower. */
function habitWorld(): Sources {
  const habit: Habit = {
    id: 'alcool',
    name: 'Álcool',
    kind: 'check',
    polarity: 'bad',
    startDate: FROM,
    archived: 0,
    order: 0,
    ...meta,
  }
  const habitLogs: HabitLog[] = days
    .filter((_, i) => i % 3 === 0)
    .map((date) => ({ id: `alcool:${date}`, habitId: 'alcool', date, value: 1, ...meta }))
  const drank = new Set(habitLogs.map((log) => log.date))
  const health: DailyHealth[] = days.map((date, i) => ({
    id: date,
    hrv: { lastNight: (drank.has(shiftDay(date, -1)) ? 50 : 60) + (i % 4) },
    sleep: { totalSec: 7 * 3600 + (i % 5) * 600 },
    ...meta,
  }))
  return { ...empty, habits: [habit], habitLogs, health }
}

const metric = (data: ReturnType<typeof buildDailyData>, key: string): Metric =>
  data.metrics.find((m) => m.key === key)!

group('daily data', () => {
  it('counts a habit as 0 on days without a log, and dates nights by their morning', () => {
    const data = buildDailyData(habitWorld(), FROM, TO)
    expect(data.rows.get(FROM)?.['habit:alcool']).toBe(1)
    expect(data.rows.get(shiftDay(FROM, 1))?.['habit:alcool']).toBe(0)
    const x = metric(data, 'habit:alcool')
    const y = metric(data, 'hrv')
    expect(lagFor(x, y)).toBe(1)
    // The habit on the 1st meets the HRV of the night that ends on the 2nd.
    expect(pairPoints(data, x, y)[0]).toEqual({ day: FROM, x: 1, y: 51 })
  })

  it('fills training with zeros only after the first known activity', () => {
    const run: Activity = {
      id: 'r',
      sport: 'running',
      date: '2026-10-10',
      startTime: 0,
      elapsedSec: 1800,
      timerSec: 1800,
      distanceM: 5000,
      laps: [],
      hasTrack: false,
      ...meta,
    }
    const data = buildDailyData({ ...empty, activities: [run] }, FROM, TO)
    expect(data.rows.get('2026-10-09')?.runKm).toBeUndefined()
    expect(data.rows.get('2026-10-10')?.runKm).toBe(5)
    expect(data.rows.get('2026-10-11')?.runKm).toBe(0)
  })

  it('records the first weigh-in of each day and the change since the day before', () => {
    const weights: WeightEntry[] = [
      { id: 'a', date: '2026-10-01', time: 1, weightKg: 80, source: 'manual', ...meta },
      { id: 'b', date: '2026-10-02', time: 3, weightKg: 79.6, source: 'manual', ...meta },
      { id: 'c', date: '2026-10-02', time: 2, weightKg: 79.8, source: 'manual', ...meta },
    ]
    const row = buildDailyData({ ...empty, weights }, FROM, TO).rows.get('2026-10-02')
    expect(row?.weight).toBe(79.8)
    expect(row?.weightChange).toBeCloseTo(-0.2, 6)
  })
})

group('findings', () => {
  it('finds the habit lowering the next night HRV and words it with both averages', () => {
    const data = buildDailyData(habitWorld(), FROM, TO)
    const found = highlights(data)
    expect(found[0]).toMatchObject({ kind: 'groups', lag: 1 })
    expect(found[0].x.key).toBe('habit:alcool')
    expect(found[0].y.key).toBe('hrv')
    expect(describe(found[0])).toMatch(/^Depois de dias com «Álcool»: HRV da noite de 5\d ms, contra 6\d ms nos outros dias\.$/)
  })

  it('stays quiet without enough days on both sides', () => {
    const world = habitWorld()
    const data = buildDailyData({ ...world, habitLogs: world.habitLogs.slice(0, 3) }, FROM, TO)
    expect(analyze(data, metric(data, 'habit:alcool'), metric(data, 'hrv'))).toBeUndefined()
    expect(highlights(data)).toEqual([])
  })

  it('shows two findings per cause before a third one of the same cause', () => {
    // Habit A moves three night measures a lot, habit B moves deep sleep a little.
    const habit = (id: string): Habit => ({ id, name: id, kind: 'check', polarity: 'bad', startDate: FROM, archived: 0, order: 0, ...meta })
    const a = days.filter((_, i) => i % 3 === 0)
    const b = days.filter((_, i) => i % 2 === 1)
    const log = (habitId: string) => (date: string): HabitLog => ({ id: `${habitId}:${date}`, habitId, date, value: 1, ...meta })
    const afterA = new Set(a.map((date) => shiftDay(date, 1)))
    const afterB = new Set(b.map((date) => shiftDay(date, 1)))
    const health: DailyHealth[] = days.map((date, i) => ({
      id: date,
      hrv: { lastNight: (afterA.has(date) ? 50 : 60) + (i % 5) },
      restingHr: (afterA.has(date) ? 54 : 50) + (i % 5),
      sleep: {
        totalSec: 7 * 3600,
        score: (afterA.has(date) ? 70 : 80) + (i % 7),
        deepSec: ((afterB.has(date) ? 1.2 : 1.27) + (i % 5) * 0.05) * 3600,
      },
      ...meta,
    }))
    const sources = { ...empty, habits: [habit('a'), habit('b')], habitLogs: [...a.map(log('a')), ...b.map(log('b'))], health }
    const pairs = highlights(buildDailyData(sources, FROM, TO), 4).map((finding) => `${finding.x.key} > ${finding.y.key}`)
    expect(pairs).toEqual(['habit:a > hrv', 'habit:a > sleepScore', 'habit:b > deepHours', 'habit:a > restingHr'])
  })

  it('ranks a strong trend above a moderate difference between groups', () => {
    const moderate = { kind: 'groups', strength: 0.7 } as Finding
    const strong = { kind: 'trend', strength: 0.6 } as Finding
    const weak = { kind: 'trend', strength: 0.25 } as Finding
    expect([weak, moderate, strong].sort(strongestFirst)).toEqual([strong, moderate, weak])
  })

  it('splits a trend at a round number while each side keeps a quarter of the days', () => {
    const split = (steps: (i: number) => number) => {
      const health: DailyHealth[] = days.map((date, i) => ({
        id: date,
        steps: steps(i),
        sleep: { totalSec: 7 * 3600, score: 70 + (i % 7) },
        ...meta,
      }))
      const data = buildDailyData({ ...empty, health }, FROM, TO)
      const finding = analyze(data, metric(data, 'steps'), metric(data, 'sleepScore'))
      return finding?.kind === 'trend' ? finding.split : undefined
    }
    expect(split((i) => 5123 + (i % 10) * 1000)).toBe(9100)
    // 8.000 would leave 6 days on one side: the exact median instead.
    expect(split((i) => 8000 + (i % 10) * 10)).toBe(8040)
  })
})

group('roundSplit', () => {
  const data = buildDailyData(empty, FROM, TO)
  it('rounds to quarter hours, 5 minutes or two significant digits', () => {
    expect(roundSplit(metric(data, 'bedtime'), 23.517)).toBe(23.5)
    expect(roundSplit(metric(data, 'sleepHours'), 7.1)).toBe(7)
    expect(roundSplit(metric(data, 'activityMinutes'), 37)).toBe(35)
    expect(roundSplit(metric(data, 'steps'), 8423)).toBe(8400)
    expect(roundSplit(metric(data, 'water'), 2.37)).toBeCloseTo(2.4, 9)
    expect(roundSplit(metric(data, 'runKm'), 0)).toBe(0)
  })
})

group('formatMetric', () => {
  const data = buildDailyData(empty, FROM, TO)
  it('reads durations, clock times and units', () => {
    expect(formatMetric(metric(data, 'sleepHours'), 7.25)).toBe('7h15')
    expect(formatMetric(metric(data, 'bedtime'), 23.5)).toBe('23:30')
    expect(formatMetric(metric(data, 'bedtime'), 24.75)).toBe('00:45')
    expect(formatMetric(metric(data, 'hrv'), 52.4)).toBe('52 ms')
    expect(formatMetric(metric(data, 'steps'), 9800)).toBe('9.800')
  })

  it('signs a change and never shows "-0"', () => {
    const change = metric(data, 'weightChange')
    expect(formatMetric(change, 0.109)).toBe('+0,11 kg')
    expect(formatMetric(change, -0.146)).toBe('-0,15 kg')
    expect(formatMetric(change, -0.001)).toBe('0 kg')
  })
})
