import { CalendarRange } from 'lucide-react'
import { useMemo } from 'react'
import { Card, SkeletonCard } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { formatDay, type DayKey } from '../../lib/dates'
import { useActivities } from '../activities/activities'
import { metricSeries, useWeights } from '../body/body'
import { goalsFor, useFoodLogs, useTrainingDays } from '../food/nutrition'
import { useDailyHealth } from '../garmin/recovery'
import { useHabitLogs, useHabits } from '../habits/habits'
import { useSessions } from '../training/training'
import { useWaterLogs } from '../water/water'
import { rowsOf, summaryPeriod, weekStats, type Row, type SummaryPeriod } from './weekly'

export type { Row } from './weekly'

/**
 * A period of the summary next to what it is compared with, area by area; undefined while loading. The
 * range hooks keep their last result while the range changes: show it under a `key` of the period, so a
 * new one starts empty instead of counting the old period's records.
 */
export function useSummaryRows(period: SummaryPeriod): Row[] | undefined {
  const { from, to, before, grain } = period
  const settings = useSettings()
  const foodLogs = useFoodLogs(before.from, to)
  const trainingDays = useTrainingDays(before.from, to)
  const sessions = useSessions()
  const activities = useActivities()
  const health = useDailyHealth(before.from, to)
  const weights = useWeights()
  const water = useWaterLogs(before.from, to)
  const habits = useHabits()
  const habitLogs = useHabitLogs(before.from, to)

  return useMemo(() => {
    if (!foodLogs || !sessions || !health || !weights || !water || !habits || !habitLogs) return undefined
    const sources = {
      foodLogs,
      sessions,
      activityDates: (activities ?? []).map((a) => a.date),
      health,
      weightTrend: metricSeries(weights, (entry) => entry.weightKg).trend,
      water,
      habits,
      habitLogs,
      goalOn: (date: DayKey) => goalsFor(settings, trainingDays?.has(date) ?? false),
    }
    return rowsOf(weekStats(from, to, sources), weekStats(before.from, before.to, sources), grain)
  }, [foodLogs, sessions, activities, health, weights, water, habits, habitLogs, settings, trainingDays, from, to, before.from, before.to, grain])
}

/** The last complete week (Sunday to Saturday) next to the one before, area by area; undefined while loading. */
export function useLastWeek(today: DayKey): { from: DayKey; to: DayKey; rows: Row[] } | undefined {
  const period = summaryPeriod('week', undefined, today)
  const rows = useSummaryRows(period)
  return rows && { from: period.from, to: period.to, rows }
}

export function WeeklyCard({ today }: { today: DayKey }) {
  const week = useLastWeek(today)
  if (!week) return <SkeletonCard lines={4} />
  const { from, to, rows } = week
  return (
    <Card
      icon={CalendarRange}
      tone="insights"
      title={`Semana de ${formatDay(from, 'd/M')} a ${formatDay(to, 'd/M')}`}
    >
      {rows.length === 0 ? <p className="text-sm text-muted">Sem registros na semana passada.</p> : <SummaryRows rows={rows} />}
    </Card>
  )
}

/** The summary's numbers, two by two, each with its change from the period before. */
export function SummaryRows({ rows, grain = 'week' }: { rows: Row[]; grain?: SummaryPeriod['grain'] }) {
  const same = grain === 'month' ? 'igual ao anterior' : 'igual à anterior'
  return (
    <ul className="grid grid-cols-2 gap-2">
      {rows.map((row) => (
        <li key={row.label} className="rounded-xl bg-surface-2 px-3 py-2">
          <p className="truncate text-xs text-ink-2">{row.label}</p>
          <p className="text-lg leading-tight font-semibold tabular-nums">{row.value}</p>
          {row.change && (
            <p className="text-xs text-muted tabular-nums">
              {/^±0(\D|$)/.test(row.change) ? same : `${row.change} vs. anterior`}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
