import { describe, expect, it } from 'vitest'
import type { Activity } from '../../db/types'
import { dayTime } from '../../lib/dates'
import { fitnessOf, monthlyVdot, predictRace, raceDistance, riegel, runEfforts, vdot } from './predict'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const TODAY = '2026-11-05'

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

/** An even pace: the distance so far every 10 seconds. */
const even = (km: number, minutes: number) => ({
  step: 10,
  distance: Array.from({ length: minutes * 6 + 1 }, (_, i) => (i * km * 1000) / (minutes * 6)),
})

describe('vdot and riegel', () => {
  it("matches Daniels' tables: 5 km in 19:57, 10 km in 41:21 and the marathon in 3:10:49 are all VDOT 50", () => {
    expect(vdot(5000, 19 * 60 + 57)).toBeCloseTo(50, 0)
    expect(vdot(10000, 41 * 60 + 21)).toBeCloseTo(50, 0)
    expect(vdot(42195, 3 * 3600 + 10 * 60 + 49)).toBeCloseTo(50, 0)
  })

  it('scales a time by the distance to the power 1.06', () => {
    expect(riegel(1200, 5000, 10000)).toBeCloseTo(1200 * 2 ** 1.06)
    expect(riegel(1200, 5000, 5000)).toBe(1200)
  })
})

describe('fitnessOf', () => {
  const runs = [
    run('race5', '2026-10-20', 5, 20), // 4:00/km, the best VDOT
    run('easy12', '2026-10-25', 12, 72), // 6:00/km, an easy run: far below the best
    run('tempo10', '2026-10-30', 10, 42), // 4:12/km, close to the best and longer
    run('old', '2026-07-01', 5, 18), // before the 90 days
    run('mill', '2026-10-31', 5, 15, 'treadmill'),
    run('glitch', '2026-11-01', 3, 6), // 2:00/km: GPS noise, not a run
  ]
  const streams = new Map(runs.map((r) => [r.id, even((r.distanceM ?? 0) / 1000, r.timerSec / 60)]))
  const efforts = runEfforts(runs, streams)

  it('takes each outdoor run’s fastest stretch of 3 km and more, leaving out treadmills and glitches', () => {
    expect(efforts.filter((e) => e.activityId === 'easy12').map((e) => e.meters)).toEqual([3000, 5000, 10000])
    expect(efforts.some((e) => e.activityId === 'mill' || e.activityId === 'glitch')).toBe(false)
  })

  it('predicts from the longest stretch close to the best VDOT, not from an easy run', () => {
    const fitness = fitnessOf(efforts, TODAY)
    expect(fitness.efforts.map((e) => [e.meters, e.activityId])).toEqual([
      [3000, 'race5'],
      [5000, 'race5'],
      [10000, 'tempo10'],
    ])
    expect(fitness.best).toMatchObject({ meters: 5000, activityId: 'race5' })
    expect(fitness.best!.vdot).toBeCloseTo(49.8, 1)
    expect(fitness.reference).toMatchObject({ meters: 10000, activityId: 'tempo10', seconds: 2520 })
    // 42:00 for 10 km gives 20:10 for 5 km (to the 5 seconds).
    expect(fitness.predictions.map((p) => [p.label, p.seconds])).toEqual([
      ['5 km', 1210],
      ['10 km', 2520],
      ['21,1 km', Math.round(riegel(2520, 10000, 21097.5) / 5) * 5],
      ['42,2 km', Math.round(riegel(2520, 10000, 42195) / 5) * 5],
    ])
  })

  it('has nothing to predict from without runs in the window', () => {
    expect(fitnessOf(efforts, '2027-06-01')).toEqual({ efforts: [], best: undefined, reference: undefined, predictions: [] })
  })

  it('keeps the best VDOT of each month', () => {
    const months = monthlyVdot(efforts, TODAY, 6)
    expect(months.map((m) => [m.month, m.best?.activityId])).toEqual([
      ['2026-06-01', undefined],
      ['2026-07-01', 'old'],
      ['2026-08-01', undefined],
      ['2026-09-01', undefined],
      ['2026-10-01', 'race5'],
      ['2026-11-01', undefined],
    ])
  })

  it('predicts a race, and the ends of a race given as a range', () => {
    const fitness = fitnessOf(efforts, TODAY)
    const prediction = predictRace(fitness, raceDistance('Rústica de Morungava 2026 (6 a 8km)')!)
    const at = (meters: number) => Math.round(riegel(2520, 10000, meters) / 5) * 5
    expect(prediction).toMatchObject({
      meters: 7000,
      seconds: at(7000),
      ends: [
        { meters: 6000, seconds: at(6000) },
        { meters: 8000, seconds: at(8000) },
      ],
    })
    expect(predictRace(fitnessOf([], TODAY), { meters: 5000 })).toBeUndefined()
  })
})

describe('raceDistance', () => {
  it('reads the distance from the name: km, K, a range (its middle) or the race’s own name', () => {
    expect(raceDistance('Rústica de Morungava 2026 (6 a 8km)')).toEqual({ meters: 7000, range: [6000, 8000] })
    expect(raceDistance('Corrida 4,48 - 4,97 Km')).toEqual({ meters: 4725, range: [4480, 4970] })
    expect(raceDistance('Volta da Pampulha 17,8 km')).toEqual({ meters: 17800 })
    expect(raceDistance('10K Tribuna')).toEqual({ meters: 10000 })
    expect(raceDistance('Meia Maratona de Porto Alegre')).toEqual({ meters: 21097.5 })
    expect(raceDistance('Maratona de Porto Alegre')).toEqual({ meters: 42195 })
    expect(raceDistance('Desafio das pontes')).toBeUndefined()
  })
})
