import { describe, expect, it } from 'vitest'
import type { HomeCardId } from '../../db/types'
import { HOME_CARDS, homeLayout, layoutToSave } from './homeCards'

const ids = HOME_CARDS.map((card) => card.id)

describe('homeLayout', () => {
  it('shows every card in the default order when nothing is saved', () => {
    expect(homeLayout(undefined).map(({ id, visible }) => ({ id, visible }))).toEqual(ids.map((id) => ({ id, visible: true })))
  })

  it('keeps a saved order and the hidden cards, and drops unknown ids', () => {
    const order = [...ids].reverse()
    const layout = homeLayout({ order: [...order, 'gone' as HomeCardId], hidden: ['sleep'] })
    expect(layout.map((card) => card.id)).toEqual(order)
    expect(layout.filter((card) => !card.visible).map((card) => card.id)).toEqual(['sleep'])
    expect(layout.find((card) => card.id === 'sleep')?.zone).toBe('focus')
  })

  it('puts a card added after the layout was saved next to the card before it by default', () => {
    const saved = ['workout', ...ids.filter((id) => id !== 'burn' && id !== 'workout')] as HomeCardId[]
    const layout = homeLayout({ order: saved, hidden: [] }).map((card) => card.id)
    expect(layout.indexOf('burn')).toBe(layout.indexOf('steps') + 1)
    expect(layout[0]).toBe('workout')
    expect(layout).toHaveLength(ids.length)
  })

  it('moves a layout saved in an old default order to the new one, keeping what was hidden', () => {
    const old: HomeCardId[] = ['insights', 'week', 'sleep', 'planned', 'workout', 'food', 'body', 'water', 'habits', 'journal']
    const layout = homeLayout({ order: old, hidden: ['insights', 'week'] })
    expect(layout.map((card) => card.id)).toEqual(ids)
    expect(layout.filter((card) => !card.visible).map((card) => card.id)).toEqual(['insights', 'week'])
  })

  it('saves the order and the hidden cards back', () => {
    const layout = homeLayout({ order: [], hidden: ['steps'] })
    expect(layoutToSave(layout)).toEqual({ order: ids, hidden: ['steps'] })
  })
})
