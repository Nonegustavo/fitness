import { describe, expect, it } from 'vitest'
import type { Food, FoodPref } from '../../db/types'
import { parseEmojis, withoutEmoji } from './aiEmojis'

const meta = { updatedAt: 0, dirty: 0 as const }

describe('parseEmojis', () => {
  it('gives one emoji per name asked, in order, empty where the answer is off', () => {
    expect(parseEmojis({ emojis: ['🍚', '', 'arroz', null, '🫘🍲', 7] }, 6)).toEqual(['🍚', '', '', '', '🫘', ''])
  })

  it('fills a short answer with empty ones and ignores the extra ones', () => {
    expect(parseEmojis({ emojis: ['🍚'] }, 3)).toEqual(['🍚', '', ''])
    expect(parseEmojis({ emojis: ['🍚', '🫘', '🍗'] }, 2)).toEqual(['🍚', '🫘'])
  })

  it('is no answer at all without the list', () => {
    expect(parseEmojis({ error: 'Envie a foto em base64…' }, 2)).toBeUndefined()
    expect(parseEmojis({ emojis: 'x' }, 2)).toBeUndefined()
    expect(parseEmojis(null, 2)).toBeUndefined()
    expect(parseEmojis('lixo', 2)).toBeUndefined()
  })
})

describe('withoutEmoji', () => {
  const food = (id: string, deleted: 0 | 1 = 0): Food => ({
    id,
    name: id,
    per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    source: 'health-connect',
    deleted,
    ...meta,
  })
  const pref = (id: string, emoji?: string, deleted: 0 | 1 = 0): FoodPref => ({ id, favorite: 0, emoji, deleted, ...meta })

  it('asks only for the foods never given an emoji, an empty one counting as asked', () => {
    const foods = [food('new'), food('rice'), food('asked'), food('gone', 1), food('stale')]
    const prefs = [pref('rice', '🍚'), pref('asked', ''), pref('stale', '🥩', 1), pref('new')]
    expect(withoutEmoji(foods, prefs).map((f) => f.id)).toEqual(['new', 'stale'])
  })
})
