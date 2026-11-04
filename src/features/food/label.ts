import type { Nutrients } from '../../db/types'
import { callFunction, LABEL_SIDE, preparePhoto } from './photo'

const KEYS = ['kcal', 'carbs', 'protein', 'fat', 'fiber', 'sugar', 'saturatedFat', 'sodium'] as const
const REQUIRED = ['kcal', 'carbs', 'protein', 'fat'] as const

/** What the read-label function saw on the package. */
export interface LabelReading {
  name: string
  brand: string
  portion?: { label: string; grams?: number }
  perPortion?: Nutrients
  per100?: Nutrients
  notes: string
}

const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

/** A column of the table, when it has at least the energy and the three macros. */
function column(value: unknown): Nutrients | undefined {
  const raw = value as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') return undefined
  const values = Object.fromEntries(KEYS.map((key) => [key, number(raw[key])])) as Partial<Nutrients>
  if (REQUIRED.some((key) => values[key] === undefined)) return undefined
  return values as Nutrients
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Checks the function's answer field by field; anything malformed is dropped, not trusted. */
export function parseLabel(value: unknown): LabelReading {
  const data = (value ?? {}) as Record<string, unknown>
  const label = text(data.portionLabel)
  const grams = number(data.portionGrams)
  return {
    name: text(data.name),
    brand: text(data.brand),
    portion: label || grams ? { label: label || '1 porção', grams: grams && grams > 0 ? grams : undefined } : undefined,
    perPortion: column(data.perPortion),
    per100: column(data.per100),
    notes: text(data.notes),
  }
}

/** What fills the food form: the values of one column, and which column they are. */
export interface LabelFill {
  name: string
  brand: string
  basis: 'portion' | '100g'
  values: Nutrients
  portion?: { label: string; grams?: number }
  notes: string[]
}

/**
 * The column to fill the form with: per portion when the label has it (that's how the package reads),
 * else per 100 g. When both are there, their calories are compared to catch a misread.
 */
export function fillFromLabel(reading: LabelReading): LabelFill | undefined {
  const notes = reading.notes ? [reading.notes] : []
  const { perPortion, per100, portion } = reading
  if (perPortion && per100 && portion?.grams) {
    const expected = (per100.kcal * portion.grams) / 100
    if (expected > 0 && Math.abs(perPortion.kcal - expected) / expected > 0.15) {
      notes.push('As colunas por porção e por 100 g não batem: confira os valores.')
    }
  }
  if (perPortion) {
    if (!portion?.grams) notes.push('Não deu para ler o peso da porção: preencha os gramas.')
    return { name: reading.name, brand: reading.brand, basis: 'portion', values: perPortion, portion, notes }
  }
  if (per100) return { name: reading.name, brand: reading.brand, basis: '100g', values: per100, portion, notes }
  return undefined
}

/** Photographs → the label read by Claude (read-label function), at the full resolution it reads. */
export async function readLabel(file: Blob): Promise<LabelReading> {
  const photo = await preparePhoto(file, LABEL_SIDE)
  return parseLabel(await callFunction('read-label', { image: photo.data, mediaType: photo.mediaType }))
}

