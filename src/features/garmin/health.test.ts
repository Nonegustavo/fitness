import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../../db/schema'
import { dayChunks, mergeHealth, saveHealth, type GarminDailySummary, type GarminHrv, type GarminSleep } from './health'

const sleeps: GarminSleep[] = [
  {
    calendarDate: '2026-11-03',
    sleepTimeSeconds: 25920,
    napTimeSeconds: 0,
    deepSleepSeconds: 4800,
    lightSleepSeconds: 14400,
    remSleepSeconds: 5400,
    awakeSleepSeconds: 1320,
    sleepStartTimestampGMT: 1793682000000,
    // Garmin writes some UTC times without the "Z".
    sleepEndTimestampGMT: '2026-11-03 09:58:00',
    avgHeartRate: 51.4,
    averageRespirationValue: 14.2,
    sleepScores: { overall: { value: 82 }, remPercentage: { value: 21 } },
  },
  { calendarDate: '2026-11-02', sleepTimeSeconds: -1 },
]

const hrvs: GarminHrv[] = [
  { calendarDate: '2026-11-03', lastNightAvg: 54, weeklyAvg: 52, status: 'BALANCED', baseline: { balancedLow: 45, balancedUpper: 60 } },
  { calendarDate: '2026-11-02', status: 'NONE' },
]

const summaries: GarminDailySummary[] = [
  {
    calendarDate: '2026-11-03',
    heartRate: { restingValue: 52 },
    // -1 is Garmin's "no reading".
    stress: { avgLevel: -1, maxLevel: 70 },
    bodyBattery: { minValue: 15, maxValue: 88, chargedValue: 62, drainedValue: 40 },
    movement: { steps: { value: 8432 } },
    calories: { burnedTotal: 2650, burnedActive: 610 },
  },
]

describe('mergeHealth', () => {
  it('joins sleep, HRV and the daily summary into one row per day', () => {
    expect(mergeHealth(sleeps, hrvs, summaries)).toEqual([
      {
        id: '2026-11-03',
        sleep: {
          totalSec: 25920,
          score: 82,
          start: 1793682000000,
          end: Date.UTC(2026, 10, 3, 9, 58),
          deepSec: 4800,
          lightSec: 14400,
          remSec: 5400,
          awakeSec: 1320,
          avgHr: 51,
          avgRespiration: 14,
        },
        hrv: { lastNight: 54, weeklyAvg: 52, status: 'BALANCED', balancedLow: 45, balancedHigh: 60 },
        restingHr: 52,
        stress: { max: 70 },
        bodyBattery: { low: 15, high: 88, charged: 62, drained: 40 },
        steps: 8432,
        calories: { total: 2650, active: 610 },
      },
    ])
  })
})

describe('saveHealth', () => {
  it('writes only what changed and keeps fields from other sources', async () => {
    const [day] = mergeHealth(sleeps, hrvs, summaries)
    expect(await saveHealth([day])).toBe(1)
    expect(await saveHealth([day])).toBe(0)

    await db.dailyHealth.update(day.id, { steps: 9000 })
    const { steps: _steps, ...withoutSteps } = day
    expect(await saveHealth([{ ...withoutSteps, restingHr: 50 }])).toBe(1)
    expect(await db.dailyHealth.get(day.id)).toMatchObject({ restingHr: 50, steps: 9000, dirty: 1 })
  })
})

describe('dayChunks', () => {
  it('splits a range into consecutive pieces', () => {
    expect(dayChunks('2026-10-01', '2026-11-03', 28)).toEqual([
      ['2026-10-01', '2026-10-28'],
      ['2026-10-29', '2026-11-03'],
    ])
    expect(dayChunks('2026-11-03', '2026-11-03', 28)).toEqual([['2026-11-03', '2026-11-03']])
  })
})
