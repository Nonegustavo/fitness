import type { DayKey } from '../../lib/dates'
import { median } from '../insights/stats'

/** How many finished days the watch's resting calories are taken from. */
export const RESTING_DAYS = 14

export interface DayEnergy {
  day: DayKey
  total?: number
  active?: number
}

/**
 * The resting calories of whole days, as the watch counted them (total − active): the newest `limit`
 * finished days before today that have both numbers.
 */
export function wholeDaysResting(days: DayEnergy[], today: DayKey, limit = RESTING_DAYS): number[] {
  return days
    .filter((day) => day.day < today && day.total !== undefined && day.active !== undefined && day.total > day.active)
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-limit)
    .map((day) => day.total! - day.active!)
}

export type RestingSource =
  | { kind: 'watch'; days: number }
  | { kind: 'scale'; date: DayKey }
  | { kind: 'formula' }

export interface RestingEstimate {
  kcal: number
  source: RestingSource
}

/**
 * A whole day's resting calories: the median of the watch's recent days, which counts them its own way
 * (nearly the same every day); without them, the scale's latest BMR; then Mifflin–St Jeor's.
 */
export function restingEstimate({
  days,
  today,
  scaleBmr,
  formulaBmr,
}: {
  days: DayEnergy[]
  today: DayKey
  scaleBmr?: { kcal: number; date: DayKey }
  formulaBmr?: number
}): RestingEstimate | undefined {
  const watch = wholeDaysResting(days, today)
  if (watch.length > 0) return { kcal: median(watch), source: { kind: 'watch', days: watch.length } }
  if (scaleBmr && scaleBmr.kcal > 0) return { kcal: scaleBmr.kcal, source: { kind: 'scale', date: scaleBmr.date } }
  if (formulaBmr && formulaBmr > 0) return { kcal: formulaBmr, source: { kind: 'formula' } }
  return undefined
}

export interface Forecast {
  /** The whole day: the active calories so far and all of the day's resting ones. */
  kcal: number
  active: number
  /** The resting calories the watch has already counted today. */
  restingSoFar: number
  /** The rest of the day's resting calories, still to come. */
  restingLeft: number
  resting: RestingEstimate
}

/**
 * Today's calories by the end of the day, if nothing more is done: Garmin's count of today only has the
 * resting calories up to its last sync, so the active ones so far go with the whole day's resting ones.
 * Never less than what was already counted.
 */
export function forecastDay(today: { total?: number; active?: number } | undefined, resting: RestingEstimate): Forecast {
  const active = today?.active ?? 0
  const restingSoFar = today?.total !== undefined ? Math.max(0, today.total - active) : 0
  const restingLeft = Math.max(0, resting.kcal - restingSoFar)
  return { kcal: active + restingSoFar + restingLeft, active, restingSoFar, restingLeft, resting }
}
