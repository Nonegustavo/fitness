import { useLiveQuery } from 'dexie-react-hooks'
import { alive, patch, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Habit, HabitLog } from '../../db/types'
import { shiftDay, type DayKey } from '../../lib/dates'

export type HabitTemplate = Pick<Habit, 'name' | 'kind' | 'polarity' | 'unit' | 'target'>

export const HABIT_SUGGESTIONS: HabitTemplate[] = [
  { name: 'Álcool', kind: 'count', unit: 'doses', polarity: 'bad' },
  { name: 'Cafeína depois das 16h', kind: 'check', polarity: 'bad' },
  { name: 'Tela na cama', kind: 'check', polarity: 'bad' },
  { name: 'Doces', kind: 'check', polarity: 'bad' },
  { name: 'Alongamento', kind: 'check', polarity: 'good' },
  { name: 'Creatina', kind: 'check', polarity: 'good' },
  { name: 'Meditação', kind: 'check', polarity: 'good' },
  { name: 'Leitura antes de dormir', kind: 'check', polarity: 'good' },
]

export const habitLogId = (habitId: string, date: DayKey): string => `${habitId}:${date}`

/** Whether a day's value meets the habit: reaching the goal, or staying within the limit. */
export function isSuccess(habit: Habit, value = 0): boolean {
  if (habit.polarity === 'good') return value >= (habit.kind === 'count' ? (habit.target ?? 1) : 1)
  return value <= (habit.kind === 'count' ? (habit.target ?? 0) : 0)
}

const MAX_STREAK_DAYS = 3650

/**
 * Consecutive successful days up to today. Today only counts once it is a success,
 * so a goal not met yet today doesn't break yesterday's streak.
 */
export function streak(habit: Habit, values: Map<DayKey, number>, today: DayKey): number {
  let day = isSuccess(habit, values.get(today)) ? today : shiftDay(today, -1)
  let count = 0
  while (count < MAX_STREAK_DAYS && day >= habit.startDate && isSuccess(habit, values.get(day))) {
    count++
    day = shiftDay(day, -1)
  }
  return count
}

/** Share of days meeting the habit between two days, ignoring days before the habit started. */
export function successRate(habit: Habit, values: Map<DayKey, number>, from: DayKey, to: DayKey): number | undefined {
  const start = from < habit.startDate ? habit.startDate : from
  if (start > to) return undefined
  let days = 0
  let hits = 0
  for (let day = start; day <= to; day = shiftDay(day, 1)) {
    days++
    if (isSuccess(habit, values.get(day))) hits++
  }
  return hits / days
}

/** habitId -> (day -> value). */
export function valuesByHabit(logs: HabitLog[]): Map<string, Map<DayKey, number>> {
  const byHabit = new Map<string, Map<DayKey, number>>()
  for (const log of logs) {
    let days = byHabit.get(log.habitId)
    if (!days) byHabit.set(log.habitId, (days = new Map()))
    days.set(log.date, log.value)
  }
  return byHabit
}

export async function setHabitValue(habit: Habit, date: DayKey, value: number): Promise<void> {
  await save(db.habitLogs, { id: habitLogId(habit.id, date), habitId: habit.id, date, value: Math.max(value, 0) })
  // Logging a day before the habit existed (backfilling) moves its start back.
  if (date < habit.startDate) await patch(db.habits, habit.id, { startDate: date })
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
