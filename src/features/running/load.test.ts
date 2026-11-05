import { describe, expect, it } from 'vitest'
import type { Activity } from '../../db/types'
import { dayTime, shiftDay } from '../../lib/dates'
import { defaultChoice, periodWindow } from '../../lib/periods'
import { acwr, acwrFlag, dailyLoads, edwardsTrimp, formZone, loadByPeriod, loadSeries, loadStatus, weekBlocks, zoneSeconds } from './load'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const LIMITS = [100, 120, 140, 160, 180, 200]

const activity = (id: string, date: string, changes: Partial<Activity> = {}): Activity => ({
  id,
  date,
  sport: 'running',
  startTime: dayTime(date, '07:00'),
  elapsedSec: 3600,
  timerSec: 3600,
  laps: [],
  hasTrack: false,
  ...meta,
  ...changes,
})

/** A load series of `loads`, one a day from 2026-01-01. */
const seriesOf = (loads: number[]) =>
  loadSeries(new Map(loads.map((load, i) => [shiftDay('2026-01-01', i), load])), shiftDay('2026-01-01', loads.length - 1))

describe('edwardsTrimp and zoneSeconds', () => {
  it('weighs the minutes in zones 1–5 by 1–5, leaving out the time below zone 1', () => {
    // 10 min below zone 1, then 10, 20, 15, 5 and 1 min in zones 1 to 5.
    expect(edwardsTrimp([600, 600, 1200, 900, 300, 60])).toBe(10 + 40 + 45 + 20 + 5)
    expect(edwardsTrimp([])).toBe(0)
  })

  it('puts each heart rate sample in its zone, above the last limit in zone 5', () => {
    const stream = { step: 2, hr: [90, 110, null, 130, 150, 170, 190, 210, 0] }
    expect(zoneSeconds(stream, LIMITS)).toEqual([2, 2, 2, 2, 2, 4])
  })
})

describe('dailyLoads', () => {
  it('adds up the day, and classifies the samples of an activity without zones by the nearest one with them', () => {
    const loads = dailyLoads(
      [
        activity('a', '2026-11-01', { hrZones: { seconds: [0, 600, 600, 0, 0, 0], limits: LIMITS } }),
        activity('gym', '2026-11-01', { sport: 'training', subSport: 'strengthTraining', hrZones: { seconds: [0, 0, 0, 600, 0, 0], limits: [] } }),
        // Two days from "near", a week from "a": 150 bpm is zone 5 by near's limits (zone 3 by a's).
        activity('samples', '2026-11-08', { sport: 'cycling', avgHr: 150 }),
        activity('near', '2026-11-10', { hrZones: { seconds: [0, 0, 0, 0, 0, 0], limits: [100, 110, 120, 130, 140, 150] } }),
        activity('no-hr', '2026-11-12'),
        activity('gone', '2026-11-13', { deleted: 1, hrZones: { seconds: [0, 600, 0, 0, 0, 0], limits: LIMITS } }),
      ],
      new Map([['samples', { step: 1, hr: Array.from({ length: 600 }, () => 150) }]]),
    )
    expect(Object.fromEntries(loads)).toEqual({ '2026-11-01': 30 + 30, '2026-11-08': 50, '2026-11-10': 0 })
  })

  it('leaves out samples with no zones anywhere to classify them by', () => {
    const loads = dailyLoads([activity('samples', '2026-11-08', { avgHr: 150 })], new Map([['samples', { step: 1, hr: [150, 150] }]]))
    expect(loads.size).toBe(0)
  })
})

describe('loadSeries', () => {
  it('runs both exponential averages from the first day with a load, form being their difference', () => {
    const series = loadSeries(new Map([['2026-01-01', 100], ['2026-01-03', 0]]), '2026-01-03')
    expect(series.map((day) => day.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03'])
    expect(series[0].atl).toBeCloseTo(100 * (1 - Math.exp(-1 / 7)))
    expect(series[0].ctl).toBeCloseTo(100 * (1 - Math.exp(-1 / 42)))
    expect(series[1].atl).toBeCloseTo(series[0].atl * Math.exp(-1 / 7))
    expect(series[2].tsb).toBeCloseTo(series[2].ctl - series[2].atl)
    expect(loadSeries(new Map(), '2026-01-03')).toEqual([])
  })

  it('settles on a steady load, with form near zero', () => {
    const last = seriesOf(Array.from({ length: 300 }, () => 50)).at(-1)!
    expect(last.atl).toBeCloseTo(50)
    expect(last.ctl).toBeCloseTo(50, 0)
    expect(Math.abs(last.tsb)).toBeLessThan(0.1)
  })
})

describe('acwr and loadStatus', () => {
  // Three weeks at 40 a day, then one at 80.
  const series = seriesOf([...Array.from({ length: 21 }, () => 40), ...Array.from({ length: 7 }, () => 80)])

  it('sets the last 7 days against the weekly average of the last 28', () => {
    // 560 against (840 + 560) / 4 = 350.
    expect(acwr(series)).toBeCloseTo(1.6)
    expect(acwr(series, 26)).toBeUndefined()
    expect(acwr(seriesOf(Array.from({ length: 28 }, () => 0)))).toBeUndefined()
    expect(loadStatus(series)).toMatchObject({ date: '2026-01-28', acute: 560, chronic: 350, flag: 'spike' })
    expect(loadStatus(series, '2026-01-10')).toMatchObject({ acute: 280, acwr: undefined, flag: undefined })
    expect(loadStatus(series, '2025-12-31')).toBeUndefined()
  })

  it('reads form as a share of fitness', () => {
    const status = loadStatus(series)!
    expect(status.formPct).toBeCloseTo((status.tsb / status.ctl) * 100)
    expect(status.zone).toBe(formZone(status.formPct!))
  })

  it('flags the ratio and the form like intervals.icu and the injury studies', () => {
    expect([1.51, 1.5, 1.3, 1.29, 0.8, 0.79].map(acwrFlag)).toEqual(['spike', 'caution', 'caution', 'balanced', 'balanced', 'low'])
    expect([25, 10, 0, -10, -20, -30, -31].map(formZone)).toEqual(['transition', 'fresh', 'neutral', 'neutral', 'optimal', 'optimal', 'risk'])
  })

  it('adds up blocks of 7 days back from the last day', () => {
    const blocks = seriesOf(Array.from({ length: 14 }, (_, i) => i + 1))
    expect(weekBlocks(blocks, 3)).toEqual([0, 28, 77])
  })
})

describe('loadByPeriod', () => {
  it('reads each period of a chart where it ends (today for the current one), with its load', () => {
    // 1/1/2026 to 14/1/2026 at 10 a day; 1/1 is a Thursday, in the week of Sunday 28/12.
    const series = seriesOf(Array.from({ length: 14 }, () => 10))
    const window = periodWindow({ ...defaultChoice('week'), lengths: { day: 30, week: 4, month: 12 } }, '2026-01-14')
    expect(loadByPeriod(window, series).map((period) => [period.start, period.day?.date, period.load])).toEqual([
      ['2025-12-21', undefined, 0],
      ['2025-12-28', '2026-01-03', 30],
      ['2026-01-04', '2026-01-10', 70],
      ['2026-01-11', '2026-01-14', 40],
    ])
  })
})
