import { useLiveQuery } from 'dexie-react-hooks'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { MeasurementEntry, WeightEntry } from '../../db/types'
import { firstPerDay, smoothedTrend, type DayValue } from '../../lib/stats'

/** All weigh-ins, oldest first. */
export function useWeights(): WeightEntry[] | undefined {
  return useLiveQuery(async () => alive(await db.weights.toArray()).sort((a, b) => a.time - b.time))
}

/** All measurement sessions, oldest first. */
export function useMeasurements(): MeasurementEntry[] | undefined {
  return useLiveQuery(async () =>
    alive(await db.measurements.toArray()).sort((a, b) => a.date.localeCompare(b.date)),
  )
}

export interface MetricSeries {
  /** First reading of each day. */
  readings: DayValue[]
  trend: DayValue[]
}

/** Daily readings of one scale metric and their smoothed trend. */
export function metricSeries(entries: WeightEntry[], pick: (entry: WeightEntry) => number | undefined): MetricSeries {
  const daily = firstPerDay(entries.filter((entry) => pick(entry) !== undefined))
  const readings = daily.map((entry) => ({ date: entry.date, value: pick(entry)! }))
  return { readings, trend: smoothedTrend(readings) }
}
