import { useLiveQuery } from 'dexie-react-hooks'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { DayKey } from '../../lib/dates'
import { buildDailyData, type DailyData, type Sources } from './metrics'

/** Every table the correlations (and the daily analysis) read, without deleted rows. */
export async function loadSources(): Promise<Sources> {
  const [health, weights, foodLogs, waterLogs, habits, habitLogs, activities, sessions, journal, pains] = await Promise.all([
    db.dailyHealth.toArray(),
    db.weights.toArray(),
    db.foodLogs.toArray(),
    db.waterLogs.toArray(),
    db.habits.toArray(),
    db.habitLogs.toArray(),
    db.activities.toArray(),
    db.workoutSessions.toArray(),
    db.journal.toArray(),
    db.pains.toArray(),
  ])
  return {
    health: alive(health),
    weights: alive(weights),
    foodLogs: alive(foodLogs),
    waterLogs: alive(waterLogs),
    habits: alive(habits),
    habitLogs: alive(habitLogs),
    activities: alive(activities),
    sessions: alive(sessions),
    journal: alive(journal),
    pains: alive(pains),
  }
}

/** The first day anything was recorded. */
export function firstDayOf(sources: Sources): DayKey | undefined {
  return [
    ...sources.health.map((day) => day.id),
    ...sources.weights.map((entry) => entry.date),
    ...sources.activities.map((activity) => activity.date),
    ...sources.foodLogs.map((log) => log.date),
    ...sources.habitLogs.map((log) => log.date),
    ...sources.journal.map((entry) => entry.id),
  ].sort()[0]
}

/** Daily rows from `from` (or the first day with data) to `to`. */
export function useDailyData(from: DayKey | undefined, to: DayKey): DailyData | undefined {
  return useLiveQuery(async () => {
    const sources = await loadSources()
    const firstDay = firstDayOf(sources) ?? to
    return buildDailyData(sources, from && from > firstDay ? from : firstDay, to)
  }, [from, to])
}
