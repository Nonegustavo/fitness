import { useLiveQuery } from 'dexie-react-hooks'
import { alive, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { WaterContainer, WaterLog } from '../../db/types'
import { dayKey, type DayKey } from '../../lib/dates'

/** The usual 35 ml per kg of body weight, rounded to 50 ml. */
export const suggestedGoalMl = (weightKg: number): number => Math.round((weightKg * 35) / 50) * 50

export const sumMl = (logs: WaterLog[]): number => logs.reduce((total, log) => total + log.ml, 0)

export function totalsByDay(logs: WaterLog[]): Map<DayKey, number> {
  const totals = new Map<DayKey, number>()
  for (const log of logs) totals.set(log.date, (totals.get(log.date) ?? 0) + log.ml)
  return totals
}

export function addWater(ml: number, containerId?: string): Promise<WaterLog> {
  return save(db.waterLogs, { date: dayKey(), time: Date.now(), ml, containerId })
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
