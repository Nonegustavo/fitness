import type { Nutrients, RecipeIngredient } from '../../db/types'
import { multiply, scale, sumNutrients } from './nutrition'

export const ingredientsWeight = (ingredients: RecipeIngredient[]): number =>
  ingredients.reduce((total, ingredient) => total + ingredient.grams, 0)

/** The whole recipe: every ingredient in its amount. */
export const recipeTotal = (ingredients: RecipeIngredient[]): Nutrients =>
  sumNutrients(ingredients.map((ingredient) => scale(ingredient.per100, ingredient.grams)))

/**
 * Values per 100 g of the finished dish. Cooking moves water, not nutrients: a soup that boils
 * down from 1500 g to 1000 g has the same calories in less food, so they're spread over the weight
 * once ready, when given.
 */
export function recipePer100(ingredients: RecipeIngredient[], readyGrams?: number): Nutrients {
  const weight = readyGrams && readyGrams > 0 ? readyGrams : ingredientsWeight(ingredients)
  return multiply(recipeTotal(ingredients), weight > 0 ? 100 / weight : 0)
}
