import { describe, expect, it } from 'vitest'
import type { MuscleGroup } from '../../db/types'
import { BODY_BACK, BODY_FRONT } from './bodyMap'
import { MUSCLES } from './catalog'

describe('body map', () => {
  it('draws every muscle group but full body and cardio, front or back', () => {
    const drawn = new Set([...BODY_FRONT.muscles, ...BODY_BACK.muscles].map(([muscle]) => muscle))
    const tracked = (Object.keys(MUSCLES) as MuscleGroup[]).filter((muscle) => muscle !== 'full_body' && muscle !== 'cardio')
    expect([...drawn].sort()).toEqual(tracked.sort())
  })

  it('has each group once per side, so each gets one color and one title', () => {
    for (const view of [BODY_FRONT, BODY_BACK]) {
      const groups = view.muscles.map(([muscle]) => muscle)
      expect(new Set(groups).size).toBe(groups.length)
      expect(view.muscles.every(([, paths]) => paths.length > 0)).toBe(true)
      expect(view.body.length).toBeGreaterThan(0)
    }
  })

  it('puts the muscles where they are seen: chest and abs in front, glutes and hamstrings behind', () => {
    const front = BODY_FRONT.muscles.map(([muscle]) => muscle)
    const back = BODY_BACK.muscles.map(([muscle]) => muscle)
    expect(front).toEqual(expect.arrayContaining(['chest', 'abs', 'biceps', 'quads']))
    expect(front).not.toContain('glutes')
    expect(back).toEqual(expect.arrayContaining(['back', 'glutes', 'hamstrings', 'triceps']))
    expect(back).not.toContain('chest')
  })
})
