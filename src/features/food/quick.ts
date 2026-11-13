import type { FoodLog, MealKey, Nutrients, Synced } from '../../db/types'
import { dayTime, formatTime, type DayKey } from '../../lib/dates'
import { kcalFromMacros } from './nutrition'

/**
 * The `foodId` of a quick entry: calories and macros typed straight into the day, with no food behind
 * them. No food has this id, so nothing looks it up (recents, favorites, prefs).
 */
export const QUICK_FOOD_ID = 'quick'

/** The name a quick entry gets when none is typed. */
export const QUICK_NAME = 'Registro rápido'

/** What the quick entry sheet holds, parsed: undefined where a field is empty. */
export interface QuickValues {
  name: string
  kcal?: number
  carbs?: number
  protein?: number
  fat?: number
}

/**
 * The nutrients of a quick entry, or undefined when they don't make one: something must be given, and
 * nothing negative. Empty calories come from the macros; empty macros are zero (only the calories known,
 * "uns 450 kcal").
 */
export function quickNutrients({ kcal, carbs, protein, fat }: Omit<QuickValues, 'name'>): Nutrients | undefined {
  const typed = [kcal, carbs, protein, fat].filter((value) => value !== undefined)
  if (typed.length === 0 || typed.some((value) => !Number.isFinite(value) || value < 0)) return undefined
  const macros = { carbs: carbs ?? 0, protein: protein ?? 0, fat: fat ?? 0 }
  const nutrients = { kcal: kcal ?? kcalFromMacros(macros), ...macros }
  return nutrients.kcal > 0 || typed.some((value) => value > 0) ? nutrients : undefined
}

/**
 * The log of a quick entry, in a meal of a day at `time` ("12:30"; now when unset): one portion holding
 * the values as typed, as the logs imported from the old spreadsheet already are. Undefined when the
 * values don't make one (see quickNutrients).
 */
export function quickLog(
  values: QuickValues,
  { meal, date, time }: { meal: MealKey; date: DayKey; time?: string },
  now = Date.now(),
): Omit<FoodLog, keyof Synced> | undefined {
  const nutrients = quickNutrients(values)
  if (!nutrients) return undefined
  return {
    date,
    meal,
    time: dayTime(date, time ?? formatTime(now)),
    foodId: QUICK_FOOD_ID,
    name: values.name.trim() || QUICK_NAME,
    grams: 1,
    unit: 'portion',
    nutrients,
  }
}
