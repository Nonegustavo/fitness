import { CalendarRange } from 'lucide-react'
import { useMemo } from 'react'
import { Card, SkeletonCard } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { formatDay, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { formatDuration, formatNumber, formatSigned } from '../../lib/format'
import { useActivities } from '../activities/activities'
import { metricSeries, useWeights } from '../body/body'
import { goalsFor, useFoodLogs, useTrainingDays } from '../food/nutrition'
import { useDailyHealth } from '../garmin/recovery'
import { useHabitLogs, useHabits } from '../habits/habits'
import { useSessions } from '../training/training'
import { useWaterLogs } from '../water/water'
import { weekStats, type WeekStats } from './weekly'

/** The last complete week (Sunday to Saturday) next to the one before, area by area; undefined while loading. */
export function useLastWeek(today: DayKey): { from: DayKey; to: DayKey; rows: Row[] } | undefined {
  const sunday = weekStart(today)
  const last = { from: shiftDay(sunday, -7), to: shiftDay(sunday, -1) }
  const before = { from: shiftDay(sunday, -14), to: shiftDay(sunday, -8) }

  const settings = useSettings()
  const foodLogs = useFoodLogs(before.from, last.to)
  const trainingDays = useTrainingDays(before.from, last.to)
  const sessions = useSessions()
  const activities = useActivities()
  const health = useDailyHealth(before.from, last.to)
  const weights = useWeights()
  const water = useWaterLogs(before.from, last.to)
  const habits = useHabits()
  const habitLogs = useHabitLogs(before.from, last.to)

  const stats = useMemo(() => {
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
    return { last: weekStats(last.from, last.to, sources), before: weekStats(before.from, before.to, sources) }
    // The week bounds derive from `today`.
  }, [foodLogs, sessions, activities, health, weights, water, habits, habitLogs, settings, trainingDays, today])

  return stats && { ...last, rows: rowsOf(stats.last, stats.before) }
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
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Sem registros na semana passada.</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2">
            {rows.map((row) => (
              <li key={row.label} className="rounded-xl bg-surface-2 px-3 py-2">
                <p className="truncate text-xs text-ink-2">{row.label}</p>
                <p className="text-lg leading-tight font-semibold tabular-nums">{row.value}</p>
                {row.change && (
                  <p className="text-xs text-muted tabular-nums">
                    {/^±0(\D|$)/.test(row.change) ? 'igual à anterior' : `${row.change} vs. anterior`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

export interface Row {
  label: string
  value: string
  change?: string
  /** The few numbers the small card shows, most important first. */
  key?: number
  /** A shorter label for the small card. */
  short?: string
}

/** "+120", "−0,4", or nothing when the week before had no data. */
const delta = (now: number | undefined, then: number | undefined, digits = 0, unit = ''): string | undefined =>
  now === undefined || then === undefined ? undefined : `${formatSigned(now - then, digits)}${unit}`

function rowsOf(w: WeekStats, p: WeekStats): Row[] {
  const rows: Row[] = []
  if (w.workouts || p.workouts) {
    rows.push({ label: 'Musculação', short: 'Musculação', value: `${w.workouts} ${w.workouts === 1 ? 'treino' : 'treinos'}`, change: delta(w.workouts, p.workouts), key: 1 })
    rows.push({ label: 'Séries', value: String(w.sets), change: delta(w.sets, p.workouts || p.sets ? p.sets : undefined) })
  }
  if (w.activities || p.activities) rows.push({ label: 'Outras atividades', short: 'Atividades', value: String(w.activities), change: delta(w.activities, p.activities) })
  if (w.sleepHours !== undefined)
    rows.push({
      label: 'Sono por noite',
      short: 'Sono',
      value: formatDuration(w.sleepHours * 3_600_000),
      change: p.sleepHours !== undefined ? `${formatSigned((w.sleepHours - p.sleepHours) * 60, 0)} min` : undefined,
      key: 2,
    })
  if (w.kcal !== undefined) {
    rows.push({ label: 'Calorias por dia', short: 'Calorias', value: `${formatNumber(w.kcal, 0)} kcal`, change: delta(w.kcal, p.kcal), key: 3 })
    rows.push({ label: 'Proteína por dia', short: 'Proteína', value: `${formatNumber(w.protein!, 0)} g`, change: delta(w.protein, p.protein, 0, ' g') })
    if (w.onTarget !== undefined) rows.push({ label: 'Dias na meta (±10%)', short: 'Na meta', value: `${w.onTarget} de ${w.foodDays}` })
  }
  if (w.steps !== undefined) rows.push({ label: 'Passos por dia', short: 'Passos', value: formatNumber(w.steps, 0), change: delta(w.steps, p.steps) })
  if (w.weightChange !== undefined) rows.push({ label: 'Peso (tendência)', short: 'Peso', value: `${formatSigned(w.weightChange)} kg`, key: 4 })
  if (w.waterL !== undefined) rows.push({ label: 'Água por dia', short: 'Água', value: `${formatNumber(w.waterL)} L`, change: delta(w.waterL, p.waterL, 1, ' L') })
  if (w.habits !== undefined)
    rows.push({
      label: 'Hábitos cumpridos',
      short: 'Hábitos',
      value: `${formatNumber(w.habits * 100, 0)}%`,
      change: p.habits !== undefined ? `${formatSigned((w.habits - p.habits) * 100, 0)} p.p.` : undefined,
    })
  return rows
}
