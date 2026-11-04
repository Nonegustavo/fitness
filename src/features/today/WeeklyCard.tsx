import { startOfWeek } from 'date-fns'
import { CalendarRange } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Card } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { dayKey, formatDay, parseDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatDuration, formatNumber, formatSigned } from '../../lib/format'
import { useActivities } from '../activities/activities'
import { metricSeries, useWeights } from '../body/body'
import { goalsFor, useFoodLogs, useTrainingDays } from '../food/nutrition'
import { useDailyHealth } from '../garmin/recovery'
import { useHabitLogs, useHabits } from '../habits/habits'
import { useSessions } from '../training/training'
import { useWaterLogs } from '../water/water'
import { weekStats, type WeekStats } from './weekly'

/** The last complete week (Monday to Sunday) next to the one before, area by area. */
export function WeeklyCard({ today }: { today: DayKey }) {
  const monday = dayKey(startOfWeek(parseDay(today), { weekStartsOn: 1 }))
  const last = { from: shiftDay(monday, -7), to: shiftDay(monday, -1) }
  const before = { from: shiftDay(monday, -14), to: shiftDay(monday, -8) }

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

  if (!stats) return null
  const rows = rowsOf(stats.last, stats.before)
  return (
    <Card
      icon={CalendarRange}
      tone="insights"
      title={`Semana de ${formatDay(last.from, 'd/M')} a ${formatDay(last.to, 'd/M')}`}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Sem registros na semana passada.</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.label} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                <span className="text-ink-2">{row.label}</span>
                <span className="text-right">
                  <span className="font-medium tabular-nums">{row.value}</span>
                  {row.change && <span className="ml-2 text-xs text-muted tabular-nums">{row.change}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Ao lado, a diferença para a semana anterior.</p>
        </>
      )}
    </Card>
  )
}

interface Row {
  label: string
  value: ReactNode
  change?: string
}

/** "+120", "−0,4", or nothing when the week before had no data. */
const delta = (now: number | undefined, then: number | undefined, digits = 0, unit = ''): string | undefined =>
  now === undefined || then === undefined ? undefined : `${formatSigned(now - then, digits)}${unit}`

function rowsOf(w: WeekStats, p: WeekStats): Row[] {
  const rows: Row[] = []
  if (w.kcal !== undefined) {
    rows.push({ label: `Calorias (${w.foodDays} ${w.foodDays === 1 ? 'dia' : 'dias'})`, value: `${formatNumber(w.kcal, 0)} kcal`, change: delta(w.kcal, p.kcal) })
    rows.push({ label: 'Proteína', value: `${formatNumber(w.protein!, 0)} g`, change: delta(w.protein, p.protein, 0, ' g') })
    if (w.onTarget !== undefined) rows.push({ label: 'Dias na meta de calorias (±10%)', value: `${w.onTarget} de ${w.foodDays}` })
  }
  if (w.workouts || w.activities || p.workouts) {
    rows.push({
      label: 'Treinos',
      value: `${w.workouts} musculação · ${w.sets} séries${w.activities ? ` · ${w.activities} atividades` : ''}`,
      change: delta(w.sets, p.workouts || p.sets ? p.sets : undefined, 0, ' séries'),
    })
  }
  if (w.sleepHours !== undefined)
    rows.push({
      label: 'Sono por noite',
      value: formatDuration(w.sleepHours * 3_600_000),
      change: p.sleepHours !== undefined ? `${formatSigned((w.sleepHours - p.sleepHours) * 60, 0)} min` : undefined,
    })
  if (w.steps !== undefined) rows.push({ label: 'Passos por dia', value: formatNumber(w.steps, 0), change: delta(w.steps, p.steps) })
  if (w.weightChange !== undefined) rows.push({ label: 'Peso (tendência)', value: `${formatSigned(w.weightChange)} kg` })
  if (w.waterL !== undefined) rows.push({ label: 'Água por dia', value: `${formatNumber(w.waterL)} L`, change: delta(w.waterL, p.waterL, 1, ' L') })
  if (w.habits !== undefined)
    rows.push({
      label: 'Hábitos cumpridos',
      value: `${formatNumber(w.habits * 100, 0)}%`,
      change: p.habits !== undefined ? `${formatSigned((w.habits - p.habits) * 100, 0)} p.p.` : undefined,
    })
  return rows
}
