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
})
