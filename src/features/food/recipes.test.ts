import { describe, expect, it } from 'vitest'
import type { RecipeIngredient } from '../../db/types'
import { recipePer100, recipeTotal } from './recipes'

const rice: RecipeIngredient = {
  foodId: 'taco:1',
  name: 'Arroz cru',
  grams: 200,
  per100: { kcal: 360, protein: 7, carbs: 79, fat: 0.5 },
}
const oil: RecipeIngredient = { foodId: 'taco:2', name: 'Óleo', grams: 10, per100: { kcal: 884, protein: 0, carbs: 0, fat: 100 } }

describe('recipes', () => {
  it('adds up every ingredient in its amount', () => {
    expect(recipeTotal([rice, oil])).toMatchObject({ kcal: 720 + 88.4, protein: 14, carbs: 158, fat: 1 + 10 })
  })

  it('spreads the total over the ingredients, or over the weight once ready', () => {
    expect(recipePer100([rice, oil]).kcal).toBeCloseTo((808.4 / 210) * 100, 6)
    // Rice absorbs water: 210 g of ingredients become 600 g of cooked rice.
    expect(recipePer100([rice, oil], 600).kcal).toBeCloseTo((808.4 / 600) * 100, 6)
  })

  it('is all zero without ingredients', () => {
    expect(recipePer100([])).toMatchObject({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  })
})
