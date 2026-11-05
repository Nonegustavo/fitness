import { useLiveQuery } from 'dexie-react-hooks'
import { alive, patch, remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Habit, HabitLog } from '../../db/types'
import { shiftDay, type DayKey } from '../../lib/dates'

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

const MAX_STREAK_DAYS = 3650

/**
 * Consecutive successful days up to today. Today only counts once it is a success, so a goal not
 * met yet today doesn't break yesterday's streak; skipped days are stepped over, adding nothing.
 */
export function streak(habit: Habit, days: HabitDays, today: DayKey): number {
  const met = (day: DayKey) => isSuccess(habit, days.values.get(day))
  let day = met(today) && !days.skipped.has(today) ? today : shiftDay(today, -1)
  let count = 0
  for (let walked = 0; walked < MAX_STREAK_DAYS && day >= habit.startDate; walked++, day = shiftDay(day, -1)) {
    if (days.skipped.has(day)) continue
    if (!met(day)) break
    count++
  }
  return count
}

/**
 * Share of days meeting the habit between two days, ignoring days before the habit started and the
 * days skipped; undefined when no day is left.
 */
export function successRate(habit: Habit, days: HabitDays, from: DayKey, to: DayKey): number | undefined {
  const start = from < habit.startDate ? habit.startDate : from
  let counted = 0
  let hits = 0
  for (let day = start; day <= to; day = shiftDay(day, 1)) {
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

/** "Meta: 2 doses", "Evitar", … */
export function describeHabit(habit: Habit): string {
  const unit = habit.unit ? ` ${habit.unit}` : ''
  if (habit.kind === 'count' && habit.target !== undefined) {
    return habit.polarity === 'good' ? `Meta: ${habit.target}${unit}` : `Limite: ${habit.target}${unit}`
  }
  const goal = habit.polarity === 'good' ? 'Fazer' : 'Evitar'
  return habit.kind === 'count' && habit.unit ? `${goal} · ${habit.unit}` : goal
}
