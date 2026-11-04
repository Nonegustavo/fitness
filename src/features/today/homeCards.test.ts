import { describe, expect, it } from 'vitest'
import type { HomeCardId } from '../../db/types'
import { DEFAULT_AREAS, HOME_ELEMENTS, homeAreas, toggleElement } from './homeCards'

describe('homeAreas', () => {
  it('uses the default areas when nothing is saved', () => {
    expect(homeAreas({})).toEqual(DEFAULT_AREAS)
  })

  it('leaves out of the default what the older layout had hidden', () => {
    const areas = homeAreas({ home: { order: [], hidden: ['sleep', 'water', 'insights'] } })
    expect(areas.focus).not.toContain('sleep')
    expect(areas.quick).not.toContain('water')
    expect(areas.focus).toContain('agenda')
  })

  it('keeps the saved areas, without unknown ids or repeats', () => {
    const areas = homeAreas({
      homeAreas: { focus: ['records', 'gone' as HomeCardId, 'sleep', 'records'], quick: ['sleep', 'water'] },
      home: { order: [], hidden: ['sleep'] },
    })
    expect(areas).toEqual({ focus: ['records', 'sleep'], quick: ['sleep', 'water'] })
  })

  it('adds an element at the end of an area or takes it out', () => {
    const areas = { focus: ['agenda', 'sleep'], quick: ['water'] } as const
    expect(toggleElement({ ...areas, focus: [...areas.focus], quick: [...areas.quick] }, 'focus', 'records', true).focus).toEqual([
      'agenda',
      'sleep',
      'records',
    ])
    expect(toggleElement({ focus: ['agenda', 'sleep'], quick: ['water'] }, 'quick', 'water', false).quick).toEqual([])
  })

  it('offers every default element', () => {
    const offered = new Set(HOME_ELEMENTS.map((element) => element.id))
    expect([...DEFAULT_AREAS.focus, ...DEFAULT_AREAS.quick].every((id) => offered.has(id))).toBe(true)
  })
})
