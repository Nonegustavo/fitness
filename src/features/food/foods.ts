import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { alive, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Food, FoodLog, FoodPref, MealKey, Nutrients, Portion } from '../../db/types'
import { dayTime, formatTime, type DayKey } from '../../lib/dates'
import { scale } from './nutrition'
import tacoData from './taco.json'

export const TACO_SOURCE = 'TACO 4ª edição, NEPA/UNICAMP, 2011'

/** A food ready to be logged; TACO and custom foods look the same from here on. */
export interface FoodItem {
  /** "taco:123" or the id of a custom food. */
  id: string
  name: string
  /** TACO category, brand, or where it came from. */
  detail: string
  per100: Nutrients
  portions: Portion[]
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

export function fromCustom(food: Food): FoodItem {
  return {
    id: food.id,
    name: food.name,
    detail: food.brand ?? (food.source === 'openfoodfacts' ? 'Open Food Facts' : 'Meu alimento'),
    per100: food.per100,
    portions: food.portions ?? [],
    source: food.source,
  }
}

/** TACO plus the user's foods. */
export function useFoodCatalog(): FoodItem[] {
  const custom = useLiveQuery(async () => alive(await db.foods.toArray()))
  return useMemo(() => [...(custom ?? []).map(fromCustom), ...TACO_FOODS], [custom])
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

/** Logs a food and remembers the amount for next time. */
export async function logFood(item: FoodItem, grams: number, meal: MealKey, date: DayKey): Promise<FoodLog> {
  const now = Date.now()
  const log = await save(db.foodLogs, {
    date,
    meal,
    time: dayTime(date, formatTime(now)),
    foodId: item.id,
    name: item.name,
    grams,
    nutrients: scale(item.per100, grams),
  })
  const pref = await db.foodPrefs.get(item.id)
  await save(db.foodPrefs, { id: item.id, favorite: pref?.favorite ?? 0, lastGrams: grams, lastUsedAt: now })
  return log
}

export async function toggleFavorite(foodId: string): Promise<void> {
  const pref = await db.foodPrefs.get(foodId)
  await save(db.foodPrefs, {
    id: foodId,
    favorite: pref?.favorite ? 0 : 1,
    lastGrams: pref?.lastGrams,
    lastUsedAt: pref?.lastUsedAt,
  })
}
