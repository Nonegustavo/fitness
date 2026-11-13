import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import { dayTime } from '../../lib/dates'
import { recentForMeal } from './foods'
import { amountLabel, logItems } from './nutrition'
import { QUICK_FOOD_ID, QUICK_NAME, quickLog, quickNutrients } from './quick'

const target = { meal: 'lunch' as const, date: '2026-11-13', time: '12:30' }

describe('quickNutrients', () => {
  it('takes the calories alone, with zero macros', () => {
    expect(quickNutrients({ kcal: 450 })).toEqual({ kcal: 450, carbs: 0, protein: 0, fat: 0 })
  })

  it('works the calories out of the macros when they are left empty', () => {
    expect(quickNutrients({ carbs: 50, protein: 20, fat: 10 })).toEqual({ kcal: 370, carbs: 50, protein: 20, fat: 10 })
    expect(quickNutrients({ protein: 25 })).toEqual({ kcal: 100, carbs: 0, protein: 25, fat: 0 })
  })

  it('keeps typed calories even when the macros say otherwise', () => {
    expect(quickNutrients({ kcal: 500, carbs: 50, protein: 20, fat: 10 })?.kcal).toBe(500)
  })

  it('makes no entry from nothing, from zeros or from a negative value', () => {
    expect(quickNutrients({})).toBeUndefined()
    expect(quickNutrients({ kcal: 0, carbs: 0 })).toBeUndefined()
    expect(quickNutrients({ kcal: 300, fat: -1 })).toBeUndefined()
    expect(quickNutrients({ kcal: Number.NaN })).toBeUndefined()
  })
})

describe('quickLog', () => {
  it('is one portion holding the values, with no food behind it', () => {
    expect(quickLog({ name: '  Lanche na rua ', kcal: 450 }, target)).toEqual({
      date: '2026-11-13',
      meal: 'lunch',
      time: dayTime('2026-11-13', '12:30'),
      foodId: QUICK_FOOD_ID,
      name: 'Lanche na rua',
      grams: 1,
      unit: 'portion',
      nutrients: { kcal: 450, carbs: 0, protein: 0, fat: 0 },
    })
  })

  it('has a name when none is typed, and the time of now when none is chosen', () => {
    const now = dayTime('2026-11-13', '16:05')
    const log = quickLog({ name: ' ', carbs: 30 }, { meal: 'snack', date: '2026-11-13' }, now)
    expect(log?.name).toBe(QUICK_NAME)
    expect(log?.time).toBe(now)
  })

  it('makes no log without values', () => {
    expect(quickLog({ name: 'Nada' }, target)).toBeUndefined()
  })

  it('reads as one portion in the day', () => {
    const log = quickLog({ name: '', kcal: 450 }, target)!
    expect(amountLabel(log.grams, log.unit, log.portion)).toBe('1 porção')
  })

  it('never shows up among the recent foods', () => {
    const logs = [
      { foodId: QUICK_FOOD_ID, meal: 'lunch' as const, time: 1 },
      { foodId: QUICK_FOOD_ID, meal: 'lunch' as const, time: 2 },
      { foodId: 'rice', meal: 'lunch' as const, time: 3 },
    ]
    expect(recentForMeal(logs, 'lunch', ['rice'])).toEqual(['rice'])
  })

  it('is copied to another day as it is, without touching the prefs', async () => {
    const log = quickLog({ name: 'Lanche na rua', kcal: 450 }, target)!
    await logItems([log], 'lunch', '2026-11-14')
    const copied = alive(await db.foodLogs.where('date').equals('2026-11-14').toArray())
    expect(copied).toEqual([expect.objectContaining({ foodId: QUICK_FOOD_ID, name: 'Lanche na rua', nutrients: log.nutrients })])
    expect(await db.foodPrefs.get(QUICK_FOOD_ID)).toBeUndefined()
  })
})
