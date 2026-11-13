import { useLiveQuery } from 'dexie-react-hooks'
import { alive } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { ActivityStream } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { needsSamples } from '../running/load'
import { buildDailyData, type DailyData, type Sources } from './metrics'

/** Every table the correlations (and the daily analysis) read, without deleted rows. */
export async function loadSources(): Promise<Sources> {
  const [settings, health, weights, foodLogs, waterLogs, habits, habitLogs, activities, sessions, journal, pains] = await Promise.all([
    db.settings.get(SETTINGS_ID),
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
  const live = alive(activities)
  // Only the few activities without the watch's zones need their samples, for the training load.
  const missing = live.filter(needsSamples)
  const streams = missing.length > 0 ? await db.activityStreams.bulkGet(missing.map((activity) => activity.id)) : []
  return {
    health: alive(health),
    weights: alive(weights),
    foodLogs: alive(foodLogs),
    waterLogs: alive(waterLogs),
    habits: alive(habits),
    habitLogs: alive(habitLogs),
    activities: live,
    sessions: alive(sessions),
    journal: alive(journal),
    pains: alive(pains),
    streams: new Map(
      streams.filter((stream): stream is ActivityStream => !!stream && !stream.deleted).map((stream) => [stream.id, stream]),
    ),
    // The goal the sleep balance is counted against.
    sleepGoalMin: settings?.sleepGoalMin,
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
