import { describe, expect, it } from 'vitest'
import type { WaterLog } from '../../db/types'
import { suggestedGoalMl, sumMl, totalsByDay } from './water'

const log = (date: string, ml: number): WaterLog => ({
  id: `${date}-${ml}`,
  date,
  time: 0,
  ml,
  updatedAt: 0,
  deleted: 0,
  dirty: 0,
})

describe('water', () => {
  it('suggests 35 ml per kg, rounded to 50 ml', () => {
    expect(suggestedGoalMl(82)).toBe(2850)
    expect(suggestedGoalMl(70)).toBe(2450)
  })

  it('sums logs per day', () => {
    const logs = [log('2026-11-01', 250), log('2026-11-02', 500), log('2026-11-02', 300)]
    expect(sumMl(logs)).toBe(1050)
    expect(totalsByDay(logs)).toEqual(
      new Map([
        ['2026-11-01', 250],
        ['2026-11-02', 800],
      ]),
    )
  })
})
