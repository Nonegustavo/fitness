import { daysBetween, shiftDay, type DayKey } from './dates'

export interface DayValue {
  date: DayKey
  value: number
}

/**
 * Exponentially smoothed trend, the usual way to read daily weigh-ins.
 * Gaps are handled by compounding the smoothing over the missing days.
 * Expects at most one value per day.
 */
export function smoothedTrend(values: DayValue[], dailyAlpha = 0.1): DayValue[] {
  const sorted = [...values].sort((a, b) => a.date.localeCompare(b.date))
  const trend: DayValue[] = []
  for (const { date, value } of sorted) {
    const prev = trend.at(-1)
    if (!prev) {
      trend.push({ date, value })
      continue
    }
    const days = Math.max(daysBetween(prev.date, date), 1)
    const alpha = 1 - (1 - dailyAlpha) ** days
    trend.push({ date, value: prev.value + alpha * (value - prev.value) })
  }
  return trend
}

/** Change between the last point and the latest point at least `days` earlier. */
export function changeOver(series: DayValue[], days: number): number | undefined {
  const last = series.at(-1)
  if (!last) return undefined
  const cutoff = shiftDay(last.date, -days)
  let base: DayValue | undefined
  for (const point of series) {
    if (point.date > cutoff) break
    base = point
  }
  return base ? last.value - base.value : undefined
}

/** Keeps the earliest item of each day (the morning weigh-in, usually). */
export function firstPerDay<T extends { date: DayKey; time: number }>(items: T[]): T[] {
  const byDay = new Map<DayKey, T>()
  for (const item of items) {
    const current = byDay.get(item.date)
    if (!current || item.time < current.time) byDay.set(item.date, item)
  }
  return [...byDay.values()].sort((a, b) => a.time - b.time)
}
