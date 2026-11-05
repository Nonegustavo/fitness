import { describe, expect, it } from 'vitest'
import { macroShares, roundShares } from './macros'
import { amountLabel, portionCount } from './nutrition'

describe('macroShares', () => {
  it('splits the energy of the macros by 4/4/9 kcal per gram', () => {
    const shares = macroShares({ carbs: 21, protein: 5, fat: 2 })!
    expect(roundShares(shares)).toEqual({ carbs: 69, protein: 16, fat: 15 })
  })

  it('has nothing to split without macros', () => {
    expect(macroShares({ carbs: 0, protein: 0, fat: 0 })).toBeUndefined()
  })

  it('rounds to whole percentages that add up to 100', () => {
    const rounded = roundShares({ carbs: 1 / 3, protein: 1 / 3, fat: 1 / 3 })
    expect(rounded.carbs + rounded.protein + rounded.fat).toBe(100)
  })
})

describe('portions', () => {
  const slice = { label: '2 fatias', grams: 50 }

  it('counts grams as portions', () => {
    expect(portionCount(75, slice)).toBe(1.5)
  })

  it('labels an amount logged by portion', () => {
    expect(amountLabel(50, undefined, slice)).toBe('2 fatias · 50 g')
    expect(amountLabel(100, undefined, slice)).toBe('2× 2 fatias · 100 g')
    expect(amountLabel(150)).toBe('150 g')
  })
})

describe('recentForMeal', () => {
  it('puts what is usually eaten in the meal first, then the other recents', async () => {
    const { recentForMeal } = await import('./foods')
    const logs = [
      { foodId: 'bread', meal: 'breakfast' as const, time: 1 },
      { foodId: 'bread', meal: 'breakfast' as const, time: 2 },
      { foodId: 'coffee', meal: 'breakfast' as const, time: 3 },
      { foodId: 'rice', meal: 'lunch' as const, time: 4 },
    ]
    expect(recentForMeal(logs, 'breakfast', ['rice', 'coffee', 'bread'])).toEqual(['bread', 'coffee', 'rice'])
  })
})
