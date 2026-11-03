import { describe, expect, it } from 'vitest'
import { dayKey } from '../../lib/dates'
import { sleepNights, stageTotals, weighIns } from './mapping'
import type { BodySample, SleepSessionSample } from './plugin'

const ZEPP = 'com.xiaomi.hm.health'
const GARMIN = 'com.garmin.android.apps.connectmobile'
const T = Date.UTC(2026, 10, 3, 10, 15)
const MIN = 60_000

const sample = (type: BodySample['type'], value: number, time = T, origin = ZEPP): BodySample => ({
  type,
  id: `${type}-${time}`,
  time,
  value,
  origin,
})

describe('weighIns', () => {
  it('joins one weigh-in from its separate records', () => {
    const samples = [
      sample('weight', 80.04),
      sample('bodyFat', 18.43),
      sample('leanMass', 65.3),
      sample('boneMass', 3.1),
      sample('bodyWater', 44),
      sample('bmr', 1745.6),
    ]
    expect(weighIns(samples)).toEqual([
      {
        id: `hc-weight-${T}`,
        date: dayKey(T),
        time: T,
        weightKg: 80.04,
        bodyFatPct: 18.4,
        leanMassKg: 65.3,
        boneMassKg: 3.1,
        bodyWaterPct: 55,
        bmrKcal: 1746,
        source: 'health-connect',
      },
    ])
  })

  it('skips Garmin copies and groups without a weight, and orders by time', () => {
    const later = T + 24 * 60 * MIN
    const entries = weighIns([
      sample('weight', 79.5, later),
      sample('weight', 80, T, GARMIN),
      sample('bodyFat', 18, T + 90 * MIN),
      sample('weight', 80.2),
    ])
    expect(entries.map((entry) => entry.weightKg)).toEqual([80.2, 79.5])
  })
})

describe('sleepNights', () => {
  const night: SleepSessionSample = {
    id: 'n1',
    start: T - 8 * 60 * MIN,
    end: T,
    origin: GARMIN,
    stages: [
      { start: T - 8 * 60 * MIN, end: T - 7 * 60 * MIN, stage: 4 },
      { start: T - 7 * 60 * MIN, end: T - 6 * 60 * MIN, stage: 4 },
      { start: T - 6 * 60 * MIN, end: T - 5 * 60 * MIN, stage: 5 },
      { start: T - 5 * 60 * MIN, end: T - 4 * 60 * MIN, stage: 0 },
      { start: T - 4 * 60 * MIN, end: T - 3 * 60 * MIN, stage: 6 },
      { start: T - 3 * 60 * MIN, end: T - 2.5 * 60 * MIN, stage: 1 },
    ],
  }
  const nap: SleepSessionSample = {
    id: 'nap',
    start: T + 4 * 60 * MIN,
    end: T + 4.5 * 60 * MIN,
    origin: GARMIN,
    stages: [{ start: T + 4 * 60 * MIN, end: T + 4.5 * 60 * MIN, stage: 4 }],
  }

  it('keeps the longest session of the day, with its stages merged and unknown ones left out', () => {
    const [result] = sleepNights([night, nap])
    expect(result.id).toBe(dayKey(T))
    expect(result.sleepStages).toEqual([
      { start: T - 8 * 60 * MIN, end: T - 6 * 60 * MIN, stage: 'light' },
      { start: T - 6 * 60 * MIN, end: T - 5 * 60 * MIN, stage: 'deep' },
      { start: T - 4 * 60 * MIN, end: T - 3 * 60 * MIN, stage: 'rem' },
      { start: T - 3 * 60 * MIN, end: T - 2.5 * 60 * MIN, stage: 'awake' },
    ])
  })

  it('totals the night without the awake time', () => {
    const [result] = sleepNights([night])
    expect(stageTotals(result.sleepStages)).toEqual({
      totalSec: 4 * 3600,
      start: T - 8 * 60 * MIN,
      end: T - 2.5 * 60 * MIN,
      deepSec: 3600,
      lightSec: 2 * 3600,
      remSec: 3600,
      awakeSec: 1800,
    })
  })
})
