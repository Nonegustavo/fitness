import { describe, expect, it } from 'vitest'
import type { DailyHealth, Pain } from '../../db/types'
import { shiftDay } from '../../lib/dates'
import type { LoadStatus } from './load'
import { readiness, readinessBand, readinessDay } from './readiness'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const DAY = '2026-11-05'

const health = (id: string, changes: Partial<DailyHealth> = {}): DailyHealth => ({ id, ...meta, ...changes })

/** The 30 days before DAY: resting heart rate 52, HRV alternating 50 and 60 (55 ± 5). */
const before = Array.from({ length: 30 }, (_, i) =>
  health(shiftDay(DAY, i - 30), { restingHr: 52, hrv: { lastNight: i % 2 ? 60 : 50 } }),
)

const load = (changes: Partial<LoadStatus> = {}): LoadStatus => ({
  date: DAY,
  load: 0,
  atl: 50,
  ctl: 50,
  tsb: 0,
  acute: 350,
  chronic: 350,
  acwr: 1,
  flag: 'balanced',
  formPct: 0,
  zone: 'neutral',
  ...changes,
})

const night = health(DAY, {
  sleep: { score: 80, totalSec: 8 * 3600 },
  hrv: { lastNight: 55, balancedLow: 50, balancedHigh: 60 },
  restingHr: 50,
})

const pain = (id: string, name: string, start: string, scores: Record<string, number>, end?: string): Pain => ({
  id,
  name,
  start,
  end,
  scores,
  ...meta,
})

describe('readiness', () => {
  it('weighs sleep, HRV, resting heart rate and load, each with its effect and why', () => {
    const result = readiness({ date: DAY, health: [...before, night], load: load() })!
    // Sleep 80, HRV in the middle of its range 85, 2 beats under the average 100, load 89: (80·30 + 85·25 + 100·15 + 89·20) / 90.
    expect(result).toMatchObject({ date: DAY, score: 87, band: 'high', penalty: 0 })
    expect(result.factors.map((factor) => [factor.key, factor.effect])).toEqual([
      ['sleep', 'up'],
      ['hrv', 'up'],
      ['restingHr', 'up'],
      ['load', 'up'],
    ])
    expect(result.factors.map((factor) => factor.reason)).toEqual([
      'nota 80 (bom)',
      '55 ms, dentro da faixa normal (50–60)',
      '50 bpm, 2 abaixo da média (52)',
      'equilibrada (ACWR 1,00), forma ±0%',
    ])
  })

  it('re-weights over the inputs there are, and gives no score with fewer than two', () => {
    const partial = health(DAY, { sleep: { score: 60, totalSec: 6 * 3600 }, restingHr: 55 })
    // (60·30 + 50·15) / 45: three beats above the average take 30 points off the 80 of a usual day.
    expect(readiness({ date: DAY, health: [...before, partial] })).toMatchObject({ score: 57, band: 'moderate' })
    expect(readiness({ date: DAY, health: [...before, health(DAY, { sleep: { score: 90, totalSec: 1 } })] })).toBeUndefined()
    // A resting heart rate needs a week of readings before it to compare with.
    expect(readiness({ date: DAY, health: [...before.slice(-3), partial] })).toBeUndefined()
  })

  it('compares the HRV with the 30 days when the watch gives no range', () => {
    const low = health(DAY, { sleep: { score: 80, totalSec: 1 }, hrv: { lastNight: 40 } })
    const hrv = readiness({ date: DAY, health: [...before, low] })!.factors.find((factor) => factor.key === 'hrv')!
    expect(hrv).toMatchObject({ score: 0, effect: 'down', reason: '40 ms, abaixo do seu normal (50–60)' })
  })

  it('takes points off for the pains going on that day: the worst score, one more per other pain', () => {
    const pains = [
      pain('shin', 'canela direita', '2026-11-01', { '2026-11-01': 6, '2026-11-03': 4 }),
      pain('back', 'lombar', '2026-11-04', { '2026-11-04': 2 }),
      pain('old', 'joelho', '2026-10-01', { '2026-10-01': 8 }, '2026-10-20'),
      pain('later', 'ombro', '2026-11-06', { '2026-11-06': 9 }),
    ]
    const result = readiness({ date: DAY, health: [...before, night], load: load(), pains })!
    expect(result).toMatchObject({ score: 82, penalty: 5 })
    expect(result.factors.at(-1)).toEqual({ key: 'pains', label: 'Dores', effect: 'down', reason: 'canela direita 4/10, lombar 2/10' })
    const many = [9, 8, 7].map((score, i) => pain(`p${i}`, `dor ${i}`, DAY, { [DAY]: score }))
    expect(readiness({ date: DAY, health: [...before, night], load: load(), pains: many })!.penalty).toBe(10)
  })

  it('never goes below 1, with a sudden rise of the load and a deep fatigue among the worst signs', () => {
    const bad = health(DAY, { sleep: { score: 10, totalSec: 1 }, hrv: { lastNight: 20, balancedLow: 50, balancedHigh: 60 }, restingHr: 62 })
    const result = readiness({
      date: DAY,
      health: [...before, bad],
      load: load({ acwr: 2.5, flag: 'spike', formPct: -70, zone: 'risk' }),
      pains: [pain('shin', 'canela', DAY, { [DAY]: 10 })],
    })!
    expect(result).toMatchObject({ score: 1, band: 'veryLow' })
    expect(result.factors.every((factor) => factor.effect === 'down')).toBe(true)
  })

  it('names the bands like Garmin', () => {
    expect([100, 75, 74, 50, 49, 25, 24, 1].map(readinessBand)).toEqual([
      'high',
      'high',
      'moderate',
      'moderate',
      'low',
      'low',
      'veryLow',
      'veryLow',
    ])
  })
})

describe('readinessDay', () => {
  const yesterday = shiftDay(DAY, -1)

  it('reads today once its night is in, else yesterday', () => {
    expect(readinessDay([health(yesterday, { restingHr: 50 }), night], DAY)).toBe(DAY)
    expect(readinessDay([health(yesterday, { sleep: { score: 70, totalSec: 1 } }), health(DAY, { steps: 900 })], DAY)).toBe(yesterday)
    expect(readinessDay([health(DAY, { steps: 900 })], DAY)).toBe(DAY)
  })
})
