import { describe, expect, it } from 'vitest'
import type { HomeCardId } from '../../db/types'
import { HOME_CARDS, homeLayout } from './homeCards'

const ids = HOME_CARDS.map((card) => card.id)

describe('homeLayout', () => {
  it('shows every card in the default order when nothing is saved', () => {
    expect(homeLayout(undefined)).toEqual(ids.map((id) => ({ id, visible: true })))
  })

  it('keeps the saved order and hidden cards and drops unknown ids', () => {
    const order = [...ids].reverse()
    const layout = homeLayout({ order: [...order, 'gone' as HomeCardId], hidden: ['sleep'] })
    expect(layout.map((card) => card.id)).toEqual(order)
    expect(layout.filter((card) => !card.visible).map((card) => card.id)).toEqual(['sleep'])
  })

  it('puts a card added after the layout was saved next to the card before it by default', () => {
    // A layout saved before the agenda card existed, with the workout moved to the top.
    const saved = ['workout', ...ids.filter((id) => id !== 'agenda' && id !== 'workout')] as HomeCardId[]
    const layout = homeLayout({ order: saved, hidden: ['insights'] }).map((card) => card.id)
    expect(layout.indexOf('agenda')).toBe(layout.indexOf('planned') + 1)
    expect(layout[0]).toBe('workout')
    expect(layout).toHaveLength(ids.length)
  })
})
