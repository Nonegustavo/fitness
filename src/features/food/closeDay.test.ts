import { describe, expect, it } from 'vitest'
import { closeTheDay, remainingOf } from './closeDay'
import type { FoodItem } from './foods'
import { usualAmount } from './foods'

const food = (id: string, per100: { kcal: number; protein: number; carbs: number; fat: number }, portion?: { label: string; grams: number }): FoodItem => ({
  id,
  name: id,
  detail: '',
  per100,
  portions: portion ? [portion] : [],
  source: 'custom',
})

const whey = food('Whey', { kcal: 400, protein: 80, carbs: 10, fat: 5 }, { label: '1 scoop', grams: 30 })
const rice = food('Arroz', { kcal: 128, protein: 2.5, carbs: 28, fat: 0.2 })
const coffee = food('Café', { kcal: 2, protein: 0, carbs: 0, fat: 0 })
const yogurt = food('Iogurte', { kcal: 70, protein: 4, carbs: 9, fat: 2 }, { label: '1 pote', grams: 170 })

describe('closeTheDay', () => {
  it('knows what is left, never below zero', () => {
    expect(remainingOf({ kcal: 2000, protein: 150, carbs: 200, fat: 60 }, { kcal: 1700, protein: 160, carbs: 150, fat: 40 })).toEqual({
      kcal: 300,
      protein: 0,
      carbs: 50,
      fat: 20,
    })
  })

  it('suggests protein when protein is what is missing', () => {
    const left = { kcal: 250, protein: 45, carbs: 10, fat: 5 }
    const [best] = closeTheDay([{ item: whey }, { item: rice, lastGrams: 150 }, { item: coffee }], left)
    expect(best.picks.map((p) => p.item.id)).toContain('Whey')
    expect(best.total.kcal).toBeLessThanOrEqual(left.kcal * 1.15)
  })

  it('leaves out foods without calories and gives distinct options', () => {
    const suggestions = closeTheDay([{ item: whey }, { item: rice }, { item: coffee }, { item: yogurt }], { kcal: 500, protein: 40, carbs: 50, fat: 10 })
    const ids = suggestions.flatMap((s) => s.picks.map((p) => p.item.id))
    expect(ids).not.toContain('Café')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has nothing to say when the day is closed', () => {
    expect(closeTheDay([{ item: whey }], { kcal: 50, protein: 0, carbs: 0, fat: 0 })).toEqual([])
  })
})

describe('usualAmount', () => {
  it('uses the last amount, else one portion, else 100 g', () => {
    expect(usualAmount(whey)).toEqual({ grams: 30, portion: { label: '1 scoop', grams: 30 } })
    expect(usualAmount(rice)).toEqual({ grams: 100, portion: undefined })
    expect(usualAmount(rice, 150).grams).toBe(150)
  })
})
