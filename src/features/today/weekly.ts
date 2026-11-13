import type { DailyHealth, FoodLog, Habit, HabitLog, MacroGoals, WaterLog, WorkoutSession } from '../../db/types'
import { daysBetween, formatDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatDuration, formatNumber, formatSigned } from '../../lib/format'
import { periodEnd, periodStart, shiftPeriod } from '../../lib/periods'
import type { DayValue } from '../../lib/stats'
import { daysByHabit, NO_DAYS, successRate } from '../habits/habits'
import { summarize } from '../training/stats'

export interface WeekStats {
  from: DayKey
  to: DayKey
  /** Days with food logged. */
  foodDays: number
  /** Averages over the days with food logged. */
  kcal?: number
  protein?: number
  /** Days with food logged within 10% of that day's calorie goal. */
  onTarget?: number
  workouts: number
  sets: number
  activities: number
  sleepHours?: number
  steps?: number
  /** Weight trend at the end of the week minus at its start. */
  weightChange?: number
  /** Average liters a day, over the days with water logged. */
  waterL?: number
  /**
   * Share of habit-days met, the skipped ones left out, averaged over the habits; a weekly habit
   * counts as its week, met or not.
   */
  habits?: number
}

export interface WeekSources {
  foodLogs: FoodLog[]
  sessions: WorkoutSession[]
  activityDates: DayKey[]
  health: DailyHealth[]
  weightTrend: DayValue[]
  water: WaterLog[]
  habits: Habit[]
  habitLogs: HabitLog[]
  /** The calorie goal of a day (training days may differ). */
  goalOn: (date: DayKey) => MacroGoals | undefined
}

const average = (values: number[]): number | undefined =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined

/** The trend at the latest point on or before a day. */
const trendAt = (trend: DayValue[], date: DayKey): number | undefined => {
  let found: number | undefined
  for (const point of trend) {
    if (point.date > date) break
    found = point.value
  }
  return found
}

/** Everything a week did, for the Sunday review against the week before. */
export function weekStats(from: DayKey, to: DayKey, s: WeekSources): WeekStats {
  const inWeek = (date: DayKey) => date >= from && date <= to

  const kcalByDay = new Map<DayKey, { kcal: number; protein: number }>()
  for (const log of s.foodLogs) {
    if (!inWeek(log.date)) continue
    const day = kcalByDay.get(log.date) ?? { kcal: 0, protein: 0 }
    kcalByDay.set(log.date, { kcal: day.kcal + log.nutrients.kcal, protein: day.protein + log.nutrients.protein })
  }
  const foodDays = [...kcalByDay.entries()]
  const withGoal = foodDays.filter(([date]) => s.goalOn(date))
  const onTarget = withGoal.length
    ? withGoal.filter(([date, day]) => Math.abs(day.kcal - s.goalOn(date)!.kcal) <= s.goalOn(date)!.kcal * 0.1).length
    : undefined

  const sessions = s.sessions.filter((session) => session.endedAt && inWeek(session.date))
  const health = s.health.filter((day) => inWeek(day.id))

  const waterByDay = new Map<DayKey, number>()
  for (const log of s.water) if (inWeek(log.date)) waterByDay.set(log.date, (waterByDay.get(log.date) ?? 0) + log.ml)

  const habitDays = daysByHabit(s.habitLogs)
  const rates = s.habits
    .filter((habit) => !habit.archived)
    .flatMap((habit) => {
      const rate = successRate(habit, habitDays.get(habit.id) ?? NO_DAYS, from, to)
      return rate === undefined ? [] : [rate]
    })

  const start = trendAt(s.weightTrend, from)
  const end = trendAt(s.weightTrend, to)
  return {
    from,
    to,
    foodDays: foodDays.length,
    kcal: average(foodDays.map(([, day]) => day.kcal)),
    protein: average(foodDays.map(([, day]) => day.protein)),
    onTarget,
    workouts: sessions.length,
    sets: sessions.reduce((total, session) => total + summarize(session).sets, 0),
    activities: s.activityDates.filter(inWeek).length,
    sleepHours: average(health.flatMap((day) => (day.sleep ? [day.sleep.totalSec / 3600] : []))),
    steps: average(health.flatMap((day) => (day.steps ? [day.steps] : []))),
    weightChange: start !== undefined && end !== undefined && start !== end ? end - start : undefined,
    waterL: average([...waterByDay.values()].map((ml) => ml / 1000)),
    habits: average(rates),
  }
}

/** The periods the summary page steps through. */
export type SummaryGrain = 'week' | 'month'

export interface DaySpan {
  from: DayKey
  to: DayKey
}

export interface SummaryPeriod extends DaySpan {
  grain: SummaryGrain
  /** The month going on: it ends today. */
  partial: boolean
  /** What it is compared with: the period before, or as many days of it while this one is still going. */
  before: DaySpan
  /** Whether a later period can be shown: weeks stop at the last complete one, months at the current one. */
  canForward: boolean
}

/** The latest period the summary shows: the last complete week, or the month going on. */
const latestStart = (grain: SummaryGrain, today: DayKey): DayKey =>
  grain === 'week' ? shiftPeriod('week', today, -1) : periodStart('month', today)

/** The summary's period that holds `day`, or the latest one when there is none or it is past that. */
export function summaryPeriod(grain: SummaryGrain, day: DayKey | undefined, today: DayKey): SummaryPeriod {
  const latest = latestStart(grain, today)
  const asked = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? periodStart(grain, day) : latest
  const from = asked < latest ? asked : latest
  const end = periodEnd(grain, from)
  const partial = end > today
  const to = partial ? today : end
  const beforeFrom = shiftPeriod(grain, from, -1)
  const beforeEnd = periodEnd(grain, beforeFrom)
  // A month still going is measured against as many days of the month before, so its totals compare fairly.
  const sameDays = shiftDay(beforeFrom, daysBetween(from, to))
  return {
    grain,
    from,
    to,
    partial,
    before: { from: beforeFrom, to: partial && sameDays < beforeEnd ? sameDays : beforeEnd },
    canForward: from < latest,
  }
}

/** The first day of the period `steps` periods away (−1: the one before). */
export const stepSummary = (period: SummaryPeriod, steps: number): DayKey => shiftPeriod(period.grain, period.from, steps)

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** "Semana de 1/11 a 7/11" ("1/11/25" in another year), "Outubro de 2026". */
export function summaryTitle(period: SummaryPeriod, today: DayKey): string {
  if (period.grain === 'month') return capitalize(formatDay(period.from, "MMMM 'de' yyyy"))
  const pattern = period.to.slice(0, 4) !== today.slice(0, 4) ? 'd/M/yy' : 'd/M'
  return `Semana de ${formatDay(period.from, pattern)} a ${formatDay(period.to, pattern)}`
}

/** What the period is compared with: "comparada com a semana de 25/10 a 31/10", "comparado com setembro", "comparado com 1 a 13 de outubro". */
export function beforeLabel(period: SummaryPeriod): string {
  const { from, to } = period.before
  if (period.grain === 'week') return `comparada com a semana de ${formatDay(from, 'd/M')} a ${formatDay(to, 'd/M')}`
  const year = from.slice(0, 4) === period.from.slice(0, 4) ? '' : " 'de' yyyy"
  if (period.partial) return `comparado com ${formatDay(from, 'd')} a ${formatDay(to, `d 'de' MMMM${year}`)}`
  return `comparado com ${formatDay(from, `MMMM${year}`)}`
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

/** "+120", "−0,4", or nothing when the period before had no data. */
export const delta = (now: number | undefined, then: number | undefined, digits = 0, unit = ''): string | undefined =>
  now === undefined || then === undefined ? undefined : `${formatSigned(now - then, digits)}${unit}`

/**
 * The summary's rows, each with its change from the period before. Counts (days, workouts, sets,
 * activities) are totals of the period; calories, protein, sleep, steps and water are averages over the
 * days with data, so a month reads like a week; the weight is its trend's change over the period.
 */
export function rowsOf(w: WeekStats, p: WeekStats, grain: SummaryGrain = 'week'): Row[] {
  const month = grain === 'month'
  const rows: Row[] = []
  if (month && (w.foodDays || p.foodDays))
    rows.push({ label: 'Dias com alimentação', short: 'Alimentação', value: String(w.foodDays), change: delta(w.foodDays, p.foodDays) })
  if (w.workouts || p.workouts) {
    rows.push({
      label: month ? 'Musculação no mês' : 'Musculação',
      short: 'Musculação',
      value: `${w.workouts} ${w.workouts === 1 ? 'treino' : 'treinos'}`,
      change: delta(w.workouts, p.workouts),
      key: 1,
    })
    rows.push({
      label: month ? 'Séries no mês' : 'Séries',
      value: String(w.sets),
      change: delta(w.sets, p.workouts || p.sets ? p.sets : undefined),
    })
  }
  if (w.activities || p.activities)
    rows.push({
      label: month ? 'Outras atividades no mês' : 'Outras atividades',
      short: 'Atividades',
      value: String(w.activities),
      change: delta(w.activities, p.activities),
    })
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
  if (w.weightChange !== undefined)
    rows.push({ label: month ? 'Peso no mês (tendência)' : 'Peso (tendência)', short: 'Peso', value: `${formatSigned(w.weightChange)} kg`, key: 4 })
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
