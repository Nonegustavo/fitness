import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { Food, FoodPref } from '../../db/types'
import { dayKey, type DayKey } from '../../lib/dates'
import { getSyncState, onSyncStateChange } from '../../sync/controller'
import { supabase } from '../../sync/supabase'
import { cleanEmoji } from './emoji'
import { suggestEmoji } from './foods'
import { callFunction } from './photo'

/** Names per call; the analyze-meal function takes up to 300. */
const CHUNK = 300
/** Local meta row: whose account the suggestions ran for, and the day they last failed. */
const META_KEY = 'foodEmojis'

interface PassState {
  user: string
  done?: boolean
  failedOn?: DayKey
}

/**
 * The function's answer as one emoji per name, in order ('' where it wasn't sure or the item is off), or
 * undefined when it isn't an answer at all.
 */
export function parseEmojis(value: unknown, count: number): string[] | undefined {
  const list = (value as { emojis?: unknown } | null)?.emojis
  if (!Array.isArray(list)) return undefined
  return Array.from({ length: count }, (_, i) => cleanEmoji(list[i]))
}

/** The user's own foods (TACO ones have the name's guess) never given an emoji, not even an empty one. */
export function withoutEmoji(foods: Food[], prefs: FoodPref[]): Food[] {
  const asked = new Set(alive(prefs).flatMap((pref) => (pref.emoji === undefined ? [] : [pref.id])))
  return alive(foods).filter((food) => !asked.has(food.id))
}

async function askEmojis(names: string[]): Promise<string[]> {
  const emojis = parseEmojis(await callFunction('analyze-meal', { mode: 'emoji', names }), names.length)
  if (!emojis) throw new Error('Resposta sem emojis.')
  return emojis
}

async function suggestAll(): Promise<void> {
  if (!supabase || !navigator.onLine) return
  const user = (await supabase.auth.getSession()).data.session?.user.id
  if (!user) return
  const today = dayKey()
  const state = (await db.meta.get(META_KEY))?.value as PassState | undefined
  if (state?.user === user && (state.done || state.failedOn === today)) return
  const missing = withoutEmoji(await db.foods.toArray(), await db.foodPrefs.toArray())
  try {
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK)
      const emojis = await askEmojis(chunk.map((food) => food.name))
      for (const [j, food] of chunk.entries()) await suggestEmoji(food.id, emojis[j])
    }
    await db.meta.put({ key: META_KEY, value: { user, done: true } satisfies PassState })
  } catch {
    // Offline, or the function doesn't know this request yet: one more try on another day, never a loop.
    await db.meta.put({ key: META_KEY, value: { user, failedOn: today } satisfies PassState })
  }
}

let waiting = false
let running = false

/**
 * Once per account, Claude suggests an emoji for each of the user's own foods that has none (the plate
 * analysis gives its foods one already). It waits for a first sync, so what another device already got
 * arrives before asking again; the answers go to the synced prefs.
 */
export function suggestFoodEmojis(): void {
  if (waiting || running) return
  const ready = () => {
    const { email, phase, lastSyncAt } = getSyncState()
    return !!email && phase === 'idle' && lastSyncAt !== undefined
  }
  const run = () => {
    running = true
    void suggestAll()
      .catch(() => undefined)
      .finally(() => {
        running = false
      })
  }
  if (ready()) return run()
  waiting = true
  const stop = onSyncStateChange(() => {
    if (!ready()) return
    stop()
    waiting = false
    run()
  })
}
