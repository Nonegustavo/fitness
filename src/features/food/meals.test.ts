import { describe, expect, it } from 'vitest'
import type { FoodLog, MealKey } from '../../db/types'
import { groupMeals } from './nutrition'

const log = (id: string, meal: MealKey): FoodLog => ({
  id,
  meal,
  date: '2026-11-05',
  time: 0,
  foodId: 'taco:1',
  name: id,
  grams: 100,
  nutrients: { kcal: 100, protein: 1, carbs: 1, fat: 1 },
  updatedAt: 0,
  deleted: 0,
  dirty: 0,
})

describe('groupMeals', () => {
  it('lists the latest meal on top, from "Ceia" up to "Café da manhã"', () => {
    const all: MealKey[] = ['breakfast', 'morningSnack', 'lunch', 'snack', 'dinner', 'supper']
    const groups = groupMeals(all.map((meal) => log(meal, meal)))
    expect(groups.map((group) => group.meals)).toEqual([['supper'], ['dinner'], ['snack'], ['lunch'], ['morningSnack'], ['breakfast']])
  })

  it('groups the empty meals next to each other, and keeps each meal’s entries', () => {
    const logs = [log('bread', 'breakfast'), log('coffee', 'breakfast'), log('rice', 'lunch')]
    expect(groupMeals(logs).map(({ meals, entries }) => [meals, entries.map((entry) => entry.id)])).toEqual([
      [['supper', 'dinner', 'snack'], []],
      [['lunch'], ['rice']],
      [['morningSnack'], []],
      [['breakfast'], ['bread', 'coffee']],
    ])
  })

  it('shows a day with nothing as one group of every meal, the latest first', () => {
    expect(groupMeals([])).toEqual([{ meals: ['supper', 'dinner', 'snack', 'lunch', 'morningSnack', 'breakfast'], entries: [] }])
  })
})
