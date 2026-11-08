import { useLiveQuery } from 'dexie-react-hooks'
import { alive, patch, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { WaterContainer, WaterLog } from '../../db/types'
import { dayKey, dayTime, formatTime, type DayKey } from '../../lib/dates'

/** The usual 35 ml per kg of body weight, rounded to 50 ml. */
export const suggestedGoalMl = (weightKg: number): number => Math.round((weightKg * 35) / 50) * 50

export const sumMl = (logs: WaterLog[]): number => logs.reduce((total, log) => total + log.ml, 0)

export function totalsByDay(logs: WaterLog[]): Map<DayKey, number> {
  const totals = new Map<DayKey, number>()
  for (const log of logs) totals.set(log.date, (totals.get(log.date) ?? 0) + log.ml)
  return totals
}

/** When water logged now goes on `date`: now itself today, else the same time of day on that day. */
export function loggedAt(date: DayKey, now = Date.now()): number {
  return date === dayKey(now) ? now : dayTime(date, formatTime(now))
}

/** "HH:mm" typed in a time field. */
export const CLOCK = /^\d{2}:\d{2}$/

/** Logs water on a day (today unless said), at `clock` ("HH:mm") or at the time it is now. */
export function addWater(ml: number, containerId?: string, date: DayKey = dayKey(), clock?: string): Promise<WaterLog> {
  const time = clock && CLOCK.test(clock) ? dayTime(date, clock) : loggedAt(date)
  return save(db.waterLogs, { date, time, ml, containerId })
}

/** A log's new time of day (on its own day) and amount. */
export function changeWater(log: WaterLog, clock: string, ml: number): Promise<void> {
  return patch(db.waterLogs, log.id, { time: CLOCK.test(clock) ? dayTime(log.date, clock) : log.time, ml })
}

/** Logs between two days (inclusive), oldest first. */
export function useWaterLogs(from: DayKey, to: DayKey): WaterLog[] | undefined {
  return useLiveQuery(
    async () =>
      alive(await db.waterLogs.where('date').between(from, to, true, true).toArray()).sort((a, b) => a.time - b.time),
    [from, to],
  )
}

export function useContainers(): WaterContainer[] | undefined {
  return useLiveQuery(async () =>
    alive(await db.waterContainers.toArray()).sort((a, b) => a.order - b.order || a.ml - b.ml),
  )
}
