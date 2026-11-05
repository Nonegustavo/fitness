import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/schema'
import type { Food } from '../../db/types'
import { scale } from './nutrition'
import {
  findAiFood,
  itemsToText,
  macroKcal,
  parseAnalysis,
  parseMacros,
  per100Of,
  saveAiFood,
  unsureNames,
  withGrams,
  type MacroItem,
} from './photo'

const rice: MacroItem = { name: 'Arroz branco', grams: 150, carbs: 42.3, protein: 3.8, fat: 0.4 }

describe('photo step', () => {
  it('keeps well-formed items and drops the rest', () => {
    const analysis = parseAnalysis({
      items: [
        { name: ' Arroz branco ', search: 'arroz tipo 1 cozido', grams: 152.4, confidence: 'alta' },
        { name: 'Sem peso', grams: 0, confidence: 'alta' },
        { name: '', grams: 50, confidence: 'alta' },
        { name: 'Molho', grams: 30, confidence: 'talvez' },
        null,
        'lixo',
      ],
      notes: 'Óleo do preparo não aparece.',
    })
    expect(analysis).toEqual({
      notes: 'Óleo do preparo não aparece.',
      items: [
        { name: 'Arroz branco', grams: 152, confidence: 'alta' },
        { name: 'Molho', grams: 30, confidence: 'media' },
      ],
    })
    expect(parseAnalysis(null)).toEqual({ items: [], notes: '' })
  })

  it('writes the items as the list to correct, one per line, and names the doubtful ones', () => {
    const items = [
      { name: 'Arroz branco', grams: 150, confidence: 'alta' as const },
      { name: 'Feijão', grams: 100, confidence: 'media' as const },
      { name: 'Farofa', grams: 1500, confidence: 'baixa' as const },
    ]
    // Plain digits: "1.500 g" could read as 1,5 g.
    expect(itemsToText(items)).toBe('Arroz branco: 150 g\nFeijão: 100 g\nFarofa: 1500 g')
    expect(unsureNames(items)).toEqual(['Feijão', 'Farofa'])
    expect(itemsToText([])).toBe('')
  })
})

describe('macros step', () => {
  it('checks the answer field by field and drops malformed items', () => {
    const analysis = parseMacros({
      items: [
        { name: ' Arroz branco ', grams: 150, carbs: 42.27, protein: 3.8, fat: 0.4 },
        { name: 'Feijão carioca', grams: 86.4, carbs: 11.7, protein: 4.1, fat: 0.4 },
        { name: 'Café preto', grams: 50, carbs: 0, protein: 0, fat: 0 },
        { name: 'Sem gramas', grams: 0, carbs: 1, protein: 1, fat: 1 },
        { name: 'Gordura negativa', grams: 10, carbs: 1, protein: 1, fat: -1 },
        { name: 'Sem proteína', grams: 10, carbs: 1, fat: 1 },
        { name: 'Gramas em texto', grams: '100', carbs: 1, protein: 1, fat: 1 },
        { name: 'Infinito', grams: 100, carbs: Infinity, protein: 1, fat: 1 },
        { name: '  ', grams: 100, carbs: 1, protein: 1, fat: 1 },
        null,
        'lixo',
      ],
      notes: ' Arroz e feijão sem óleo. ',
    })
    expect(analysis).toEqual({
      notes: 'Arroz e feijão sem óleo.',
      items: [
        { name: 'Arroz branco', grams: 150, carbs: 42.3, protein: 3.8, fat: 0.4 },
        { name: 'Feijão carioca', grams: 86, carbs: 11.7, protein: 4.1, fat: 0.4 },
        { name: 'Café preto', grams: 50, carbs: 0, protein: 0, fat: 0 },
      ],
    })
    expect(parseMacros('lixo')).toEqual({ items: [], notes: '' })
    expect(parseMacros({ items: 'x', notes: 3 })).toEqual({ items: [], notes: '' })
  })

  it('keeps the emoji of each item when it is one', () => {
    const [rice, beans, egg] = parseMacros({
      items: [
        { name: 'Arroz', grams: 150, carbs: 42, protein: 4, fat: 0.4, emoji: '🍚' },
        { name: 'Feijão', grams: 86, carbs: 12, protein: 4, fat: 0.4, emoji: 'feijão' },
        { name: 'Ovo', grams: 50, carbs: 0.5, protein: 6, fat: 5, emoji: '' },
      ],
      notes: '',
    }).items
    expect(rice.emoji).toBe('🍚')
    expect(beans).not.toHaveProperty('emoji')
    expect(egg).not.toHaveProperty('emoji')
  })

  it('counts the energy from the macros, 4/4/9 kcal per gram, rounded', () => {
    expect(macroKcal(rice)).toBe(188)
    expect(macroKcal({ carbs: 0.2, protein: 0.1, fat: 0.1 })).toBe(2)
    expect(macroKcal({ carbs: 0, protein: 0, fat: 0 })).toBe(0)
  })

  it('scales the macros with the grams typed', () => {
    const more = withGrams(rice, 200)
    expect(more.grams).toBe(200)
    expect(more.carbs).toBeCloseTo(56.4)
    expect(more.protein).toBeCloseTo(5.07)
    expect(macroKcal(more)).toBe(251)
    expect(withGrams(rice, 0)).toMatchObject({ carbs: 0, protein: 0, fat: 0 })
  })

  it('keeps an item per 100 g, with only energy and the three macros', () => {
    const per100 = per100Of(rice)
    expect(Object.keys(per100).sort()).toEqual(['carbs', 'fat', 'kcal', 'protein'])
    expect(per100.carbs).toBeCloseTo(28.2)
    expect(per100.protein).toBeCloseTo(2.53)
    expect(per100.fat).toBeCloseTo(0.27)
    expect(per100.kcal).toBeCloseTo(125.33)
    // Logged in any amount, it gives the same numbers as the review showed.
    expect(scale(per100, 150).carbs).toBeCloseTo(42.3)
    expect(scale(per100, 150).kcal).toBeCloseTo(188)
    expect(scale(per100, 200).kcal).toBeCloseTo(250.67)
  })
})

describe('AI foods', () => {
  const meta = { updatedAt: 0, dirty: 0 as const }
  const food = (id: string, name: string, source: Food['source'], deleted: 0 | 1 = 0): Food => ({
    id,
    name,
    source,
    per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    deleted,
    ...meta,
  })

  it('finds the AI food of the same name, ignoring case, accents and punctuation', () => {
    const foods = [food('gone', 'Feijão carioca', 'ai', 1), food('ai', 'Feijão, Carioca', 'ai')]
    expect(findAiFood(foods, 'feijao carioca')?.id).toBe('ai')
    expect(findAiFood(foods, 'Feijão preto')).toBeUndefined()
  })

  it('never takes over the other foods of the base, nor a deleted AI food', () => {
    const foods = [
      food('mine', 'Arroz branco', 'custom'),
      food('hc', 'Arroz branco', 'health-connect'),
      food('gone', 'Arroz branco', 'ai', 1),
    ]
    expect(findAiFood(foods, 'Arroz branco')).toBeUndefined()
  })

  describe('saveAiFood', () => {
    beforeEach(() => Promise.all([db.foods.clear(), db.foodPrefs.clear()]))

    it('gives the food the emoji of the analysis, never over one it has', async () => {
      const food = await saveAiFood({ ...rice, emoji: '🍚' })
      expect((await db.foodPrefs.get(food.id))?.emoji).toBe('🍚')
      await saveAiFood({ ...rice, emoji: '🍛' })
      expect((await db.foodPrefs.get(food.id))?.emoji).toBe('🍚')
    })

    it('creates the food once, then gives it the new values', async () => {
      const first = await saveAiFood(rice)
      expect(first).toMatchObject({ name: 'Arroz branco', source: 'ai', deleted: 0, dirty: 1 })
      expect(first.per100.carbs).toBeCloseTo(28.2)

      const again = await saveAiFood({ name: 'arroz branco', grams: 100, carbs: 30, protein: 2.5, fat: 0.3 })
      expect(again.id).toBe(first.id)
      expect(again.name).toBe('Arroz branco')
      expect(await db.foods.count()).toBe(1)
      expect((await db.foods.get(first.id))?.per100).toMatchObject({ carbs: 30, protein: 2.5, fat: 0.3 })
    })
  })
})
