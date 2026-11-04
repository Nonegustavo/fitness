import { describe, expect, it } from 'vitest'
import { shiftDay } from '../../lib/dates'
import { daysToTarget, estimateExpenditure, kcalForRate, slopePerDay } from './energy'
import { multiply, sumNutrients } from './nutrition'

const today = '2026-11-04'

describe('estimateExpenditure', () => {
  it('adds the energy of the weight lost to what was eaten', () => {
    const intake = new Map<string, number>()
    const trend = []
    for (let i = 1; i <= 28; i++) {
      const date = shiftDay(today, -i)
      intake.set(date, 2300)
      // 0,3 kg a week down.
      trend.push({ date, value: 80 - ((28 - i) * 0.3) / 7 })
    }
    trend.reverse()
    const result = estimateExpenditure(intake, trend, today)!
    expect(result.kgPerWeek).toBeCloseTo(-0.3)
    expect(result.kcal).toBeCloseTo(2300 + (0.3 * 7700) / 7)
    expect(result.confidence).toBe('ok')
  })

  it('ignores days that look forgotten and needs enough data', () => {
    const intake = new Map([[shiftDay(today, -1), 300]])
    expect(estimateExpenditure(intake, [], today)).toBeUndefined()
  })
})

describe('weight goal helpers', () => {
  it('fits a slope per day', () => {
    expect(slopePerDay([{ date: '2026-11-01', value: 80 }, { date: '2026-11-08', value: 79.3 }])).toBeCloseTo(-0.1)
  })

  it('turns a pace into calories and a date', () => {
    expect(kcalForRate(2600, -0.5)).toBeCloseTo(2050)
    expect(daysToTarget(80, 75, -0.5)).toBe(70)
    expect(daysToTarget(80, 75, 0.2)).toBeUndefined()
  })
})

describe('optional nutrients', () => {
  it('stay unknown instead of zero and scale when known', () => {
    const total = sumNutrients([
      { kcal: 100, protein: 1, carbs: 2, fat: 3, sodium: 200 },
      { kcal: 50, protein: 1, carbs: 1, fat: 1 },
    ])
    expect(total.sodium).toBe(200)
    expect(total.sugar).toBeUndefined()
    expect(multiply({ kcal: 100, protein: 1, carbs: 2, fat: 3, sugar: 4 }, 2).sugar).toBe(8)
  })
})
