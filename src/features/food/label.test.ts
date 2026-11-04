import { describe, expect, it } from 'vitest'
import { fillFromLabel, parseLabel } from './label'

const breadLabel = {
  name: 'Pão de forma 38,2% integral',
  brand: 'Pullman',
  portionLabel: '2 fatias',
  portionGrams: 50,
  per100: { kcal: 237, carbs: 41, protein: 10, fat: 3.7, fiber: 7.3, sugar: 4.1, saturatedFat: 1.4, sodium: 443 },
  perPortion: { kcal: 120, carbs: 21, protein: 5, fat: 1.8, fiber: 3.7, sugar: 2, saturatedFat: 0.7, sodium: 222 },
  notes: '',
}

describe('parseLabel', () => {
  it('keeps the columns that have energy and the three macros', () => {
    const reading = parseLabel(breadLabel)
    expect(reading.portion).toEqual({ label: '2 fatias', grams: 50 })
    expect(reading.perPortion?.kcal).toBe(120)
    expect(reading.per100?.sodium).toBe(443)
  })

  it('drops a column missing a macro, and anything malformed', () => {
    const reading = parseLabel({ ...breadLabel, perPortion: { kcal: 120, carbs: null, protein: 5, fat: 1.8 }, portionGrams: -1 })
    expect(reading.perPortion).toBeUndefined()
    expect(reading.portion).toEqual({ label: '2 fatias', grams: undefined })
    expect(parseLabel('lixo')).toMatchObject({ name: '', perPortion: undefined, per100: undefined })
  })
})

describe('fillFromLabel', () => {
  it('fills per portion, as the package reads', () => {
    const fill = fillFromLabel(parseLabel(breadLabel))!
    expect(fill.basis).toBe('portion')
    expect(fill.values.kcal).toBe(120)
    expect(fill.notes).toEqual([])
  })

  it('warns when the two columns disagree, or the portion weight is missing', () => {
    const misread = fillFromLabel(parseLabel({ ...breadLabel, perPortion: { ...breadLabel.perPortion, kcal: 210 } }))!
    expect(misread.notes[0]).toMatch(/não batem/)
    const noGrams = fillFromLabel(parseLabel({ ...breadLabel, portionGrams: null, per100: null }))!
    expect(noGrams.notes[0]).toMatch(/peso da porção/)
  })

  it('falls back to per 100 g, and gives up without a table', () => {
    expect(fillFromLabel(parseLabel({ ...breadLabel, perPortion: null }))?.basis).toBe('100g')
    expect(fillFromLabel(parseLabel({ ...breadLabel, perPortion: null, per100: null, notes: 'Sem tabela.' }))).toBeUndefined()
  })
})
