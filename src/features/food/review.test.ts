import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { patch, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Food } from '../../db/types'
import { FunctionError } from '../../sync/functions'
import {
  confirmFood,
  fingerprint,
  foodsToReview,
  NOT_PUBLISHED,
  parseFlags,
  readReview,
  reviewChunks,
  reviewError,
  reviewWithAi,
} from './review'

const meta = { updatedAt: 0, deleted: 0 as const, dirty: 0 as const }

const food = (id: string, name: string, per100: Food['per100'], extra: Partial<Food> = {}): Food => ({
  ...meta,
  id,
  name,
  per100,
  source: 'custom',
  ...extra,
})

const bread = food('bread', 'Pão de forma integral', { kcal: 122, carbs: 22, protein: 5, fat: 1.5 })
const wrongKcal = food('bar', 'Barra de proteína', { kcal: 400, carbs: 10, protein: 10, fat: 5 })
const rice = food('rice', 'Arroz', { kcal: 128, carbs: 28.1, protein: 2.5, fat: 0.2 })

describe('fingerprint', () => {
  it('follows the values and what they are per', () => {
    expect(fingerprint(bread)).toBe(fingerprint(food('other', 'Outro nome', { ...bread.per100, fiber: 6 })))
    expect(fingerprint(bread)).not.toBe(fingerprint({ ...bread, per100: { ...bread.per100, kcal: 244 } }))
    expect(fingerprint(bread)).not.toBe(fingerprint({ ...bread, unit: 'portion' }))
    // A value turned into per 100 g and back comes out a hair off: still the same values.
    expect(fingerprint(bread)).toBe(fingerprint({ ...bread, per100: { ...bread.per100, carbs: 22.000000000001 } }))
  })
})

describe('foodsToReview', () => {
  it('lists the foods with a warning or a flag on their current values, by name', () => {
    const flags = { bread: { problem: 'Parece uma fatia.', print: fingerprint(bread) } }
    const items = foodsToReview([rice, wrongKcal, bread], flags)
    expect(items.map((item) => item.food.id)).toEqual(['bar', 'bread'])
    expect(items[0].warnings.map((warning) => warning.code)).toEqual(['kcal'])
    expect(items[1]).toEqual({ food: bread, warnings: [], ai: flags.bread })
  })

  it('drops a flag once the food is corrected, and deleted foods', () => {
    const flags = { bread: { problem: 'Parece uma fatia.', print: fingerprint(bread) } }
    const fixed = { ...bread, per100: { kcal: 244, carbs: 44, protein: 10, fat: 3 } }
    expect(foodsToReview([fixed, { ...wrongKcal, deleted: 1 }], flags)).toEqual([])
  })

  it('leaves out what the user said is right, until the values change', () => {
    const confirmed = { ...wrongKcal, checked: fingerprint(wrongKcal) }
    expect(foodsToReview([confirmed], {})).toEqual([])
    const changed = { ...confirmed, per100: { ...confirmed.per100, kcal: 500 } }
    expect(foodsToReview([changed], {})).toHaveLength(1)
  })
})

describe('"Está certo"', () => {
  beforeEach(async () => {
    await db.foods.clear()
    await db.meta.clear()
  })

  it('keeps the food off the list until its values change', async () => {
    const saved = await save(db.foods, { ...wrongKcal })
    await confirmFood(saved)
    expect(foodsToReview(await db.foods.toArray(), {})).toEqual([])
    await patch(db.foods, saved.id, { per100: { ...saved.per100, kcal: 450 } })
    expect(foodsToReview(await db.foods.toArray(), {}).map((item) => item.food.id)).toEqual([saved.id])
  })
})

describe('reviewChunks', () => {
  it('numbers each request from 1, at most 150 foods each', () => {
    const many = Array.from({ length: 320 }, (_, i) => food(`f${i}`, `Alimento ${i}`, rice.per100))
    const chunks = reviewChunks(many)
    expect(chunks.map((chunk) => chunk.items.length)).toEqual([150, 150, 20])
    expect(chunks[1].items[0]).toMatchObject({ n: 1, name: 'Alimento 150' })
    expect(chunks[2].foods[19].id).toBe('f319')
  })

  it('says what the values are per, with the brand and rounded', () => {
    const shake = food('shake', 'Whey', { kcal: 120.04, carbs: 3.06, protein: 24, fat: 1.55 }, { unit: 'portion', brand: 'Marca' })
    expect(reviewChunks([shake, rice])[0].items).toEqual([
      { n: 1, name: 'Whey (Marca)', per: '1 porção', kcal: 120, carbs: 3.1, protein: 24, fat: 1.6 },
      { n: 2, name: 'Arroz', per: '100 g', kcal: 128, carbs: 28.1, protein: 2.5, fat: 0.2 },
    ])
  })
})

describe('parseFlags', () => {
  it('reads the flags by number and drops the ones out of range or without a problem', () => {
    const flags = parseFlags(
      {
        flags: [
          { n: 2, problem: ' Parece  uma fatia. ', likely: 'Uns 245 kcal em 100 g.' },
          { n: 0, problem: 'fora' },
          { n: 3, problem: 'fora' },
          { n: 1.5, problem: 'fora' },
          { n: 1, problem: '' },
          null,
        ],
      },
      [rice, bread],
    )
    expect(flags).toEqual({ bread: { problem: 'Parece uma fatia.', likely: 'Uns 245 kcal em 100 g.', print: fingerprint(bread) } })
  })

  it('takes an empty likely as none, and anything else as no answer', () => {
    expect(parseFlags({ flags: [{ n: 1, problem: 'X', likely: '' }] }, [rice])?.rice.likely).toBeUndefined()
    expect(parseFlags({ flags: [] }, [rice])).toEqual({})
    expect(parseFlags({ emojis: [] }, [rice])).toBeUndefined()
    expect(parseFlags(null, [rice])).toBeUndefined()
  })
})

describe('reviewWithAi', () => {
  beforeEach(async () => {
    await db.foods.clear()
    await db.meta.clear()
  })

  it('sends the foods not confirmed and keeps the flags on this device', async () => {
    await save(db.foods, { ...rice })
    await save(db.foods, { ...bread })
    await save(db.foods, { ...wrongKcal, checked: fingerprint(wrongKcal) })
    const bodies: Record<string, unknown>[] = []
    const count = await reviewWithAi(async (body) => {
      bodies.push(body)
      return { flags: [{ n: 2, problem: 'Parece uma fatia.' }] }
    })
    expect(count).toBe(1)
    expect(bodies).toHaveLength(1)
    expect(bodies[0].mode).toBe('review')
    expect((bodies[0].foods as { name: string }[]).map((item) => item.name)).toEqual(['Arroz', 'Pão de forma integral'])
    expect((await readReview()).flags).toEqual({ bread: { problem: 'Parece uma fatia.', print: fingerprint(bread) } })
  })

  it('clears the old flag of a food that now looks right, and keeps nothing when it fails', async () => {
    await save(db.foods, { ...bread })
    await db.meta.put({ key: 'foodReview', value: { flags: { bread: { problem: 'Antes', print: fingerprint(bread) } } } })
    await reviewWithAi(async () => ({ flags: [] }))
    expect((await readReview()).flags).toEqual({})

    await expect(reviewWithAi(async () => ({ nothing: true }))).rejects.toThrow('sem resposta')
  })

  it('says when the deployed function does not know the review yet', async () => {
    await save(db.foods, { ...bread })
    const old = new FunctionError('Envie a foto em base64 (JPEG, PNG ou WebP) ou a descrição da refeição.', 400)
    await expect(
      reviewWithAi(async () => {
        throw old
      }),
    ).rejects.toThrow(NOT_PUBLISHED)
    expect(reviewError(new FunctionError('Muitas análises seguidas. Tente em instantes.', 429))).toBe(
      'Muitas análises seguidas. Tente em instantes.',
    )
  })
})
