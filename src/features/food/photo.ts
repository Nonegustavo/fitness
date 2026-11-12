import { patch, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Food, Nutrients } from '../../db/types'
import { AI_TIMEOUT_MS, invokeFunction } from '../../sync/functions'
import { cleanEmoji } from './emoji'
import { normalize, suggestEmoji } from './foods'
import { kcalFromMacros } from './nutrition'

export type Confidence = 'alta' | 'media' | 'baixa'

/** One food the model saw on the plate. */
export interface PhotoItem {
  name: string
  grams: number
  confidence: Confidence
}

export interface PhotoAnalysis {
  items: PhotoItem[]
  notes: string
}

const CONFIDENCES: Confidence[] = ['alta', 'media', 'baixa']

/** Checks the function's answer field by field; anything malformed is dropped, not trusted. */
export function parseAnalysis(value: unknown): PhotoAnalysis {
  const data = value as { items?: unknown; notes?: unknown } | null
  const items = Array.isArray(data?.items) ? data.items : []
  return {
    notes: typeof data?.notes === 'string' ? data.notes.trim() : '',
    items: items.flatMap((raw): PhotoItem[] => {
      const item = (raw ?? {}) as Partial<Record<keyof PhotoItem, unknown>>
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      if (!name || typeof item.grams !== 'number' || !(item.grams > 0)) return []
      const confidence = CONFIDENCES.includes(item.confidence as Confidence) ? (item.confidence as Confidence) : 'media'
      return [{ name, grams: Math.min(Math.round(item.grams), 2000), confidence }]
    }),
  }
}

/** What the photo showed, as the list the user corrects before the macros: "Arroz branco: 150 g", one per line. */
export const itemsToText = (items: PhotoItem[]): string => items.map((item) => `${item.name}: ${item.grams} g`).join('\n')

/** The items the model wasn't sure about (confidence "media" or "baixa"), worth a second look. */
export const unsureNames = (items: PhotoItem[]): string[] =>
  items.filter((item) => item.confidence !== 'alta').map((item) => item.name)

/** One item of the list as calculated: its weight as eaten and the grams of each macro in it. */
export interface MacroItem {
  name: string
  grams: number
  carbs: number
  protein: number
  fat: number
  /** The emoji Claude picked for it, when it picked one. */
  emoji?: string
}

export interface MacroAnalysis {
  items: MacroItem[]
  notes: string
}

/** A finite amount of 0 or more, to one decimal; undefined when it's anything else. */
const amount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 10) / 10 : undefined

/** Checks the macros answer field by field; an item with a missing or malformed field is dropped. */
export function parseMacros(value: unknown): MacroAnalysis {
  const data = value as { items?: unknown; notes?: unknown } | null
  const items = Array.isArray(data?.items) ? data.items : []
  return {
    notes: typeof data?.notes === 'string' ? data.notes.trim() : '',
    items: items.flatMap((raw): MacroItem[] => {
      const item = (raw ?? {}) as Partial<Record<keyof MacroItem, unknown>>
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      const grams = amount(item.grams)
      const [carbs, protein, fat] = [item.carbs, item.protein, item.fat].map(amount)
      if (!name || !grams || carbs === undefined || protein === undefined || fat === undefined) return []
      const emoji = cleanEmoji(item.emoji)
      return [{ name, grams: Math.max(Math.round(grams), 1), carbs, protein, fat, ...(emoji ? { emoji } : {}) }]
    }),
  }
}

/** Energy from the macros (4/4/9 kcal per gram), rounded. */
export const macroKcal = (macros: Pick<MacroItem, 'carbs' | 'protein' | 'fat'>): number => Math.round(kcalFromMacros(macros))

/** The item in another amount: the macros follow the grams. */
export function withGrams(item: MacroItem, grams: number): MacroItem {
  const factor = grams / item.grams
  return { ...item, grams, carbs: item.carbs * factor, protein: item.protein * factor, fat: item.fat * factor }
}

/** The item's values per 100 g, to keep it as a food: energy (from the macros), protein, carbs and fat. */
export function per100Of(item: MacroItem): Nutrients {
  const factor = 100 / item.grams
  return {
    kcal: kcalFromMacros(item) * factor,
    protein: item.protein * factor,
    carbs: item.carbs * factor,
    fat: item.fat * factor,
  }
}

/** The food an analyzed item updates instead of creating another: an AI food, not deleted, with the same name. */
export function findAiFood(foods: Food[], name: string): Food | undefined {
  const key = normalize(name)
  return foods.find((food) => food.deleted === 0 && food.source === 'ai' && normalize(food.name) === key)
}

/**
 * Keeps an analyzed item in the user's base: the AI food with the same name gets the new values, or a new
 * one is created, with the item's emoji when it has none yet. Logs copy their values, so updating a food
 * doesn't change what was logged before.
 */
export async function saveAiFood(item: MacroItem): Promise<Food> {
  const per100 = per100Of(item)
  const known = findAiFood(await db.foods.toArray(), item.name)
  const food = known ? { ...known, per100 } : await save(db.foods, { name: item.name, per100, source: 'ai' })
  if (known) await patch(db.foods, known.id, { per100 })
  if (item.emoji) await suggestEmoji(food.id, item.emoji)
  return food
}

// Enough detail to tell the foods apart; Opus 5.5 would read up to 2576 px, at about twice the image tokens.
const MAX_SIDE = 1568
/** The most the model reads: the small print of a nutrition label needs it. */
export const LABEL_SIDE = 2576

export interface PreparedPhoto {
  /** Base64 JPEG, without the data: prefix. */
  data: string
  mediaType: 'image/jpeg'
  /** Data URL to show while the analysis runs. */
  preview: string
}

export async function preparePhoto(file: Blob, maxSide = MAX_SIDE): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const preview = canvas.toDataURL('image/jpeg', 0.85)
  return { data: preview.slice(preview.indexOf(',') + 1), mediaType: 'image/jpeg', preview }
}

/** A meal to analyze: a plate photo, or the user's own list of what they ate. */
export type MealSource = { kind: 'photo'; file: Blob } | { kind: 'text'; text: string }

/** Calls one of the project's functions (supabase/functions); the error message comes from the function. */
export const callFunction = (name: string, body: Record<string, unknown>): Promise<unknown> =>
  invokeFunction(name, body, {
    unconfigured: 'Configure a sincronização para usar a análise.',
    fallback: 'A análise falhou.',
    timeoutMs: AI_TIMEOUT_MS,
  })

/** Step 1 of a photo: the foods on the plate and their weight (analyze-meal function, which asks Claude). */
export const analyzePhoto = async (photo: PreparedPhoto): Promise<PhotoAnalysis> =>
  parseAnalysis(await callFunction('analyze-meal', { image: photo.data, mediaType: photo.mediaType }))

/** Step 2: the grams and macros of each item of a list ("Arroz branco: 150 g", one per line). */
export const analyzeMacros = async (text: string): Promise<MacroAnalysis> =>
  parseMacros(await callFunction('analyze-meal', { text, mode: 'macros' }))
