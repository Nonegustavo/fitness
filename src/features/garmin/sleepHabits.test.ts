import { describe, expect, it } from 'vitest'
import type { DailyHealth } from '../../db/types'
import { dayTime, shiftDay } from '../../lib/dates'
import { balanceSentence, regularity, regularitySentence, regularityWords, signedDuration, sleepBalance, sleepGoalMin, spreadText } from './sleepHabits'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const

/** A night ending on `id`, from `bed` (the evening before, or that day when past midnight) to `wake`. */
function night(id: string, bed: string, wake: string, hours = 7, extra: Partial<NonNullable<DailyHealth['sleep']>> = {}): DailyHealth {
  const bedDay = bed < '12:00' ? id : shiftDay(id, -1)
  return { id, sleep: { totalSec: hours * 3600, start: dayTime(bedDay, bed), end: dayTime(id, wake), ...extra }, ...meta }
}

describe('regularity', () => {
  it('needs 5 nights with times among the last 14', () => {
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].map((id) => night(id, '23:00', '07:00'))
    expect(regularity(days, '2026-11-04')).toBeUndefined()
    // One more, but outside the 14 days, still isn't enough.
    expect(regularity([night('2026-10-20', '23:00', '07:00'), ...days], '2026-11-04')).toBeUndefined()
    expect(regularity([...days, night('2026-11-05', '23:00', '07:00')], '2026-11-05')).toMatchObject({ nights: 5, bedtime: 23, wake: 7 })
  })

  it('averages bedtimes across midnight and measures the spread in minutes', () => {
    const days = [
      night('2026-11-01', '23:30', '07:00'),
      night('2026-11-02', '00:30', '07:00'),
      night('2026-11-03', '23:30', '07:00'),
      night('2026-11-04', '00:30', '07:00'),
      night('2026-11-05', '00:00', '07:00'),
    ]
    const result = regularity(days, '2026-11-05')!
    // 23:30 and 00:30 average to midnight, not to noon.
    expect(result.bedtime).toBeCloseTo(24)
    expect(result.wakeSdMin).toBe(0)
    // Deviations of ±30 min four times and 0 once: sqrt(4 × 0.25 / 4) h = 30 min.
    expect(result.bedtimeSdMin).toBeCloseTo(30)
    expect(regularityWords(result)).toBe('bem regular')
    expect(regularityWords({ ...result, wakeSdMin: 75 })).toBe('varia bastante')
    expect(regularityWords({ ...result, bedtimeSdMin: 45 })).toBe('varia um pouco')
    expect(regularitySentence(result)).toBe('Nas últimas 2 semanas (5 noites), a hora de dormir e a de acordar são bem regulares.')
    expect(regularitySentence({ ...result, wakeSdMin: 75 })).toBe('Nas últimas 2 semanas (5 noites), a hora de dormir e a de acordar variam bastante.')
  })

  it('leaves out nights without times and other days', () => {
    const days = [
      ...['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((id) => night(id, '22:00', '06:00')),
      { id: '2026-11-06', sleep: { totalSec: 7 * 3600 }, ...meta },
      { id: '2026-11-07', restingHr: 50, ...meta },
    ]
    expect(regularity(days, '2026-11-07')).toMatchObject({ nights: 5, bedtime: 22, wake: 6 })
  })
})

describe('sleepBalance', () => {
  it('adds slept minus the goal over the last 7 nights, leaving out naps and older nights', () => {
    const days = [
      night('2026-10-29', '23:00', '07:00', 3),
      night('2026-11-01', '23:00', '07:00', 7),
      night('2026-11-02', '23:00', '07:00', 6, { napSec: 3600 }),
      night('2026-11-05', '23:00', '07:00', 8),
    ]
    const balance = sleepBalance(days, '2026-11-05', 480)!
    expect(balance.nights).toBe(3)
    expect(balance.balanceMin).toBe(-180)
    expect(balance.averageMin).toBe(420)
    expect(sleepBalance(days, '2026-10-25', 480)).toBeUndefined()
  })

  it('reads in words', () => {
    expect(balanceSentence({ nights: 7, balanceMin: -500, averageMin: 408 })).toBe(
      'Nas últimas 7 noites você dormiu 6h48 em média: 8h20 a menos que a meta no total.',
    )
    expect(balanceSentence({ nights: 7, balanceMin: 60, averageMin: 488 })).toBe('Nas últimas 7 noites você dormiu 8h08 em média: dentro da meta.')
    expect(balanceSentence({ nights: 3, balanceMin: 150, averageMin: 530 })).toBe(
      'Em 3 das últimas 7 noites você dormiu 8h50 em média: 2h30 a mais que a meta no total.',
    )
  })
})

describe('text and goal', () => {
  it('formats signed durations, spreads and the default goal', () => {
    expect(signedDuration(-130)).toBe('−2h10')
    expect(signedDuration(30)).toBe('+30 min')
    expect(signedDuration(0.2)).toBe('0 min')
    expect(spreadText(34.6)).toBe('± 35 min')
    expect(sleepGoalMin({})).toBe(480)
    expect(sleepGoalMin({ sleepGoalMin: 450 })).toBe(450)
  })
})
