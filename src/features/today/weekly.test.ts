import { describe, expect, it } from 'vitest'
import { weekStats, type WeekSources } from './weekly'

const meta = { updatedAt: 0, deleted: 0 as const, dirty: 0 as const }

describe('weekStats', () => {
  it('averages over the days with logs and counts days near the calorie goal', () => {
    const log = (date: string, kcal: number) => ({
      ...meta,
      id: date,
      date,
      meal: 'lunch' as const,
      time: 0,
      foodId: 'x',
      name: 'x',
      grams: 100,
      nutrients: { kcal, protein: 100, carbs: 0, fat: 0 },
    })
    const sources: WeekSources = {
      foodLogs: [log('2026-10-26', 2000), log('2026-10-27', 2500), log('2026-11-02', 9999)],
      sessions: [],
      activityDates: [],
      health: [{ ...meta, id: '2026-10-26', sleep: { totalSec: 7 * 3600 }, steps: 8000 }],
      weightTrend: [
        { date: '2026-10-25', value: 80 },
        { date: '2026-11-01', value: 79.5 },
      ],
      water: [],
      habits: [],
      habitLogs: [],
      goalOn: () => ({ kcal: 2100, protein: 150, carbs: 200, fat: 70 }),
    }
    const week = weekStats('2026-10-26', '2026-11-01', sources)
    expect(week.foodDays).toBe(2)
    expect(week.kcal).toBe(2250)
    expect(week.onTarget).toBe(1)
    expect(week.sleepHours).toBe(7)
    expect(week.weightChange).toBeCloseTo(-0.5)
    expect(week.waterL).toBeUndefined()
  })

  it('leaves the skipped days out of the habits', () => {
    const habit = {
      ...meta,
      id: 'sun',
      name: 'Sol',
      kind: 'check' as const,
      polarity: 'good' as const,
      startDate: '2026-10-01',
      archived: 0 as const,
      order: 0,
    }
    const log = (date: string, value: number, skipped?: 1) => ({ ...meta, id: `sun:${date}`, habitId: 'sun', date, value, skipped })
    const week = weekStats('2026-10-26', '2026-11-01', {
      foodLogs: [],
      sessions: [],
      activityDates: [],
      health: [],
      weightTrend: [],
      water: [],
      habits: [habit],
      // Done 3 days, skipped 3 (rain), missed 1: 3 of the 4 days that count.
      habitLogs: [
        log('2026-10-26', 1),
        log('2026-10-27', 0, 1),
        log('2026-10-28', 0, 1),
        log('2026-10-29', 1),
        log('2026-10-30', 0, 1),
        log('2026-10-31', 1),
      ],
      goalOn: () => undefined,
    })
    expect(week.habits).toBe(0.75)
  })
})
