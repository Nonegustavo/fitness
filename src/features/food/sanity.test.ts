import { describe, expect, it } from 'vitest'
import { foodWarnings } from './sanity'

const codes = (...args: Parameters<typeof foodWarnings>) => foodWarnings(...args).map((warning) => warning.code)

describe('foodWarnings', () => {
  it('says nothing about values that add up', () => {
    // Cooked rice (TACO): 128 kcal, the macros give 125.
    expect(foodWarnings({ kcal: 128, carbs: 28.1, protein: 2.5, fat: 0.2 })).toEqual([])
    // Olive oil: 884 kcal in 100 g.
    expect(foodWarnings({ kcal: 884, carbs: 0, protein: 0, fat: 100 })).toEqual([])
  })

  it('flags calories far from the macros, by share and by kcal', () => {
    expect(codes({ kcal: 300, carbs: 10, protein: 5, fat: 2 })).toEqual(['kcal'])
    expect(foodWarnings({ kcal: 300, carbs: 10, protein: 5, fat: 2 })[0].text).toMatch(/[Cc]onfira/)
    // Calories much lower than the macros give are as wrong.
    expect(codes({ kcal: 100, carbs: 40, protein: 10, fat: 5 })).toEqual(['kcal'])
  })

  it('lets small gaps go: a light food off by a large share, or a dense one by a small share', () => {
    // 30 kcal from nothing: more than 25 %, but under 40 kcal (fiber, a rounded label).
    expect(codes({ kcal: 30, carbs: 0, protein: 0, fat: 0 })).toEqual([])
    // 50 kcal over 450: more than 40 kcal, but about 11 %.
    expect(codes({ kcal: 500, carbs: 60, protein: 20, fat: 10 })).toEqual([])
  })

  it('flags more energy than 100 g can hold', () => {
    expect(codes({ kcal: 1220, carbs: 0, protein: 0, fat: 135 })).toEqual(['dense', 'sum'])
    expect(foodWarnings({ kcal: 1220, carbs: 0, protein: 0, fat: 135 })[0].text).toContain('1.220 kcal em 100 g')
  })

  it('flags macros that add up to more than 100 g in 100 g', () => {
    expect(codes({ kcal: 485, carbs: 80, protein: 30, fat: 5 })).toEqual(['sum'])
    expect(foodWarnings({ kcal: 485, carbs: 80, protein: 30, fat: 5 })[0].text).toContain('115 g')
  })

  it("doesn't take a portion turned into 100 g for too much over a rounding", () => {
    expect(codes({ kcal: 900.0000001, carbs: 0, protein: 0, fat: 100.00000000000001 })).toEqual([])
  })

  it('only checks the calories of a food measured in portions, whatever a portion holds', () => {
    expect(codes({ kcal: 1300, carbs: 150, protein: 40, fat: 60 }, { unit: 'portion' })).toEqual([])
    expect(codes({ kcal: 1300, carbs: 50, protein: 10, fat: 10 }, { unit: 'portion' })).toEqual(['kcal'])
  })
})
