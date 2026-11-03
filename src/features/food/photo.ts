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

// Claude scales larger images down to about this size anyway; sending less is faster and cheaper.
const MAX_SIDE = 1568

export interface PreparedPhoto {
  /** Base64 JPEG, without the data: prefix. */
  data: string
  mediaType: 'image/jpeg'
  /** Data URL to show while the analysis runs. */
  preview: string
}

export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const preview = canvas.toDataURL('image/jpeg', 0.85)
  return { data: preview.slice(preview.indexOf(',') + 1), mediaType: 'image/jpeg', preview }
}

/** Sends the photo to the analyze-meal function (supabase/functions), which calls Claude. */
export async function analyzePhoto(photo: PreparedPhoto): Promise<PhotoAnalysis> {
  if (!supabase) throw new Error('Configure a sincronização para usar a foto do prato.')
  const { data, error } = await supabase.functions.invoke('analyze-meal', {
    body: { image: photo.data, mediaType: photo.mediaType },
  })
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'A análise da foto falhou.')
  }
  if (error) throw new Error('Não foi possível falar com o servidor. Confira a internet.')
  return parseAnalysis(data)
}
