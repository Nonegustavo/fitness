import type { Nutrients, Portion } from '../../db/types'

export interface ScannedProduct {
  name: string
  brand?: string
  per100: Nutrients
  portion?: Portion
  /** The product's front picture, small (about 200 px), shown before its name. */
  imageUrl?: string
}

const FIELDS =
  'product_name,product_name_pt,brands,nutriments,serving_quantity,serving_size,image_front_small_url,image_front_url,image_url'

const toNumber = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/** An https address, or nothing: the picture is loaded by the app as is. */
const httpsUrl = (value: unknown): string | undefined =>
  typeof value === 'string' && value.startsWith('https://') ? value : undefined

const sodiumMg = (grams?: number) => (grams === undefined ? undefined : grams * 1000)

/** Turns an Open Food Facts product into what the food form needs; null without usable nutrition. */
export function parseProduct(product: Record<string, unknown>): ScannedProduct | null {
  const n = (product.nutriments ?? {}) as Record<string, unknown>
  const kj = toNumber(n['energy-kj_100g']) ?? toNumber(n['energy_100g'])
  const kcal = toNumber(n['energy-kcal_100g']) ?? (kj === undefined ? undefined : kj / 4.184)
  const protein = toNumber(n['proteins_100g'])
  const carbs = toNumber(n['carbohydrates_100g'])
  const fat = toNumber(n['fat_100g'])
  if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) return null

  const name = String(product.product_name_pt || product.product_name || '').trim()
  const brand = String(product.brands ?? '').split(',')[0].trim()
  const servingGrams = toNumber(product.serving_quantity)
  const servingLabel = String(product.serving_size ?? '').trim()
  return {
    name: name || 'Produto sem nome',
    brand: brand || undefined,
    per100: {
      kcal,
      protein,
      carbs,
      fat,
      fiber: toNumber(n['fiber_100g']),
      sugar: toNumber(n['sugars_100g']),
      saturatedFat: toNumber(n['saturated-fat_100g']),
      // Open Food Facts gives sodium in grams.
      sodium: sodiumMg(toNumber(n['sodium_100g'])),
    },
    portion: servingGrams ? { label: servingLabel ? `1 porção (${servingLabel})` : '1 porção', grams: servingGrams } : undefined,
    imageUrl: httpsUrl(product.image_front_small_url) ?? httpsUrl(product.image_front_url) ?? httpsUrl(product.image_url),
  }
}

/** Looks a barcode up in Open Food Facts. Null when the product isn't there or has no nutrition table. */
export async function fetchProduct(barcode: string, signal?: AbortSignal): Promise<ScannedProduct | null> {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
    { signal },
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Open Food Facts respondeu ${response.status}.`)
  const data = (await response.json()) as { status?: number; product?: Record<string, unknown> }
  return data.status === 1 && data.product ? parseProduct(data.product) : null
}
