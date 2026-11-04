import { describe, expect, it } from 'vitest'
import { balanceOf, macroShares, mostAbove, roundShares } from './macros'
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

describe('balanceOf', () => {
  const goal = macroShares({ carbs: 240, protein: 180, fat: 80 })!

  it('reads a meal with the goal split as balanced', () => {
    expect(balanceOf(macroShares({ carbs: 48, protein: 36, fat: 16 })!, goal)).toBe('balanced')
  })

  it('says which macro is above the plan', () => {
    const bread = macroShares({ carbs: 21, protein: 5, fat: 2 })!
    expect(balanceOf(bread, goal)).toBe('off')
    expect(mostAbove(bread, goal)).toBe('carbs')
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
