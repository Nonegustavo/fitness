import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { alive } from '../../db/repo'
import { db, DEFAULT_SETTINGS, SETTINGS_ID } from '../../db/schema'
import type { Synced } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { dayKey } from '../../lib/dates'
import { plannedEvents } from '../garmin/sync'
import { readEffortLookup, startEffortCache } from '../running/efforts'
import { buildRecap, yearBounds, type Recap } from './recap'

const notDeleted = (row: Synced) => !row.deleted

/** The first day anything was recorded; null when nothing was. Undefined while loading. */
export function useFirstRecordDay(): DayKey | null | undefined {
  return useLiveQuery(async () => {
    const firsts = await Promise.all([
      db.weights.orderBy('date').filter(notDeleted).first(),
      db.activities.orderBy('startTime').filter(notDeleted).first(),
      db.workoutSessions.orderBy('date').filter(notDeleted).first(),
      db.foodLogs.orderBy('date').filter(notDeleted).first(),
      db.dailyHealth.orderBy('id').filter(notDeleted).first(),
      db.habitLogs.orderBy('date').filter(notDeleted).first(),
      db.waterLogs.orderBy('date').filter(notDeleted).first(),
      db.journal.orderBy('id').filter(notDeleted).first(),
    ])
    const days = firsts.flatMap((row) => {
      if (!row) return []
      if ('startTime' in row) return [dayKey(row.startTime)]
      return ['date' in row ? row.date : row.id]
    })
    return days.sort()[0] ?? null
  })
}

/** A year in numbers, read from every table: that year's rows, and the earlier runs and weigh-ins it compares with. */
export async function loadRecap(year: number, today: DayKey): Promise<Recap> {
  const { from, to } = yearBounds(year, today)
  const [activities, sessions, exercises, health, weights, measurements, habits, habitLogs, foodLogs, water, journal, pains, settings, events, eventTimes, races] =
    await Promise.all([
      db.activities.toArray(),
      db.workoutSessions.where('date').between(from, to, true, true).toArray(),
      db.exercises.toArray(),
      db.dailyHealth.where('id').between(from, to, true, true).toArray(),
      db.weights.where('date').belowOrEqual(to).toArray(),
      db.measurements.where('date').between(from, to, true, true).toArray(),
      db.habits.toArray(),
      db.habitLogs.where('date').between(from, to, true, true).toArray(),
      db.foodLogs.where('date').between(from, to, true, true).toArray(),
      db.waterLogs.where('date').between(from, to, true, true).toArray(),
      db.journal.where('id').between(from, to, true, true).toArray(),
      db.pains.toArray(),
      db.settings.get(SETTINGS_ID),
      plannedEvents(),
      db.eventTimes.toArray(),
      db.races.where('date').between(from, to, true, true).toArray(),
    ])
  const done = alive(activities).filter((activity) => activity.date <= to)
  // The best times of the year and of the years before, from the cache of the runs' best stretches.
  const efforts = await readEffortLookup()
  const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
  return buildRecap(year, today, {
    activities: done,
    streams: efforts,
    sessions: alive(sessions),
    exercises: new Map(exercises.map((exercise) => [exercise.id, exercise])),
    health: alive(health),
    weights: alive(weights),
    measurements: alive(measurements),
    habits: alive(habits),
    habitLogs: alive(habitLogs),
    foodLogs: alive(foodLogs),
    water: alive(water),
    journal: alive(journal),
    pains: alive(pains),
    settings: settings ?? DEFAULT_SETTINGS,
    // The races the calendar still has, and the ones the user gave a time to (their key keeps the name).
    raceEvents: [
      ...(events ?? []).map((event) => ({ title: event.title, date: event.date })),
      ...alive(eventTimes).flatMap((time) =>
        time.id.startsWith('t:') ? [{ title: capitalized(time.id.slice(2, time.id.lastIndexOf('|'))), date: time.date }] : [],
      ),
    ],
    races: alive(races),
  })
}

/** The recap of a year; undefined while loading. */
export function useRecap(year: number | undefined, today: DayKey): Recap | undefined {
  useEffect(startEffortCache, [])
  return useLiveQuery(async () => (year === undefined ? undefined : loadRecap(year, today)), [year, today])
}
