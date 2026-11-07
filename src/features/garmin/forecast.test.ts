import { describe, expect, it } from 'vitest'
import { shiftDay } from '../../lib/dates'
import { forecastDay, restingEstimate, wholeDaysResting, type DayEnergy } from './forecast'

const today = '2026-11-06'

/** Finished days with a resting part of `resting` kcal, from `count` days ago to yesterday. */
const finished = (count: number, resting: (i: number) => number): DayEnergy[] =>
  Array.from({ length: count }, (_, i) => ({ day: shiftDay(today, -count + i), active: 500, total: 500 + resting(i) }))

describe('restingEstimate', () => {
  it("takes the median of the watch's last 14 whole days", () => {
    // 20 days: the 6 oldest at 1500 fall out; of the newest 14, one was cut short at 900.
    const days = finished(20, (i) => (i < 6 ? 1500 : i === 15 ? 900 : 1840 + (i % 3)))
    const estimate = restingEstimate({ days, today })!
    expect(estimate.source).toEqual({ kind: 'watch', days: 14 })
    expect(estimate.kcal).toBe(1841)
  })

  it("leaves out today and the days missing a number", () => {
    const days: DayEnergy[] = [
      { day: shiftDay(today, -2), total: 2600, active: 760 },
      { day: shiftDay(today, -1), total: 2500 },
      { day: today, total: 1500, active: 400 },
    ]
    expect(wholeDaysResting(days, today)).toEqual([1840])
  })

  it("falls back to the scale's BMR, then to the formula", () => {
    const scaleBmr = { kcal: 1790, date: '2026-11-05' }
    expect(restingEstimate({ days: [], today, scaleBmr, formulaBmr: 1780 })).toEqual({ kcal: 1790, source: { kind: 'scale', date: '2026-11-05' } })
    expect(restingEstimate({ days: [], today, formulaBmr: 1780 })).toEqual({ kcal: 1780, source: { kind: 'formula' } })
    expect(restingEstimate({ days: [], today })).toBeUndefined()
  })
})

describe('forecastDay', () => {
  const resting = { kcal: 1840, source: { kind: 'watch', days: 14 } } as const

  it("adds the day's resting calories to the active ones so far", () => {
    // At 14:30 Garmin has counted 610 active and 1112 resting.
    const forecast = forecastDay({ total: 1722, active: 610 }, resting)
    expect(forecast.kcal).toBe(2450)
    expect(forecast.restingSoFar).toBe(1112)
    expect(forecast.restingLeft).toBe(728)
  })

  it('never says less than what was already counted', () => {
    const forecast = forecastDay({ total: 2700, active: 800 }, resting)
    expect(forecast.kcal).toBe(2700)
    expect(forecast.restingLeft).toBe(0)
  })

  it('is the whole resting day before anything comes from the watch', () => {
    expect(forecastDay(undefined, resting).kcal).toBe(1840)
  })
})
