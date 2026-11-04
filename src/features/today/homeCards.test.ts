import { describe, expect, it } from 'vitest'
import type { HomeCardId } from '../../db/types'
import { DEFAULT_AREAS, HOME_ELEMENTS, homeAreas, toggleElement } from './homeCards'

describe('homeAreas', () => {
  it('uses the default areas, with the week on top, when nothing is saved', () => {
    expect(homeAreas({})).toEqual({ ...DEFAULT_AREAS, week: true })
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
    expect(areas).toEqual({ focus: ['records', 'sleep'], quick: ['sleep', 'water'], week: true })
    expect(homeAreas({ homeAreas: { focus: [], quick: [], week: false } }).week).toBe(false)
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
