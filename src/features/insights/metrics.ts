import type {
  Activity,
  DailyHealth,
  FoodLog,
  Habit,
  HabitLog,
  WaterLog,
  WeightEntry,
  WorkoutSession,
} from '../../db/types'
import { dayKey, dayRange, shiftDay, type DayKey } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'

export type MetricGroup = 'Sono' | 'Recuperação' | 'Corpo' | 'Treino' | 'Dia' | 'Alimentação' | 'Hábitos'

export interface Metric {
  key: string
  label: string
  group: MetricGroup
  /** "h" and "min" format as durations, "clock" as a time of day. */
  unit: string
  digits: number
  /**
   * A night belongs to the morning it ends (as Garmin dates sleep), so what happens during a day
   * meets the night dated the next day.
   */
  timing: 'day' | 'night'
  /** Done / not done, compared as two groups of days. */
  binary?: boolean
  /** How it reads in "Depois de …" when binary. */
  phrase?: string
  /** A change, shown with its sign: "+0,2 kg". */
  signed?: boolean
  /** Can explain something (a habit, a workout) and/or be explained (sleep, HRV). */
  cause?: boolean
  effect?: boolean
}

export type DayRow = Record<string, number>

export interface DailyData {
  metrics: Metric[]
  rows: Map<DayKey, DayRow>
}

export interface Sources {
  health: DailyHealth[]
  weights: WeightEntry[]
  foodLogs: FoodLog[]
  waterLogs: WaterLog[]
  habits: Habit[]
  habitLogs: HabitLog[]
  activities: Activity[]
  sessions: WorkoutSession[]
}

const BASE_METRICS: Metric[] = [
  { key: 'sleepHours', label: 'Horas de sono', group: 'Sono', unit: 'h', digits: 2, timing: 'night', cause: true, effect: true },
  { key: 'sleepScore', label: 'Nota do sono', group: 'Sono', unit: '', digits: 0, timing: 'night', cause: true, effect: true },
  { key: 'deepHours', label: 'Sono profundo', group: 'Sono', unit: 'h', digits: 2, timing: 'night', effect: true },
  { key: 'remHours', label: 'Sono REM', group: 'Sono', unit: 'h', digits: 2, timing: 'night', effect: true },
  { key: 'awakeMin', label: 'Tempo acordado à noite', group: 'Sono', unit: 'min', digits: 0, timing: 'night', effect: true },
  { key: 'bedtime', label: 'Hora de dormir', group: 'Sono', unit: 'clock', digits: 2, timing: 'night', cause: true },
  { key: 'hrv', label: 'HRV da noite', group: 'Recuperação', unit: 'ms', digits: 0, timing: 'night', effect: true },
  { key: 'restingHr', label: 'FC de repouso', group: 'Recuperação', unit: 'bpm', digits: 0, timing: 'night', effect: true },
  { key: 'bodyBattery', label: 'Body Battery máximo', group: 'Recuperação', unit: '', digits: 0, timing: 'night', effect: true },
  { key: 'stress', label: 'Estresse médio', group: 'Dia', unit: '', digits: 0, timing: 'day', cause: true, effect: true },
  { key: 'steps', label: 'Passos', group: 'Dia', unit: '', digits: 0, timing: 'day', cause: true, effect: true },
  { key: 'activeCalories', label: 'Calorias ativas', group: 'Dia', unit: 'kcal', digits: 0, timing: 'day', cause: true },
  { key: 'activityMinutes', label: 'Minutos de atividade', group: 'Treino', unit: 'min', digits: 0, timing: 'day', cause: true },
  { key: 'runKm', label: 'Corrida', group: 'Treino', unit: 'km', digits: 1, timing: 'day', cause: true },
  { key: 'trainingEffect', label: 'Efeito de treino', group: 'Treino', unit: '', digits: 1, timing: 'day', cause: true },
  {
    key: 'strengthDay',
    label: 'Dia de musculação',
    group: 'Treino',
    unit: '',
    digits: 0,
    timing: 'day',
    binary: true,
    phrase: 'dias de musculação',
    cause: true,
  },
  { key: 'kcal', label: 'Calorias consumidas', group: 'Alimentação', unit: 'kcal', digits: 0, timing: 'day', cause: true, effect: true },
  { key: 'protein', label: 'Proteína', group: 'Alimentação', unit: 'g', digits: 0, timing: 'day', cause: true },
  { key: 'carbs', label: 'Carboidratos', group: 'Alimentação', unit: 'g', digits: 0, timing: 'day', cause: true },
  { key: 'fat', label: 'Gorduras', group: 'Alimentação', unit: 'g', digits: 0, timing: 'day', cause: true },
  { key: 'water', label: 'Água', group: 'Alimentação', unit: 'L', digits: 1, timing: 'day', cause: true },
  { key: 'weight', label: 'Peso', group: 'Corpo', unit: 'kg', digits: 1, timing: 'night' },
  { key: 'bodyFat', label: 'Gordura corporal', group: 'Corpo', unit: '%', digits: 1, timing: 'night' },
  // The change shows the morning after: what was eaten one day meets the next weigh-in.
  { key: 'weightChange', label: 'Variação do peso', group: 'Corpo', unit: 'kg', digits: 2, timing: 'night', signed: true, effect: true },
]

/** 23.5 -> "23:30", 24.5 -> "00:30" (bedtimes past midnight count as 24+). */
function clock(hours: number): string {
  const minutes = Math.round((hours % 24) * 60) % (24 * 60)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function formatMetric(metric: Metric, value: number): string {
  switch (metric.unit) {
    case 'clock':
      return clock(value)
    case 'h':
      return formatDuration(value * 3_600_000)
    case 'min':
      return `${Math.round(value)} min`
  }
  // Rounded first, so a tiny loss doesn't read "-0" and a gain gets its "+".
  const rounded = Number(value.toFixed(metric.digits)) || 0
  const text = formatNumber(rounded, metric.digits) + (metric.unit ? ` ${metric.unit}` : '')
  return metric.signed && rounded > 0 ? `+${text}` : text
}

/** Hours and clock times tick on quarter hours, half hours or whole hours, not on ECharts' 18 minutes. */
export function hourAxis(metric: Metric, values: number[]): { min?: number; max?: number; interval?: number } {
  if ((metric.unit !== 'h' && metric.unit !== 'clock') || values.length === 0) return {}
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const step = [0.25, 0.5, 1, 2, 3].find((size) => (hi - lo) / size <= 5) ?? 6
  const min = Math.floor(lo / step) * step
  return { min, max: Math.max(Math.ceil(hi / step) * step, min + step), interval: step }
}

/** Bedtime in hours, counting past midnight as 24+ so 23:30 → 23.5 and 00:30 → 24.5. */
function bedtimeHours(start: number): number {
  const date = new Date(start)
  const hours = date.getHours() + date.getMinutes() / 60
  return hours < 12 ? hours + 24 : hours
}

function add(rows: Map<DayKey, DayRow>, day: DayKey, key: string, value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return
  const row = rows.get(day)
  if (row) row[key] = value
  else rows.set(day, { [key]: value })
}

function sumBy<T>(items: T[], day: (item: T) => DayKey, value: (item: T) => number): Map<DayKey, number> {
  const sums = new Map<DayKey, number>()
  for (const item of items) sums.set(day(item), (sums.get(day(item)) ?? 0) + value(item))
  return sums
}

/**
 * One row per day with every measure the app has, from `from` to `to`. Activity counts are 0 on
 * days without any (but only once activities exist), food and water only on days with entries.
 */
export function buildDailyData(sources: Sources, from: DayKey, to: DayKey): DailyData {
  const rows = new Map<DayKey, DayRow>()
  const days = dayRange(from, to)

  for (const day of sources.health) {
    if (day.id < from || day.id > to) continue
    const sleep = day.sleep
    add(rows, day.id, 'sleepHours', sleep && sleep.totalSec / 3600)
    add(rows, day.id, 'sleepScore', sleep?.score)
    add(rows, day.id, 'deepHours', sleep?.deepSec !== undefined ? sleep.deepSec / 3600 : undefined)
    add(rows, day.id, 'remHours', sleep?.remSec !== undefined ? sleep.remSec / 3600 : undefined)
    add(rows, day.id, 'awakeMin', sleep?.awakeSec !== undefined ? sleep.awakeSec / 60 : undefined)
    add(rows, day.id, 'bedtime', sleep?.start !== undefined ? bedtimeHours(sleep.start) : undefined)
    add(rows, day.id, 'hrv', day.hrv?.lastNight)
    add(rows, day.id, 'restingHr', day.restingHr)
    add(rows, day.id, 'bodyBattery', day.bodyBattery?.high)
    add(rows, day.id, 'stress', day.stress?.avg)
    add(rows, day.id, 'steps', day.steps)
    add(rows, day.id, 'activeCalories', day.calories?.active)
  }

  // First weigh-in of each day, and the change since the day before.
  const weighIns = new Map<DayKey, WeightEntry>()
  for (const entry of [...sources.weights].sort((a, b) => a.time - b.time)) {
    if (!weighIns.has(entry.date)) weighIns.set(entry.date, entry)
  }
  for (const day of days) {
    const entry = weighIns.get(day)
    if (!entry) continue
    add(rows, day, 'weight', entry.weightKg)
    add(rows, day, 'bodyFat', entry.bodyFatPct)
    const before = weighIns.get(shiftDay(day, -1))
    if (before) add(rows, day, 'weightChange', entry.weightKg - before.weightKg)
  }

  // Training: zero on days without one, from the first day the app knows about any.
  const finished = sources.sessions.filter((session) => session.endedAt)
  const knownSince = [...sources.activities.map((a) => a.date), ...finished.map((s) => s.date)].sort()[0]
  if (knownSince) {
    const minutes = sumBy(sources.activities, (a) => a.date, (a) => a.timerSec / 60)
    const run = sumBy(
      sources.activities.filter((a) => a.sport === 'running'),
      (a) => a.date,
      (a) => (a.distanceM ?? 0) / 1000,
    )
    const effect = sumBy(sources.activities, (a) => a.date, (a) => a.aerobicEffect ?? 0)
    const strength = new Set([
      ...sources.activities.filter((a) => a.subSport === 'strengthTraining').map((a) => a.date),
      ...finished.map((s) => s.date),
    ])
    for (const day of days) {
      if (day < knownSince) continue
      add(rows, day, 'activityMinutes', minutes.get(day) ?? 0)
      add(rows, day, 'runKm', run.get(day) ?? 0)
      add(rows, day, 'trainingEffect', effect.get(day) ?? 0)
      add(rows, day, 'strengthDay', strength.has(day) ? 1 : 0)
    }
  }

  // Food and water only where something was logged: an empty day is a missing log, not a fast.
  const totals = new Map<DayKey, { kcal: number; protein: number; carbs: number; fat: number }>()
  for (const log of sources.foodLogs) {
    const total = totals.get(log.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    total.kcal += log.nutrients.kcal
    total.protein += log.nutrients.protein
    total.carbs += log.nutrients.carbs
    total.fat += log.nutrients.fat
    totals.set(log.date, total)
  }
  for (const [day, total] of totals) {
    if (day < from || day > to) continue
    add(rows, day, 'kcal', total.kcal)
    add(rows, day, 'protein', total.protein)
    add(rows, day, 'carbs', total.carbs)
    add(rows, day, 'fat', total.fat)
  }
  for (const [day, ml] of sumBy(sources.waterLogs, (log) => log.date, (log) => log.ml)) {
    if (day >= from && day <= to) add(rows, day, 'water', ml / 1000)
  }

  // Habits: a missing log on a day the habit existed means not done (0).
  const habitMetrics: Metric[] = []
  const values = new Map<string, number>()
  for (const log of sources.habitLogs) values.set(`${log.habitId}:${log.date}`, log.value)
  const today = dayKey()
  for (const habit of sources.habits) {
    const key = `habit:${habit.id}`
    const binary = habit.kind === 'check'
    habitMetrics.push({
      key,
      label: habit.name,
      group: 'Hábitos',
      unit: binary ? '' : (habit.unit ?? ''),
      digits: 1,
      timing: 'day',
      binary,
      phrase: `dias com «${habit.name}»`,
      cause: true,
    })
    for (const day of days) {
      if (day < habit.startDate || day > today) continue
      const value = values.get(`${habit.id}:${day}`) ?? 0
      add(rows, day, key, binary ? (value > 0 ? 1 : 0) : value)
    }
  }

  return { metrics: [...BASE_METRICS, ...habitMetrics], rows }
}

/** Metrics with at least `min` days of values in the rows. */
export function availableMetrics(data: DailyData, min = 1): Metric[] {
  return data.metrics.filter((metric) => {
    let count = 0
    for (const row of data.rows.values()) if (row[metric.key] !== undefined && ++count >= min) return true
    return false
  })
}
