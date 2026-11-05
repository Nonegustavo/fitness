import { describe, expect, it } from 'vitest'
import type { Habit, HabitLog } from '../../db/types'
import { buildDailyData, type Sources } from './metrics'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const empty: Sources = {
  health: [],
  weights: [],
  foodLogs: [],
  waterLogs: [],
  habits: [],
  habitLogs: [],
  activities: [],
  sessions: [],
  journal: [],
}

describe('buildDailyData habits', () => {
  const sun: Habit = { id: 'sun', name: 'Sol', kind: 'check', polarity: 'good', startDate: '2026-10-01', archived: 0, order: 0, ...meta }
  const log = (date: string, value: number, skipped?: 1): HabitLog => ({ id: `sun:${date}`, habitId: 'sun', date, value, skipped, ...meta })

  it('reads a day without a log as not done, and a skipped day as missing', () => {
    const data = buildDailyData(
      { ...empty, habits: [sun], habitLogs: [log('2026-10-01', 1), log('2026-10-02', 0, 1)] },
      '2026-10-01',
      '2026-10-03',
    )
    expect(data.rows.get('2026-10-01')?.['habit:sun']).toBe(1)
    expect(data.rows.get('2026-10-02')?.['habit:sun']).toBeUndefined()
    expect(data.rows.get('2026-10-03')?.['habit:sun']).toBe(0)
  })
})
