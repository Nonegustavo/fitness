import { describe, expect, it } from 'vitest'
import type { HomeCardId } from '../../db/types'
import { HOME_CARDS, homeLayout } from './homeCards'

const ids = HOME_CARDS.map((card) => card.id)

describe('homeLayout', () => {
  it('shows every card in the default order when nothing is saved', () => {
    expect(homeLayout(undefined)).toEqual(ids.map((id) => ({ id, visible: true })))
  })

  it('keeps the saved order and hidden cards, drops unknown ids and appends cards added later', () => {
    const layout = homeLayout({ order: ['water', 'sleep', 'gone' as HomeCardId], hidden: ['sleep'] })
    expect(layout.slice(0, 2)).toEqual([
      { id: 'water', visible: true },
      { id: 'sleep', visible: false },
    ])
    expect(layout.map((card) => card.id)).toEqual(['water', 'sleep', ...ids.filter((id) => id !== 'water' && id !== 'sleep')])
  })
})
