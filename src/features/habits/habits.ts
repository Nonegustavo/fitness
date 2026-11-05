import { useLiveQuery } from 'dexie-react-hooks'
import { alive, patch, remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Habit, HabitLog } from '../../db/types'
import { daysBetween, shiftDay, weekStart, type DayKey } from '../../lib/dates'

export type HabitTemplate = Pick<Habit, 'name' | 'kind' | 'polarity' | 'unit' | 'target' | 'icon'>

export const HABIT_SUGGESTIONS: HabitTemplate[] = [
  { name: 'Álcool', kind: 'count', unit: 'doses', polarity: 'bad', icon: 'wine' },
  { name: 'Cafeína depois das 16h', kind: 'check', polarity: 'bad', icon: 'coffee' },
  { name: 'Tela na cama', kind: 'check', polarity: 'bad', icon: 'phone' },
  { name: 'Doces', kind: 'check', polarity: 'bad', icon: 'candy' },
  { name: 'Alongamento', kind: 'check', polarity: 'good', icon: 'stretch' },
  { name: 'Creatina', kind: 'check', polarity: 'good', icon: 'pill' },
  { name: 'Meditação', kind: 'check', polarity: 'good', icon: 'meditate' },
  { name: 'Leitura antes de dormir', kind: 'check', polarity: 'good', icon: 'book' },
]

export const habitLogId = (habitId: string, date: DayKey): string => `${habitId}:${date}`

/** When in the day the habit is done ("07:30"); older habits only had it in the reminder. */
export const habitTime = (habit: Pick<Habit, 'time' | 'reminder'>): string | undefined => habit.time ?? habit.reminder?.time

/** Whether the day was set aside ("Hoje não vou fazer"): it neither counts nor breaks anything. */
export const isSkipped = (log: Pick<HabitLog, 'skipped'> | undefined): boolean => log?.skipped === 1

/** Whether a day's value meets the habit: reaching the goal, or staying within the limit. */
export function isSuccess(habit: Habit, value = 0): boolean {
  if (habit.polarity === 'good') return value >= (habit.kind === 'count' ? (habit.target ?? 1) : 1)
  return value <= (habit.kind === 'count' ? (habit.target ?? 0) : 0)
}

/**
 * A weekly habit's target, 1 to 6 days a week (at least that many to do, at most to avoid);
 * undefined for a daily one. Seven a week is every day.
 */
export function weeklyTimes(habit: Pick<Habit, 'frequency'>): number | undefined {
  const times = habit.frequency?.per === 'week' ? Math.round(habit.frequency.times) : undefined
  return times !== undefined && times >= 1 && times <= 6 ? times : undefined
}

/** "3 vezes por semana", "até 2 dias por semana"; undefined for a daily habit. */
export function frequencyText(habit: Pick<Habit, 'frequency' | 'polarity'>): string | undefined {
  const times = weeklyTimes(habit)
  if (times === undefined) return undefined
  return habit.polarity === 'good'
    ? `${times} ${times === 1 ? 'vez' : 'vezes'} por semana`
    : `até ${times} ${times === 1 ? 'dia' : 'dias'} por semana`
}

/** What a habit's logs say about each day: the value, and the days skipped. */
export interface HabitDays {
  values: Map<DayKey, number>
  skipped: Set<DayKey>
}

export const NO_DAYS: HabitDays = { values: new Map(), skipped: new Set() }

/** habitId -> its days. A skipped day keeps its value, but the skip is what counts. */
export function daysByHabit(logs: Pick<HabitLog, 'habitId' | 'date' | 'value' | 'skipped'>[]): Map<string, HabitDays> {
  const byHabit = new Map<string, HabitDays>()
  for (const log of logs) {
    let days = byHabit.get(log.habitId)
    if (!days) byHabit.set(log.habitId, (days = { values: new Map(), skipped: new Set() }))
    days.values.set(log.date, log.value)
    if (isSkipped(log)) days.skipped.add(log.date)
  }
  return byHabit
}

const pad = (n: number) => (n < 10 ? `0${n}` : String(n))

/**
 * shiftDay for the day-by-day walks (a year of days per habit for the strength): the same key,
 * about 30 times faster than through date-fns. Noon keeps a daylight-saving change off the date.
 */
export function stepDay(key: DayKey, days: number): DayKey {
  const date = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + days, 12)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * How a week went: 'met' counts, 'missed' breaks, 'open' is a week not over and not met yet (it
 * breaks nothing), 'aside' one with every day skipped, or the first, started too late in the week
 * to reach the target.
 */
export type WeekOutcome = 'met' | 'missed' | 'open' | 'aside'

/** A weekly habit's week, Sunday to Saturday. */
export interface WeekResult {
  /** Its Sunday. */
  week: DayKey
  /** The days that count: done (to do) or past the day's limit (to avoid); skipped ones left out. */
  count: number
  /** At least (to do) or at most (to avoid) this many days. */
  times: number
  /** Reached (to do), or still within the limit (to avoid). */
  met: boolean
  outcome: WeekOutcome
}

/**
 * A weekly habit's week (its Sunday) as of `today`, the day in progress: a week still going isn't
 * missed yet. Skipped days drop out of the week's days without lowering the target, so a week
 * with every day skipped is set aside, and one with too few days left can be missed.
 */
export function weekResult(habit: Habit, days: HabitDays, week: DayKey, today: DayKey): WeekResult {
  const times = weeklyTimes(habit) ?? 7
  const first = week < habit.startDate ? habit.startDate : week
  const last = stepDay(week, 6)
  let count = 0
  let available = 0
  for (let day = first; day <= last; day = stepDay(day, 1)) {
    if (days.skipped.has(day)) continue
    available++
    const success = isSuccess(habit, days.values.get(day))
    if (habit.polarity === 'good' ? success : !success) count++
  }
  const met = habit.polarity === 'good' ? count >= times : count <= times
  let outcome: WeekOutcome = 'missed'
  if (available === 0) outcome = 'aside'
  else if (met) outcome = 'met'
  else if (last >= today) outcome = 'open'
  // Created on a Friday, a habit of 3 days a week had no way to make its first week.
  else if (habit.polarity === 'good' && daysBetween(first, last) + 1 < times) outcome = 'aside'
  return { week, count, times, met, outcome }
}

/** Each weekly habit's week, the one `day` is in, from logs that cover it. */
export function weekResults(
  habits: Habit[],
  logs: Pick<HabitLog, 'habitId' | 'date' | 'value' | 'skipped'>[],
  day: DayKey,
  today: DayKey,
): Map<string, WeekResult> {
  const week = weekStart(day)
  const byHabit = daysByHabit(logs)
  return new Map(
    habits.flatMap((habit) =>
      weeklyTimes(habit) === undefined ? [] : [[habit.id, weekResult(habit, byHabit.get(habit.id) ?? NO_DAYS, week, today)] as const],
    ),
  )
}

/** "2/3 na semana": the days done (or, to avoid, the days it happened) against the target. */
export const weekProgressText = (week: Pick<WeekResult, 'count' | 'times'>): string => `${week.count}/${week.times} na semana`

const MAX_STREAK_DAYS = 3650
const MAX_STREAK_WEEKS = 520

/**
 * Consecutive successful days up to today, or weeks for a weekly habit. Today (the current week)
 * only counts once it is a success, so a goal not met yet doesn't break the streak; skipped days,
 * and weeks set aside, are stepped over, adding nothing.
 */
export function streak(habit: Habit, days: HabitDays, today: DayKey): number {
  if (weeklyTimes(habit) !== undefined) return weekStreak(habit, days, today)
  const met = (day: DayKey) => isSuccess(habit, days.values.get(day))
  let day = met(today) && !days.skipped.has(today) ? today : stepDay(today, -1)
  let count = 0
  for (let walked = 0; walked < MAX_STREAK_DAYS && day >= habit.startDate; walked++, day = stepDay(day, -1)) {
    if (days.skipped.has(day)) continue
    if (!met(day)) break
    count++
  }
  return count
}

function weekStreak(habit: Habit, days: HabitDays, today: DayKey): number {
  let count = 0
  let week = weekStart(today)
  for (let walked = 0; walked < MAX_STREAK_WEEKS && stepDay(week, 6) >= habit.startDate; walked++, week = stepDay(week, -7)) {
    const { outcome } = weekResult(habit, days, week, today)
    if (outcome === 'missed') break
    if (outcome === 'met') count++
  }
  return count
}

/** "12 dias seguidos", "5 dias sem", "3 semanas seguidas", "2 semanas dentro do limite". */
export function streakText(habit: Pick<Habit, 'frequency' | 'polarity'>, count: number): string {
  if (count === 0) return 'sem sequência'
  const one = count === 1
  if (weeklyTimes(habit) !== undefined) {
    return habit.polarity === 'good'
      ? `${count} ${one ? 'semana seguida' : 'semanas seguidas'}`
      : `${count} ${one ? 'semana' : 'semanas'} dentro do limite`
  }
  return habit.polarity === 'good' ? `${count} ${one ? 'dia seguido' : 'dias seguidos'}` : `${count} ${one ? 'dia' : 'dias'} sem`
}

/**
 * Share of days meeting the habit between two days, ignoring days before the habit started and the
 * days skipped; undefined when no day is left. A weekly habit is counted in weeks, from the one
 * `from` falls in to the one `to` falls in, and a week still going on `today` (by default the day
 * after `to`) only counts once met.
 */
export function successRate(
  habit: Habit,
  days: HabitDays,
  from: DayKey,
  to: DayKey,
  today: DayKey = stepDay(to, 1),
): number | undefined {
  const start = from < habit.startDate ? habit.startDate : from
  let counted = 0
  let hits = 0
  if (weeklyTimes(habit) !== undefined) {
    for (let week = weekStart(start); week <= to; week = stepDay(week, 7)) {
      const { outcome } = weekResult(habit, days, week, today)
      if (outcome === 'open' || outcome === 'aside') continue
      counted++
      if (outcome === 'met') hits++
    }
    return counted > 0 ? hits / counted : undefined
  }
  for (let day = start; day <= to; day = stepDay(day, 1)) {
    if (days.skipped.has(day)) continue
    counted++
    if (isSuccess(habit, days.values.get(day))) hits++
  }
  return counted > 0 ? hits / counted : undefined
}

/** The days skipped between two days (both included). */
export const skippedBetween = (days: HabitDays, from: DayKey, to: DayKey): DayKey[] =>
  [...days.skipped].filter((day) => day >= from && day <= to).sort()

/** Logging a value is doing the habit: it takes back a skip of that day. */
export async function setHabitValue(habit: Habit, date: DayKey, value: number): Promise<void> {
  await save(db.habitLogs, { id: habitLogId(habit.id, date), habitId: habit.id, date, value: Math.max(value, 0) })
  // Logging a day before the habit existed (backfilling) moves its start back.
  if (date < habit.startDate) await patch(db.habits, habit.id, { startDate: date })
}

/**
 * "Hoje não vou fazer": the day is set aside, with the reason. A count keeps what was logged; a
 * check is left undone. The start date stays: a skip before it isn't the habit's history.
 */
export async function skipHabitDay(habit: Habit, date: DayKey, note: string, current?: HabitLog): Promise<void> {
  const reason = note.trim()
  await save(db.habitLogs, {
    id: habitLogId(habit.id, date),
    habitId: habit.id,
    date,
    value: habit.kind === 'count' ? (current?.value ?? 0) : 0,
    skipped: 1,
    ...(reason && { note: reason }),
  })
}

/** Undoes a skip: what was logged stays, a day with nothing goes back to not logged. */
export async function unskipHabitDay(log: HabitLog): Promise<void> {
  if (log.value > 0) await save(db.habitLogs, { id: log.id, habitId: log.habitId, date: log.date, value: log.value })
  else await remove(db.habitLogs, log.id)
}

export function useHabits(): Habit[] | undefined {
  return useLiveQuery(async () => alive(await db.habits.toArray()).sort((a, b) => a.order - b.order))
}

export function useHabitLogs(from: DayKey, to: DayKey): HabitLog[] | undefined {
  return useLiveQuery(
    async () => alive(await db.habitLogs.where('date').between(from, to, true, true).toArray()),
    [from, to],
  )
}

/** The logs of the week (Sunday to Saturday) a day is in: the day's, and the weekly habits' progress. */
export function useWeekLogs(day: DayKey): HabitLog[] | undefined {
  const sunday = weekStart(day)
  return useHabitLogs(sunday, shiftDay(sunday, 6))
}

/** "Meta: 2 doses", "Evitar", "Fazer · 3 vezes por semana"… `frequency: false` leaves the week out. */
export function describeHabit(habit: Habit, { frequency = true }: { frequency?: boolean } = {}): string {
  const unit = habit.unit ? ` ${habit.unit}` : ''
  const weekly = frequency ? frequencyText(habit) : undefined
  const withWeek = (text: string) => (weekly ? `${text} · ${weekly}` : text)
  if (habit.kind === 'count' && habit.target !== undefined) {
    return withWeek(habit.polarity === 'good' ? `Meta: ${habit.target}${unit}` : `Limite: ${habit.target}${unit}`)
  }
  const goal = habit.polarity === 'good' ? 'Fazer' : 'Evitar'
  return withWeek(habit.kind === 'count' && habit.unit ? `${goal} · ${habit.unit}` : goal)
}
