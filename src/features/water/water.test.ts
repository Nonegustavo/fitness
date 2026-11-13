import { describe, expect, it } from 'vitest'
import type { WaterLog } from '../../db/types'
import { loggedAt, suggestedGoalMl, sumMl, totalsByDay, waterAmountProblem } from './water'

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

  it('logs now today, and at the same time of day on a past day', () => {
    const now = new Date(2026, 10, 7, 15, 42, 10).getTime()
    expect(loggedAt('2026-11-07', now)).toBe(now)
    expect(loggedAt('2026-11-05', now)).toBe(new Date(2026, 10, 5, 15, 42).getTime())
  })

  it('says why an amount can not be logged', () => {
    expect(waterAmountProblem('')).toBeUndefined()
    expect(waterAmountProblem('250')).toBeUndefined()
    expect(waterAmountProblem('5000')).toBeUndefined()
    expect(waterAmountProblem('5001')).toBe('No máximo 5.000 ml por registro.')
    expect(waterAmountProblem('0')).toBe('Digite a quantidade em ml.')
    expect(waterAmountProblem('abc')).toBe('Digite a quantidade em ml.')
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
