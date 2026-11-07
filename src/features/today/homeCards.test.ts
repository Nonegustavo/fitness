import { describe, expect, it } from 'vitest'
import type { HomeCardId } from '../../db/types'
import { DEFAULT_AREAS, HOME_ELEMENTS, homeAreas, orderForTime, toggleElement } from './homeCards'

describe('homeAreas', () => {
  it('uses the default areas, with the week on top, when nothing is saved', () => {
    expect(homeAreas({})).toEqual({ ...DEFAULT_AREAS, week: true, smartOrder: true, now: true, seen: ['readiness', 'weather'] })
  })

  it('leaves out of the default what the older layout had hidden', () => {
    const areas = homeAreas({ home: { order: [], hidden: ['sleep', 'water', 'insights'] } })
    expect(areas.focus).not.toContain('sleep')
    expect(areas.quick).not.toContain('water')
    expect(areas.focus).toContain('workout')
  })

  it('keeps the saved areas, without unknown ids, repeats or the week (it sits on top now)', () => {
    const areas = homeAreas({
      homeAreas: { focus: ['agenda', 'records', 'gone' as HomeCardId, 'sleep', 'records'], quick: ['sleep', 'water'] },
      home: { order: [], hidden: ['sleep'] },
    })
    expect(areas).toEqual({
      focus: ['records', 'sleep', 'readiness', 'weather'],
      quick: ['sleep', 'water', 'weather'],
      week: true,
      smartOrder: true,
      now: true,
      seen: ['readiness', 'weather'],
    })
    expect(homeAreas({ homeAreas: { focus: [], quick: [], week: false } }).week).toBe(false)
    expect(homeAreas({ homeAreas: { focus: [], quick: [], smartOrder: false } }).smartOrder).toBe(false)
    expect(homeAreas({ homeAreas: { focus: [], quick: [], now: false } }).now).toBe(false)
  })

  it('puts a newer element into the saved areas once, after its neighbour, and leaves it out once taken out', () => {
    const saved = homeAreas({ homeAreas: { focus: ['workout', 'sleep', 'food'], quick: ['water'] } })
    expect(saved.focus).toEqual(['workout', 'weather', 'sleep', 'readiness', 'food'])
    expect(homeAreas({ homeAreas: { focus: ['food'], quick: [] } }).focus).toEqual(['food', 'readiness', 'weather'])
    // Taking it out saves the areas with what was seen: it doesn't come back.
    const removed = toggleElement(saved, 'focus', 'readiness', false)
    expect(homeAreas({ homeAreas: removed }).focus).toEqual(['workout', 'weather', 'sleep', 'food'])
  })

  it('puts the weather into both areas once, and leaves each out once taken out of it', () => {
    // Readiness was seen (and taken out) before: only the weather comes in.
    const saved = homeAreas({ homeAreas: { focus: ['workout', 'food'], quick: ['body', 'water', 'steps'], seen: ['readiness'] } })
    expect(saved.focus).toEqual(['workout', 'weather', 'food'])
    expect(saved.quick).toEqual(['body', 'water', 'weather', 'steps'])
    expect(saved.seen).toEqual(['readiness', 'weather'])
    // Out of "Visualização rápida" only: it stays in "Em foco" and doesn't come back to the other.
    const smallOut = homeAreas({ homeAreas: toggleElement(saved, 'quick', 'weather', false) })
    expect(smallOut.quick).toEqual(['body', 'water', 'steps'])
    expect(smallOut.focus).toContain('weather')
  })

  it('adds an element at the end of an area or takes it out', () => {
    expect(toggleElement({ focus: ['workout', 'sleep'], quick: ['water'] }, 'focus', 'records', true).focus).toEqual([
      'workout',
      'sleep',
      'records',
    ])
    expect(toggleElement({ focus: ['workout', 'sleep'], quick: ['water'] }, 'quick', 'water', false).quick).toEqual([])
  })

  it('offers every default element', () => {
    const offered = new Set(HOME_ELEMENTS.map((element) => element.id))
    expect([...DEFAULT_AREAS.focus, ...DEFAULT_AREAS.quick].every((id) => offered.has(id))).toBe(true)
    expect(offered.has('agenda')).toBe(false)
  })
})

describe('orderForTime', () => {
  const mine: HomeCardId[] = ['records', 'workout', 'habits', 'sleep', 'food', 'pace']

  it('puts first what matters at each part of the day, the rest in the order given', () => {
    expect(orderForTime(mine, 7)).toEqual(['sleep', 'workout', 'records', 'habits', 'food', 'pace'])
    expect(orderForTime(mine, 12)).toEqual(['food', 'workout', 'records', 'habits', 'sleep', 'pace'])
    expect(orderForTime(mine, 17)).toEqual(['workout', 'food', 'records', 'habits', 'sleep', 'pace'])
    expect(orderForTime(mine, 21)).toEqual(['habits', 'food', 'records', 'workout', 'sleep', 'pace'])
  })

  it('treats the small hours as the night before', () => {
    expect(orderForTime(mine, 1)).toEqual(orderForTime(mine, 22))
  })

  it('keeps every element once, and the order as given when none matters now', () => {
    for (let hour = 0; hour < 24; hour++) expect([...orderForTime(mine, hour)].sort()).toEqual([...mine].sort())
    expect(orderForTime(['records', 'pace'], 7)).toEqual(['records', 'pace'])
  })
})
