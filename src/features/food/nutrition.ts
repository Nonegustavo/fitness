import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { alive, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { FoodLog, FoodUnit, MacroGoals, MealKey, Nutrients, SavedMeal, SavedMealItem, Settings } from '../../db/types'
import { dayTime, formatTime, type DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'

export const MEALS: { key: MealKey; label: string }[] = [
  { key: 'breakfast', label: 'Café da manhã' },
  { key: 'lunch', label: 'Almoço' },
  { key: 'snack', label: 'Lanches' },
  { key: 'dinner', label: 'Jantar' },
  { key: 'supper', label: 'Ceia' },
]

export const MEAL_LABEL = Object.fromEntries(MEALS.map((meal) => [meal.key, meal.label])) as Record<MealKey, string>

/** The meal that usually happens at this time of day. */
export function mealAt(date: Date): MealKey {
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes < 10 * 60 + 30) return 'breakfast'
  if (minutes < 15 * 60) return 'lunch'
  if (minutes < 18 * 60 + 30) return 'snack'
  if (minutes < 22 * 60) return 'dinner'
  return 'supper'
}

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }

export function multiply(nutrients: Nutrients, factor: number): Nutrients {
  return {
    kcal: nutrients.kcal * factor,
    protein: nutrients.protein * factor,
    carbs: nutrients.carbs * factor,
    fat: nutrients.fat * factor,
    fiber: nutrients.fiber === undefined ? undefined : nutrients.fiber * factor,
  }
}

/** Nutrients of `grams` of a food given per 100 g. */
export const scale = (per100: Nutrients, grams: number): Nutrients => multiply(per100, grams / 100)

/** Nutrients of an amount of a food: grams, or portions for a food measured in portions. */
export const nutrientsFor = (per100: Nutrients, amount: number, unit?: FoodUnit): Nutrients =>
  unit === 'portion' ? multiply(per100, amount) : scale(per100, amount)

/** "150 g", "1 porção", "1,5 porção", "2 porções". */
export function amountLabel(amount: number, unit?: FoodUnit): string {
  if (unit !== 'portion') return `${formatNumber(amount, 0)} g`
  return `${formatNumber(amount)} ${amount < 2 ? 'porção' : 'porções'}`
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce<Nutrients>(
    (total, n) => ({
      kcal: total.kcal + n.kcal,
      protein: total.protein + n.protein,
      carbs: total.carbs + n.carbs,
      fat: total.fat + n.fat,
      fiber: (total.fiber ?? 0) + (n.fiber ?? 0),
    }),
    { ...ZERO },
  )
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

/** Logs a list of items (a saved meal, or yesterday's lunch) into a meal of a day. */
export async function logItems(items: SavedMealItem[], meal: MealKey, date: DayKey): Promise<void> {
  const time = dayTime(date, formatTime(Date.now()))
  for (const { foodId, name, grams, unit, nutrients } of items) {
    await save(db.foodLogs, { date, meal, time, foodId, name, grams, unit, nutrients })
  }
}
