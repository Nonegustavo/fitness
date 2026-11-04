import { describe, expect, it } from 'vitest'
import type { FoodPref, Settings } from '../../db/types'
import { buildIndex, searchFoods, TACO_FOODS, weighed } from './foods'
import { amountLabel, goalsFor, kcalFromMacros, mealAt, nutrientsFor, scale, sumNutrients } from './nutrition'
import { parseProduct } from './openFoodFacts'
import { matchItems, parseAnalysis } from './photo'

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

describe('photo analysis', () => {
  it('keeps well-formed items and drops the rest', () => {
    const analysis = parseAnalysis({
      items: [
        { name: 'Arroz branco', search: 'arroz tipo 1 cozido', grams: 152.4, confidence: 'alta' },
        { name: 'Sem peso', search: 'x', grams: 0, confidence: 'alta' },
        { name: 'Molho', grams: 30, confidence: 'talvez' },
        'lixo',
      ],
      notes: 'Óleo do preparo não aparece.',
    })
    expect(analysis).toEqual({
      notes: 'Óleo do preparo não aparece.',
      items: [
        { name: 'Arroz branco', search: 'arroz tipo 1 cozido', grams: 152, confidence: 'alta' },
        { name: 'Molho', search: 'Molho', grams: 30, confidence: 'media' },
      ],
    })
    expect(parseAnalysis(null)).toEqual({ items: [], notes: '' })
  })

  it('pairs each item with foods from the table', () => {
    const [rice, beans] = matchItems(
      {
        notes: '',
        items: [
          { name: 'Arroz branco', search: 'arroz tipo 1 cozido', grams: 150, confidence: 'alta' },
          { name: 'Feijão', search: 'feijao carioca cozido', grams: 100, confidence: 'media' },
        ],
      },
      index,
      noPrefs,
    )
    expect(rice.candidates[0].name).toBe('Arroz, tipo 1, cozido')
    expect(rice.foodId).toBe(rice.candidates[0].id)
    expect(beans.candidates[0].name).toBe('Feijão, carioca, cozido')
  })

  it('falls back to looser searches when the exact words find nothing', () => {
    const [banana] = matchItems(
      { notes: '', items: [{ name: 'Banana', search: 'banana prata madura grande', grams: 90, confidence: 'alta' }] },
      index,
      noPrefs,
    )
    expect(banana.candidates[0].name).toMatch(/^Banana/)
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

  it('falls back to kJ and rejects products without macros', () => {
    expect(
      parseProduct({ nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } })
        ?.per100.kcal,
    ).toBeCloseTo(100)
    expect(parseProduct({ nutriments: { 'energy-kcal_100g': 50 } })).toBeNull()
  })
})
