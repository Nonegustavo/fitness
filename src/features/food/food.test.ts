import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { patch, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { FoodPref, Settings } from '../../db/types'
import {
  buildIndex,
  fromCustom,
  logFood,
  searchFoods,
  suggestEmoji,
  TACO_FOODS,
  toggleFavorite,
  updatePref,
  weighed,
  weighedVersion,
  weighFood,
} from './foods'
import { amountLabel, goalsFor, kcalFromMacros, mealAt, nutrientsFor, scale, sumNutrients } from './nutrition'
import { parseProduct } from './openFoodFacts'

const index = buildIndex(TACO_FOODS)
const noPrefs = new Map<string, FoodPref>()
const meta = { updatedAt: 0, deleted: 0 as const, dirty: 0 as const }

describe('TACO table', () => {
  it('ships the analyzed foods with their nutrients per 100 g', () => {
    expect(TACO_FOODS.length).toBe(593)
    expect(TACO_FOODS.find((f) => f.name === 'Arroz, tipo 1, cozido')?.per100).toMatchObject({
      kcal: 128,
      protein: 2.5,
      carbs: 28.1,
      fat: 0.2,
    })
  })
})

describe('searchFoods', () => {
  it('ignores accents and punctuation', () => {
    expect(searchFoods(index, 'feijao carioca cozido', noPrefs)[0].name).toBe('Feijão, carioca, cozido')
  })

  it('puts names starting with the first word ahead', () => {
    const results = searchFoods(index, 'arroz cozido', noPrefs).map((f) => f.name)
    expect(results[0]).toMatch(/^Arroz,.*cozido/)
  })

  it('boosts favorites', () => {
    const plain = searchFoods(index, 'frango', noPrefs)
    const last = plain[plain.length - 1]
    const prefs = new Map<string, FoodPref>([[last.id, { id: last.id, favorite: 1, ...meta }]])
    expect(searchFoods(index, 'frango', prefs)[0].id).toBe(last.id)
  })
})

describe('nutrition', () => {
  it('scales per-100 g values and adds them up', () => {
    const rice = scale({ kcal: 128, protein: 2.5, carbs: 28.1, fat: 0.2 }, 150)
    expect(rice.kcal).toBeCloseTo(192)
    expect(sumNutrients([rice, rice]).carbs).toBeCloseTo(84.3)
  })

  it('counts foods without a weight in portions', () => {
    const whey = { kcal: 124, protein: 23, carbs: 3.5, fat: 0 }
    expect(nutrientsFor(whey, 1.5, 'portion').protein).toBeCloseTo(34.5)
    expect(nutrientsFor(whey, 150).protein).toBeCloseTo(34.5)
    expect(amountLabel(150)).toBe('150 g')
    expect(amountLabel(1, 'portion')).toBe('1 porção')
    expect(amountLabel(1.5, 'portion')).toBe('1,5 porção')
    expect(amountLabel(2, 'portion')).toBe('2 porções')
  })

  it('keeps foods measured in portions out of what works in grams', () => {
    const item = (id: string, unit?: 'portion') => ({ id, name: id, detail: '', per100: TACO_FOODS[0].per100, portions: [], unit, source: 'custom' as const })
    expect(weighed([item('a'), item('b', 'portion')]).map((i) => i.id)).toEqual(['a'])
  })

  it('guesses the meal from the time of day', () => {
    expect(mealAt(new Date(2026, 10, 2, 7, 30))).toBe('breakfast')
    expect(mealAt(new Date(2026, 10, 2, 10, 15))).toBe('morningSnack')
    expect(mealAt(new Date(2026, 10, 2, 12, 30))).toBe('lunch')
    expect(mealAt(new Date(2026, 10, 2, 16, 0))).toBe('snack')
    expect(mealAt(new Date(2026, 10, 2, 20, 0))).toBe('dinner')
    expect(mealAt(new Date(2026, 10, 2, 23, 0))).toBe('supper')
  })

  it('uses the training-day goals only on days with a workout', () => {
    const normal = { kcal: 2200, protein: 160, carbs: 220, fat: 70 }
    const training = { ...normal, kcal: 2600, carbs: 320 }
    const settings = { nutrition: { normal, training } } as Settings
    expect(goalsFor(settings, true)).toBe(training)
    expect(goalsFor(settings, false)).toBe(normal)
    expect(goalsFor({} as Settings, true)).toBeUndefined()
  })

  it('computes energy from macros', () => {
    expect(kcalFromMacros({ protein: 150, carbs: 200, fat: 70 })).toBe(2030)
  })
})

describe('a food measured in portions, logged in grams', () => {
  it('turns into a food measured in grams, given what a portion weighs', () => {
    // One portion of bread from Health Connect: 2 slices, 50 g.
    const bread = { per100: { kcal: 120, protein: 5, carbs: 21, fat: 1.8, fiber: 3.7 }, unit: 'portion' as const }
    const weighedBread = weighedVersion(bread, 50)
    expect(weighedBread.unit).toBeUndefined()
    expect(weighedBread.per100.kcal).toBeCloseTo(240)
    expect(weighedBread.per100.carbs).toBeCloseTo(42)
    expect(weighedBread.per100.fat).toBeCloseTo(3.6)
    expect(weighedBread.per100.fiber).toBeCloseTo(7.4)
    // Only the nutrients it had: no sodium appears.
    expect('sodium' in weighedBread.per100).toBe(false)
    expect(weighedBread.portions).toEqual([{ label: 'porção', grams: 50 }])
    // 75 g of it is the same as 1,5 portion was.
    expect(nutrientsFor(weighedBread.per100, 75).kcal).toBeCloseTo(nutrientsFor(bread.per100, 1.5, 'portion').kcal)
  })

  it('keeps the portions a food already had after the new one', () => {
    const food = { per100: { kcal: 90, protein: 6, carbs: 1, fat: 7 }, portions: [{ label: '1 unidade', grams: 50 }] }
    expect(weighedVersion(food, 45).portions).toEqual([
      { label: 'porção', grams: 45 },
      { label: '1 unidade', grams: 50 },
    ])
    // A stale "porção" is replaced rather than repeated.
    expect(weighedVersion({ ...food, portions: [{ label: 'porção', grams: 30 }] }, 45).portions).toEqual([{ label: 'porção', grams: 45 }])
  })

  it('saves the weight in the food, and its last amount becomes grams', async () => {
    const bread = await save(db.foods, {
      name: 'Pão de forma',
      per100: { kcal: 120, protein: 5, carbs: 21, fat: 1.8 },
      unit: 'portion',
      source: 'health-connect',
    })
    await save(db.foodPrefs, { id: bread.id, favorite: 1, lastGrams: 2, quick: { grams: 1 }, emoji: '🍞' })
    const item = await weighFood(fromCustom(bread), 50)
    expect(item).toMatchObject({ id: bread.id, unit: undefined, portions: [{ label: 'porção', grams: 50 }] })

    const stored = await db.foods.get(bread.id)
    expect(stored && 'unit' in stored).toBe(false)
    expect(stored).toMatchObject({ source: 'health-connect', dirty: 1, portions: [{ label: 'porção', grams: 50 }] })
    expect(stored?.per100.kcal).toBeCloseTo(240)
    // The old 1-tap shortcut is no longer offered: its data stays as it was.
    expect(await db.foodPrefs.get(bread.id)).toMatchObject({ favorite: 1, lastGrams: 100, quick: { grams: 1 }, emoji: '🍞' })
  })
})

describe('editing a food', () => {
  it('never changes what was logged before', async () => {
    const yogurt = await save(db.foods, {
      name: 'Iogurte natural',
      per100: { kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.2 },
      source: 'custom',
    })
    const log = await logFood(fromCustom(yogurt), 170, { meal: 'breakfast', date: '2026-11-04', time: '08:00' })

    // A new name and values (the food form saves the whole food again), then the patch of an analysis.
    await save(db.foods, { ...yogurt, name: 'Iogurte grego', per100: { kcal: 120, protein: 9, carbs: 5, fat: 7 } })
    await patch(db.foods, yogurt.id, { per100: { kcal: 90, protein: 6, carbs: 5, fat: 5 } })

    const stored = await db.foodLogs.get(log.id)
    expect(stored?.name).toBe('Iogurte natural')
    expect(stored?.grams).toBe(170)
    expect(stored?.nutrients.kcal).toBeCloseTo(103.7)
    expect(stored?.nutrients.protein).toBeCloseTo(5.95)
  })
})

describe('food prefs', () => {
  it('keep every other field when one changes', async () => {
    await save(db.foodPrefs, { id: 'taco:1', favorite: 0, lastGrams: 150, quick: { grams: 1 }, photoId: 'photo', emoji: '🍚' })
    await toggleFavorite('taco:1')
    expect(await db.foodPrefs.get('taco:1')).toMatchObject({
      favorite: 1,
      lastGrams: 150,
      quick: { grams: 1 },
      photoId: 'photo',
      emoji: '🍚',
    })
    await updatePref('taco:1', { photoId: undefined })
    expect(await db.foodPrefs.get('taco:1')).toMatchObject({ favorite: 1, photoId: undefined, emoji: '🍚' })
  })

  it('take a suggested emoji only when the food has none, an empty one included', async () => {
    await suggestEmoji('taco:2', '🫘')
    await suggestEmoji('taco:2', '🍲')
    expect((await db.foodPrefs.get('taco:2'))?.emoji).toBe('🫘')
    await save(db.foodPrefs, { id: 'taco:3', favorite: 1, emoji: '' })
    await suggestEmoji('taco:3', '🥩')
    expect(await db.foodPrefs.get('taco:3')).toMatchObject({ favorite: 1, emoji: '' })
  })
})

describe('parseProduct', () => {
  it('reads the Open Food Facts nutrition table', () => {
    const product = parseProduct({
      product_name: 'Iogurte natural',
      brands: 'Marca A, Marca B',
      serving_quantity: '170',
      serving_size: '170 g',
      nutriments: {
        'energy-kcal_100g': 61,
        proteins_100g: 3.5,
        carbohydrates_100g: 4.7,
        fat_100g: 3.2,
      },
    })
    expect(product).toEqual({
      name: 'Iogurte natural',
      brand: 'Marca A',
      per100: { kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.2, fiber: undefined },
      portion: { label: '1 porção (170 g)', grams: 170 },
    })
  })

  it('reads the small front picture, or a larger one, only over https', () => {
    const nutriments = { 'energy-kcal_100g': 61, proteins_100g: 3.5, carbohydrates_100g: 4.7, fat_100g: 3.2 }
    const small = 'https://images.openfoodfacts.org/images/products/789/front_pt.4.200.jpg'
    const large = 'https://images.openfoodfacts.org/images/products/789/front_pt.4.400.jpg'
    expect(parseProduct({ nutriments, image_front_small_url: small, image_front_url: large })?.imageUrl).toBe(small)
    expect(parseProduct({ nutriments, image_front_url: large })?.imageUrl).toBe(large)
    expect(parseProduct({ nutriments, image_url: 'http://example.com/a.jpg' })?.imageUrl).toBeUndefined()
  })

  it('falls back to kJ and rejects products without macros', () => {
    expect(
      parseProduct({ nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } })
        ?.per100.kcal,
    ).toBeCloseTo(100)
    expect(parseProduct({ nutriments: { 'energy-kcal_100g': 50 } })).toBeNull()
  })
})
