import { useLiveQuery } from 'dexie-react-hooks'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { DayKey } from '../../lib/dates'
import { buildDailyData, type DailyData } from './metrics'

/** Every table the correlations read, as daily rows from `from` (or the first day with data) to `to`. */
export function useDailyData(from: DayKey | undefined, to: DayKey): DailyData | undefined {
  return useLiveQuery(async () => {
    const [health, weights, foodLogs, waterLogs, habits, habitLogs, activities, sessions] = await Promise.all([
      db.dailyHealth.toArray(),
      db.weights.toArray(),
      db.foodLogs.toArray(),
      db.waterLogs.toArray(),
      db.habits.toArray(),
      db.habitLogs.toArray(),
      db.activities.toArray(),
      db.workoutSessions.toArray(),
    ])
    const sources = {
      health: alive(health),
      weights: alive(weights),
      foodLogs: alive(foodLogs),
      waterLogs: alive(waterLogs),
      habits: alive(habits),
      habitLogs: alive(habitLogs),
      activities: alive(activities),
      sessions: alive(sessions),
    }
    const firstDay =
      [
        ...sources.health.map((day) => day.id),
        ...sources.weights.map((entry) => entry.date),
        ...sources.activities.map((activity) => activity.date),
        ...sources.foodLogs.map((log) => log.date),
        ...sources.habitLogs.map((log) => log.date),
      ].sort()[0] ?? to
    return buildDailyData(sources, from && from > firstDay ? from : firstDay, to)
  }, [from, to])
}
