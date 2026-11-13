import { alive, patch } from '../../db/repo'
import { db } from '../../db/schema'
import type { Food } from '../../db/types'
import { FunctionError } from '../../sync/functions'
import { callFunction } from './photo'
import { foodWarnings, type FoodWarning } from './sanity'

/** Foods per request to the AI review; the analyze-meal function takes up to this many. */
export const REVIEW_CHUNK = 150
/** Local meta row with the AI review's flags. They stay on this device: asking again is cheap enough. */
export const REVIEW_KEY = 'foodReview'

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * The values a check is about, in one string: whether they're per 100 g or per portion, the calories
 * and the macros. Rounded as the form shows them, so saving a food without changing it keeps it.
 */
export const fingerprint = ({ per100, unit }: Pick<Food, 'per100' | 'unit'>): string =>
  [unit === 'portion' ? 'porção' : '100g', ...[per100.kcal, per100.carbs, per100.protein, per100.fat].map(round1)].join('|')

/** What the AI review found off in a food, for the values it saw then. */
export interface AiFlag {
  /** What is off, in a short sentence. */
  problem: string
  /** What probably happened and what the values should be about, when it could tell. */
  likely?: string
  /** The fingerprint of the values it saw: once they change, the flag no longer applies. */
  print: string
}

/** The flags by food id. */
export type AiFlags = Record<string, AiFlag>

export interface ReviewState {
  flags: AiFlags
  /** When the AI review last ran. */
  at?: number
}

/** A food with something to check: what the numbers say, and what the AI review said. */
export interface ReviewItem {
  food: Food
  warnings: FoodWarning[]
  ai?: AiFlag
}

/** Whether the user said the food's current values are right ("Está certo"). */
export const isConfirmed = (food: Food): boolean => food.checked === fingerprint(food)

/**
 * The user's foods with something to check, by name: a warning from the numbers or a flag from the AI
 * review about the values they have now, unless the user said these values are right.
 */
export function foodsToReview(foods: Food[], flags: AiFlags): ReviewItem[] {
  return alive(foods)
    .flatMap((food) => {
      if (isConfirmed(food)) return []
      const warnings = foodWarnings(food.per100, { unit: food.unit })
      const flag = flags[food.id]
      const ai = flag && flag.print === fingerprint(food) ? flag : undefined
      return warnings.length > 0 || ai ? [{ food, warnings, ai }] : []
    })
    .sort((a, b) => a.food.name.localeCompare(b.food.name, 'pt-BR'))
}

/** "Está certo": the food leaves the list until one of its values changes. */
export async function confirmFood(food: Food): Promise<void> {
  await patch(db.foods, food.id, { checked: fingerprint(food) })
}

/** One food as the AI review receives it, numbered so a skipped one doesn't shift the rest. */
export interface ReviewRequestItem {
  n: number
  name: string
  per: '100 g' | '1 porção'
  kcal: number
  carbs: number
  protein: number
  fat: number
}

/** The foods in requests of at most `size`, each numbered from 1 within its request. */
export function reviewChunks(foods: Food[], size = REVIEW_CHUNK): { foods: Food[]; items: ReviewRequestItem[] }[] {
  const chunks: { foods: Food[]; items: ReviewRequestItem[] }[] = []
  for (let i = 0; i < foods.length; i += size) {
    const chunk = foods.slice(i, i + size)
    chunks.push({
      foods: chunk,
      items: chunk.map((food, j) => ({
        n: j + 1,
        name: food.brand ? `${food.name} (${food.brand})` : food.name,
        per: food.unit === 'portion' ? '1 porção' : '100 g',
        kcal: round1(food.per100.kcal),
        carbs: round1(food.per100.carbs),
        protein: round1(food.per100.protein),
        fat: round1(food.per100.fat),
      })),
    })
  }
  return chunks
}

const text = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')

/**
 * The function's answer for one request as flags by food id. A number outside the list or a flag without
 * a problem is dropped; undefined when it isn't an answer at all.
 */
export function parseFlags(answer: unknown, foods: Food[]): AiFlags | undefined {
  const list = (answer as { flags?: unknown } | null)?.flags
  if (!Array.isArray(list)) return undefined
  const flags: AiFlags = {}
  for (const entry of list) {
    const { n, problem, likely } = (entry ?? {}) as { n?: unknown; problem?: unknown; likely?: unknown }
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > foods.length || !text(problem)) continue
    const food = foods[(n as number) - 1]
    flags[food.id] = { problem: text(problem), likely: text(likely) || undefined, print: fingerprint(food) }
  }
  return flags
}

/** Said when the deployed function doesn't know the review yet (it takes the request for a photo). */
export const NOT_PUBLISHED = 'A revisão com IA ainda não está publicada.'

/** The message for a failed review: the function's own, or that it isn't published yet. */
export function reviewError(error: unknown): string {
  // Before the "review" mode, the function reads a request without text or photo as a photo missing.
  if (error instanceof FunctionError && error.status === 400 && error.message.startsWith('Envie a foto')) return NOT_PUBLISHED
  return error instanceof Error ? error.message : 'A revisão falhou.'
}

export async function readReview(): Promise<ReviewState> {
  const value = (await db.meta.get(REVIEW_KEY))?.value as ReviewState | undefined
  return value && typeof value.flags === 'object' && value.flags ? value : { flags: {} }
}

/**
 * Sends the user's foods (but the ones whose values they said are right) to the AI review and keeps
 * its flags on this device. The foods sent and not flagged lose any flag they had; the others keep
 * theirs. Returns how many foods were flagged. Throws with a message for the screen (reviewError).
 */
export async function reviewWithAi(
  call: (body: Record<string, unknown>) => Promise<unknown> = (body) => callFunction('analyze-meal', body),
): Promise<number> {
  const foods = alive(await db.foods.toArray())
    .filter((food) => !isConfirmed(food))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const found: AiFlags = {}
  try {
    for (const chunk of reviewChunks(foods)) {
      const flags = parseFlags(await call({ mode: 'review', foods: chunk.items }), chunk.foods)
      if (!flags) throw new Error('A revisão voltou sem resposta. Tente de novo.')
      Object.assign(found, flags)
    }
  } catch (error) {
    throw new Error(reviewError(error))
  }
  const sent = new Set(foods.map((food) => food.id))
  const kept = Object.fromEntries(Object.entries((await readReview()).flags).filter(([id]) => !sent.has(id)))
  await db.meta.put({ key: REVIEW_KEY, value: { flags: { ...kept, ...found }, at: Date.now() } satisfies ReviewState })
  return Object.keys(found).length
}
