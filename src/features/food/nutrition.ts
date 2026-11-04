import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { useSettings } from '../../db/hooks'
import { alive, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { FoodLog, FoodUnit, MacroGoals, MealKey, Nutrients, Portion, SavedMeal, SavedMealItem, Settings } from '../../db/types'
import { dayTime, formatTime, type DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'

export const MEALS: { key: MealKey; label: string }[] = [
  { key: 'breakfast', label: 'Café da manhã' },
  { key: 'morningSnack', label: 'Lanche da manhã' },
  { key: 'lunch', label: 'Almoço' },
  { key: 'snack', label: 'Lanche da tarde' },
  { key: 'dinner', label: 'Jantar' },
  { key: 'supper', label: 'Ceia' },
]

export const MEAL_LABEL = Object.fromEntries(MEALS.map((meal) => [meal.key, meal.label])) as Record<MealKey, string>

/** The meal that usually happens at this time of day. */
export function mealAt(date: Date): MealKey {
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes < 9 * 60 + 30) return 'breakfast'
  if (minutes < 11 * 60 + 30) return 'morningSnack'
  if (minutes < 15 * 60) return 'lunch'
  if (minutes < 18 * 60 + 30) return 'snack'
  if (minutes < 22 * 60) return 'dinner'
  return 'supper'
}

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }

/** The nutrients a table may not have; they stay undefined when unknown instead of counting as zero. */
export const OPTIONAL_NUTRIENTS = ['fiber', 'sodium', 'sugar', 'saturatedFat'] as const

export function multiply(nutrients: Nutrients, factor: number): Nutrients {
  const result: Nutrients = {
    kcal: nutrients.kcal * factor,
    protein: nutrients.protein * factor,
    carbs: nutrients.carbs * factor,
    fat: nutrients.fat * factor,
  }
  for (const key of OPTIONAL_NUTRIENTS) if (nutrients[key] !== undefined) result[key] = nutrients[key] * factor
  return result
}

/** Nutrients of `grams` of a food given per 100 g. */
export const scale = (per100: Nutrients, grams: number): Nutrients => multiply(per100, grams / 100)

/** Nutrients of an amount of a food: grams, or portions for a food measured in portions. */
export const nutrientsFor = (per100: Nutrients, amount: number, unit?: FoodUnit): Nutrients =>
  unit === 'portion' ? multiply(per100, amount) : scale(per100, amount)

/** How many of a portion a weight is: 75 g of a 50 g portion is 1,5. */
export const portionCount = (grams: number, portion: Portion): number => Math.round((grams / portion.grams) * 100) / 100

/**
 * "150 g", "1 porção", "1,5 porção", "2 porções"; logged by a portion of the food, "1 fatia · 25 g" or
 * "2× 1 fatia · 50 g".
 */
export function amountLabel(amount: number, unit?: FoodUnit, portion?: Portion): string {
  if (unit !== 'portion' && portion && portion.grams > 0) {
    const count = portionCount(amount, portion)
    return `${count === 1 ? '' : `${formatNumber(count)}× `}${portion.label} · ${formatNumber(amount, 0)} g`
  }
  if (unit !== 'portion') return `${formatNumber(amount, 0)} g`
  return `${formatNumber(amount)} ${amount < 2 ? 'porção' : 'porções'}`
}

/** Adds up; an optional nutrient is summed over the items that have it, and stays undefined when none do. */
export function sumNutrients(list: Nutrients[]): Nutrients {
  const total: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  for (const n of list) {
    total.kcal += n.kcal
    total.protein += n.protein
    total.carbs += n.carbs
    total.fat += n.fat
    for (const key of OPTIONAL_NUTRIENTS) {
      if (n[key] !== undefined) total[key] = (total[key] ?? 0) + n[key]
    }
  }
  return total
}

/** Energy implied by the macros (4/4/9 kcal per gram). */
export const kcalFromMacros = (macros: Pick<Nutrients, 'protein' | 'carbs' | 'fat'>): number =>
  macros.protein * 4 + macros.carbs * 4 + macros.fat * 9

/** The day's targets: the training-day set on days with a workout, when there is one. */
export function goalsFor(settings: Settings, trainingDay: boolean): MacroGoals | undefined {
  const goals = settings.nutrition
  if (!goals) return undefined
  return trainingDay && goals.training ? goals.training : goals.normal
}

/** The goals of a day, following whether it had a workout. */
export function useDayGoals(date: DayKey): MacroGoals | undefined {
  const settings = useSettings()
  const trainingDay = useTrainingDays(date, date)?.has(date) ?? false
  return goalsFor(settings, trainingDay)
}

/** Food logs between two days (inclusive), in the order they were eaten. */
export function useFoodLogs(from: DayKey, to: DayKey): FoodLog[] | undefined {
  return useLiveQuery(
    async () =>
      alive(await db.foodLogs.where('date').between(from, to, true, true).toArray()).sort((a, b) => a.time - b.time),
    [from, to],
  )
}

/** Days that had a workout (started or finished), for the training-day goals. */
export function useTrainingDays(from: DayKey, to: DayKey): Set<DayKey> | undefined {
  const days = useLiveQuery(
    async () =>
      alive(await db.workoutSessions.where('date').between(from, to, true, true).toArray()).map((s) => s.date),
    [from, to],
  )
  return useMemo(() => days && new Set(days), [days])
}

export function useSavedMeals(): SavedMeal[] | undefined {
  return useLiveQuery(async () =>
    alive(await db.savedMeals.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  )
}

/**
 * Logs a list of items (a saved meal, or yesterday's lunch) into a meal of a day. Items copied from
 * another day keep their time of day; the others get `time`, or now.
 */
export async function logItems(
  items: (SavedMealItem & { time?: number })[],
  meal: MealKey,
  date: DayKey,
  time?: string,
): Promise<void> {
  const fallback = time ?? formatTime(Date.now())
  for (const { foodId, name, grams, unit, portion, nutrients, time: at } of items) {
    const clock = at === undefined ? fallback : formatTime(at)
    await save(db.foodLogs, { date, meal, time: dayTime(date, clock), foodId, name, grams, unit, portion, nutrients })
  }
}
