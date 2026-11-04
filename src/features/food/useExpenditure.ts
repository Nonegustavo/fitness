import { useMemo } from 'react'
import type { DayKey } from '../../lib/dates'
import { shiftDay } from '../../lib/dates'
import { metricSeries, useWeights } from '../body/body'
import { estimateExpenditure, type Expenditure } from './energy'
import { useFoodLogs } from './nutrition'

const WINDOW = 28

/** The expenditure estimated from the last 4 weeks of logs and weigh-ins; undefined while loading or without data. */
export function useExpenditure(today: DayKey): Expenditure | undefined {
  const logs = useFoodLogs(shiftDay(today, -WINDOW), shiftDay(today, -1))
  const weights = useWeights()
  return useMemo(() => {
    if (!logs || !weights) return undefined
    const intake = new Map<DayKey, number>()
    for (const log of logs) intake.set(log.date, (intake.get(log.date) ?? 0) + log.nutrients.kcal)
    // The smoothed trend over the whole history, so it is settled at the window's start.
    const { trend } = metricSeries(weights, (entry) => entry.weightKg)
    return estimateExpenditure(intake, trend, today, WINDOW)
  }, [logs, weights, today])
}
