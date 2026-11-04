import type { MacroGoals, Nutrients, Portion } from '../../db/types'
import { usualAmount, type FoodItem } from './foods'
import { nutrientsFor, sumNutrients } from './nutrition'

/** One food in an amount, as a suggestion would log it. */
export interface Pick {
  item: FoodItem
  grams: number
  portion?: Portion
  nutrients: Nutrients
}

export interface Suggestion {
  picks: Pick[]
  total: Nutrients
}

/** What is left of the day's goals (never below zero). */
export function remainingOf(goals: MacroGoals, eaten: Nutrients): MacroGoals {
  return {
    kcal: Math.max(0, goals.kcal - eaten.kcal),
    protein: Math.max(0, goals.protein - eaten.protein),
    carbs: Math.max(0, goals.carbs - eaten.carbs),
    fat: Math.max(0, goals.fat - eaten.fat),
  }
}

const FACTORS = [0.5, 1, 1.5, 2]

/** A few amounts of a food around the usual one: half to double, by portion or rounded to 5 g. */
function amountsOf(item: FoodItem, lastGrams?: number): Pick[] {
  const usual = usualAmount(item, lastGrams)
  const base = usual.portion ? usual.portion.grams : usual.grams
  const options = new Map<number, Pick>()
  for (const factor of FACTORS) {
    const grams = usual.portion || item.unit === 'portion' ? base * factor : Math.max(5, Math.round((base * factor) / 5) * 5)
    if (!options.has(grams)) {
      options.set(grams, { item, grams, portion: usual.portion, nutrients: nutrientsFor(item.per100, grams, item.unit) })
    }
  }
  return [...options.values()]
}

/**
 * How far a combination lands from what's left: calories weigh most, then protein, then carbs and
 * fat; going over the calories costs double.
 */
export function distance(total: Nutrients, left: MacroGoals): number {
  const rel = (value: number, target: number, floor: number) => Math.abs(value - target) / Math.max(target, floor)
  const over = Math.max(0, total.kcal - left.kcal * 1.1) / Math.max(left.kcal, 100)
  return (
    rel(total.kcal, left.kcal, 100) +
    0.8 * rel(total.protein, left.protein, 15) +
    0.3 * rel(total.carbs, left.carbs, 20) +
    0.3 * rel(total.fat, left.fat, 10) +
    2 * over
  )
}

/**
 * Up to `count` ways to close the day with the user's own foods (favorites and the ones eaten
 * before): one or two of them, in amounts near the usual ones. Each food shows up in one
 * suggestion at most, so the options differ.
 */
export function closeTheDay(
  foods: { item: FoodItem; lastGrams?: number }[],
  left: MacroGoals,
  count = 3,
): Suggestion[] {
  if (left.kcal < 100) return []
  const options = foods
    .filter(({ item }) => nutrientsFor(item.per100, usualAmount(item).grams, item.unit).kcal >= 20)
    .flatMap(({ item, lastGrams }) => amountsOf(item, lastGrams))
  const scored: { picks: Pick[]; total: Nutrients; score: number }[] = []
  const consider = (picks: Pick[]) => {
    const total = sumNutrients(picks.map((pick) => pick.nutrients))
    if (total.kcal > left.kcal * 1.15) return
    scored.push({ picks, total, score: distance(total, left) })
  }
  for (let i = 0; i < options.length; i++) {
    consider([options[i]])
    for (let j = i + 1; j < options.length; j++) {
      if (options[j].item.id !== options[i].item.id) consider([options[i], options[j]])
    }
  }
  scored.sort((a, b) => a.score - b.score)
  const used = new Set<string>()
  const chosen: Suggestion[] = []
  for (const option of scored) {
    if (chosen.length >= count) break
    if (option.picks.some((pick) => used.has(pick.item.id))) continue
    for (const pick of option.picks) used.add(pick.item.id)
    chosen.push({ picks: option.picks, total: option.total })
  }
  return chosen
}
