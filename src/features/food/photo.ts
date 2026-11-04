import { FunctionsHttpError } from '@supabase/supabase-js'
import type { FoodPref } from '../../db/types'
import { supabase } from '../../sync/supabase'
import { searchFoods, type FoodItem, type SearchEntry } from './foods'

export type Confidence = 'alta' | 'media' | 'baixa'

/** One food the model saw on the plate. */
export interface PhotoItem {
  name: string
  /** Words to look the food up in the table ("arroz tipo 1 cozido"). */
  search: string
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
    notes: typeof data?.notes === 'string' ? data.notes : '',
    items: items.flatMap((raw): PhotoItem[] => {
      const item = raw as Partial<Record<keyof PhotoItem, unknown>>
      if (typeof item.name !== 'string' || typeof item.grams !== 'number' || !(item.grams > 0)) return []
      const search = typeof item.search === 'string' && item.search.trim() ? item.search : item.name
      const confidence = CONFIDENCES.includes(item.confidence as Confidence) ? (item.confidence as Confidence) : 'media'
      return [{ name: item.name, search, grams: Math.min(Math.round(item.grams), 2000), confidence }]
    }),
  }
}

export interface ReviewItem extends PhotoItem {
  key: string
  /** Best matches from TACO and the user's foods, best first. */
  candidates: FoodItem[]
  foodId?: string
}

/** Pairs each detected item with the closest foods in the search index. */
export function matchItems(analysis: PhotoAnalysis, index: SearchEntry[], prefs: Map<string, FoodPref>): ReviewItem[] {
  return analysis.items.map((item, i) => {
    const queries = [item.search, item.name, item.search.split(' ')[0]]
    let candidates: FoodItem[] = []
    for (const query of queries) {
      candidates = searchFoods(index, query, prefs, 6)
      if (candidates.length > 0) break
    }
    return { ...item, key: String(i), candidates, foodId: candidates[0]?.id }
  })
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

/** A meal to analyze: a plate photo, or the user's own description of what they ate. */
export type MealSource = { kind: 'photo'; file: Blob } | { kind: 'text'; text: string }

/** Calls one of the project's functions (supabase/functions); the error message comes from the function. */
export async function callFunction(name: string, body: Record<string, string>): Promise<unknown> {
  if (!supabase) throw new Error('Configure a sincronização para usar a análise.')
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error instanceof FunctionsHttpError) {
    const answer = (await error.context.json().catch(() => null)) as { error?: string } | null
    throw new Error(answer?.error ?? 'A análise falhou.')
  }
  if (error) throw new Error('Não foi possível falar com o servidor. Confira a internet.')
  return data
}

/** Calls the analyze-meal function, which asks Claude. */
const requestAnalysis = async (body: Record<string, string>): Promise<PhotoAnalysis> =>
  parseAnalysis(await callFunction('analyze-meal', body))

export const analyzePhoto = (photo: PreparedPhoto): Promise<PhotoAnalysis> =>
  requestAnalysis({ image: photo.data, mediaType: photo.mediaType })

/** The same analysis from words: "2 ovos mexidos e 1 pão francês com manteiga". */
export const analyzeText = (text: string): Promise<PhotoAnalysis> => requestAnalysis({ text })
