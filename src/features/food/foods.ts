import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { alive, patch, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Food, FoodLog, FoodPref, FoodUnit, MealKey, Nutrients, Portion, QuickAmount } from '../../db/types'
import { dayTime, formatTime, type DayKey } from '../../lib/dates'
import { multiply, nutrientsFor } from './nutrition'
import tacoData from './taco.json'

export const TACO_SOURCE = 'TACO 4ª edição, NEPA/UNICAMP, 2011'

/** A food ready to be logged; TACO and custom foods look the same from here on. */
export interface FoodItem {
  /** "taco:123" or the id of a custom food. */
  id: string
  name: string
  /** TACO category, brand, or where it came from. */
  detail: string
  /** Per portion when `unit` is "portion". */
  per100: Nutrients
  portions: Portion[]
  unit?: FoodUnit
  source: 'taco' | Food['source']
}

type TacoRow = [id: number, name: string, category: number, kcal: number, protein: number, carbs: number, fat: number, fiber: number | null]
const taco = tacoData as unknown as { categories: string[]; foods: TacoRow[] }

export const TACO_FOODS: FoodItem[] = taco.foods.map(([id, name, category, kcal, protein, carbs, fat, fiber]) => ({
  id: `taco:${id}`,
  name,
  detail: taco.categories[category],
  per100: { kcal, protein, carbs, fat, fiber: fiber ?? undefined },
  portions: [],
  source: 'taco',
}))

const DETAIL: Record<Food['source'], string> = {
  custom: 'Meu alimento',
  openfoodfacts: 'Open Food Facts',
  recipe: 'Receita',
  'health-connect': 'Do Health Connect',
  ai: 'Análise por IA',
}

export function fromCustom(food: Food): FoodItem {
  return {
    id: food.id,
    name: food.name,
    detail: food.brand ?? (food.basedOn ? 'Minha versão da TACO' : DETAIL[food.source]),
    per100: food.per100,
    portions: food.portions ?? [],
    unit: food.unit,
    source: food.source,
  }
}

/** Foods with a weight: what recipes can use, as they work in grams. */
export const weighed = (items: FoodItem[]): FoodItem[] => items.filter((item) => item.unit !== 'portion')

/** The portion a food measured in portions keeps once it has a weight, so it can still be counted by it. */
const WEIGHED_PORTION = 'porção'

/**
 * A food measured in portions, once it's known what one portion weighs: its values per 100 g instead of
 * per portion (every nutrient it has), no longer measured in portions, and that portion ("porção", 30 g)
 * first among the ones it already had.
 */
export function weighedVersion(
  food: { per100: Nutrients; portions?: Portion[] },
  portionGrams: number,
): { per100: Nutrients; portions: Portion[]; unit: undefined } {
  return {
    per100: multiply(food.per100, 100 / portionGrams),
    portions: [
      { label: WEIGHED_PORTION, grams: portionGrams },
      ...(food.portions ?? []).filter((portion) => portion.label !== WEIGHED_PORTION),
    ],
    unit: undefined,
  }
}

/**
 * Saves what one portion of a food measured in portions weighs, so it's measured in grams from then on
 * (see weighedVersion). Its 1-tap shortcut and last amount, counted in portions, become the same amounts
 * in grams. Logs keep their own values and unit, so the past doesn't change.
 */
export async function weighFood(item: FoodItem, portionGrams: number): Promise<FoodItem> {
  const change = weighedVersion(item, portionGrams)
  await patch(db.foods, item.id, change)
  const pref = await db.foodPrefs.get(item.id)
  if (pref && !pref.deleted && (pref.quick || pref.lastGrams !== undefined)) {
    await updatePref(item.id, {
      lastGrams: pref.lastGrams === undefined ? undefined : pref.lastGrams * portionGrams,
      quick: pref.quick && { grams: pref.quick.grams * portionGrams, portion: change.portions[0] },
    })
  }
  return { ...item, ...change }
}

/** The user's foods plus TACO, without the TACO foods the user replaced with their own version. */
export function catalogOf(custom: Food[]): FoodItem[] {
  const replaced = new Set(custom.flatMap((food) => (food.basedOn ? [food.basedOn] : [])))
  return [...custom.map(fromCustom), ...TACO_FOODS.filter((item) => !replaced.has(item.id))]
}

export function useFoodCatalog(): FoodItem[] {
  const custom = useLiveQuery(async () => alive(await db.foods.toArray()))
  return useMemo(() => catalogOf(custom ?? []), [custom])
}

export function useFoodPrefs(): Map<string, FoodPref> {
  const prefs = useLiveQuery(() => db.foodPrefs.toArray())
  return useMemo(() => new Map(alive(prefs ?? []).map((pref) => [pref.id, pref])), [prefs])
}

/** Accent- and punctuation-free lowercase, so "Feijão, carioca" matches "feijao carioca". */
export const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()

export interface SearchEntry {
  item: FoodItem
  text: string
}

export const buildIndex = (items: FoodItem[]): SearchEntry[] => items.map((item) => ({ item, text: normalize(item.name) }))

/**
 * Every word must appear. Favorites and foods already eaten come first (people eat the
 * same things), then names starting with the first word, whole-word matches, and
 * shorter (more generic) names.
 */
export function searchFoods(index: SearchEntry[], query: string, prefs: Map<string, FoodPref>, limit = 60): FoodItem[] {
  const words = normalize(query).split(' ').filter(Boolean)
  if (words.length === 0) return []
  const scored: [number, FoodItem][] = []
  for (const { item, text } of index) {
    if (!words.every((word) => text.includes(word))) continue
    let score = text.startsWith(words[0]) ? 10 : 0
    for (const word of words) if (` ${text} `.includes(` ${word} `)) score += 2
    const pref = prefs.get(item.id)
    if (pref?.favorite) score += 20
    if (pref?.lastUsedAt) score += 12
    score -= text.length / 40
    scored.push([score, item])
  }
  return scored
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map(([, item]) => item)
}

/** Where a food goes: the meal and day, and optionally when it was eaten ("12:30"; now by default). */
export interface LogTarget {
  meal: MealKey
  date: DayKey
  time?: string
  /** The plate photo it came from. */
  photoId?: string
  /** The portion it was counted by, when it was. */
  portion?: Portion
}

/** Logs a food (grams, or portions for a food measured in portions) and remembers the amount for next time. */
export async function logFood(item: FoodItem, grams: number, { meal, date, time, photoId, portion }: LogTarget): Promise<FoodLog> {
  const now = Date.now()
  const log = await save(db.foodLogs, {
    date,
    meal,
    time: dayTime(date, time ?? formatTime(now)),
    foodId: item.id,
    name: item.name,
    grams,
    unit: item.unit,
    portion: item.unit === 'portion' ? undefined : portion,
    nutrients: nutrientsFor(item.per100, grams, item.unit),
    photoId,
  })
  await updatePref(item.id, { lastGrams: grams, lastUsedAt: now })
  return log
}

/**
 * What one tap adds: the amount used last time, or one portion, or 100 g. Counted by the food's
 * portion when it has one.
 */
export function usualAmount(item: FoodItem, lastGrams?: number): { grams: number; portion?: Portion } {
  const portion = item.unit === 'portion' ? undefined : item.portions[0]
  return { grams: lastGrams ?? (item.unit === 'portion' ? 1 : (portion?.grams ?? 100)), portion }
}

/** Changes some of a food's preferences, keeping the rest. */
async function updatePref(foodId: string, change: Partial<Omit<FoodPref, 'id'>>): Promise<void> {
  const pref = await db.foodPrefs.get(foodId)
  const current = pref && !pref.deleted ? pref : undefined
  await save(db.foodPrefs, {
    id: foodId,
    favorite: current?.favorite ?? 0,
    lastGrams: current?.lastGrams,
    lastUsedAt: current?.lastUsedAt,
    quick: current?.quick,
    ...change,
  })
}

export async function toggleFavorite(foodId: string): Promise<void> {
  const pref = await db.foodPrefs.get(foodId)
  await updatePref(foodId, { favorite: pref?.favorite && !pref.deleted ? 0 : 1 })
}

/** Makes a food a 1-tap shortcut with this amount, or removes the shortcut. */
export const setQuick = (foodId: string, quick: QuickAmount | undefined): Promise<void> => updatePref(foodId, { quick })

/**
 * Foods for a meal: the ones eaten most often in that meal lately first (breakfast foods in the
 * morning), then the rest of the recent ones.
 */
export function recentForMeal(
  logs: Pick<FoodLog, 'foodId' | 'meal' | 'time'>[],
  meal: MealKey,
  byRecency: string[],
): string[] {
  const counts = new Map<string, { n: number; last: number }>()
  for (const log of logs) {
    if (log.meal !== meal) continue
    const c = counts.get(log.foodId) ?? { n: 0, last: 0 }
    counts.set(log.foodId, { n: c.n + 1, last: Math.max(c.last, log.time) })
  }
  const inMeal = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last).map(([id]) => id)
  const seen = new Set(inMeal)
  return [...inMeal, ...byRecency.filter((id) => !seen.has(id))]
}
