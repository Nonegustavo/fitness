import type { Habit, HabitLog } from '../../db/types'
import { dayKey, type DayKey } from '../../lib/dates'
import { habitLogId, isSuccess } from '../habits/habits'

/** Reminders go this far ahead, so they keep coming even if the app isn't opened for a while. */
export const HORIZON_DAYS = 14

export const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
export const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export interface PlannedReminder {
  id: number
  at: Date
  habitId: string
  date: DayKey
  title: string
  body: string
  /** Done/not-done habits get a "Feito" button on the notification. */
  canCheck: boolean
}

/** A stable 32-bit notification id for a key, kept clear of the fixed ids below 10 000. */
export function notificationId(key: string): number {
  let hash = 0
  for (const char of key) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0
  return 10_000 + (Math.abs(hash) % 2_000_000_000)
}

/**
 * Every reminder from `now` to the horizon: on the habit's weekdays, at its time, skipping days
 * already met (a goal reached) or already logged (a habit to avoid).
 */
export function plannedReminders(habits: Habit[], logs: HabitLog[], now: Date): PlannedReminder[] {
  const values = new Map(logs.filter((log) => !log.deleted).map((log) => [log.id, log.value]))
  const planned: PlannedReminder[] = []
  for (const habit of habits) {
    const reminder = habit.reminder
    if (!reminder || habit.archived || habit.deleted || reminder.days.length === 0) continue
    const [hour, minute] = reminder.time.split(':').map(Number)
    for (let offset = 0; offset < HORIZON_DAYS; offset++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute)
      if (at <= now || !reminder.days.includes(at.getDay())) continue
      const date = dayKey(at)
      const value = values.get(habitLogId(habit.id, date))
      if (habit.polarity === 'good' ? isSuccess(habit, value) : value !== undefined) continue
      planned.push({
        id: notificationId(habitLogId(habit.id, date)),
        at,
        habitId: habit.id,
        date,
        title: habit.name,
        body:
          habit.polarity === 'bad'
            ? 'Toque para registrar o dia.'
            : habit.kind === 'check'
              ? 'Já fez hoje? Toque em Feito para marcar.'
              : 'Como está hoje? Toque para registrar.',
        canCheck: habit.kind === 'check' && habit.polarity === 'good',
      })
    }
  }
  return planned
}

/** "Todo dia às 20:30", "Seg a sex às 07:00", "Ter, qui às 18:00". */
export function describeReminder(reminder: { time: string; days: number[] }): string {
  const days = [...reminder.days].sort()
  const when =
    days.length === 7
      ? 'Todo dia'
      : days.join() === '1,2,3,4,5'
        ? 'Seg a sex'
        : days.join() === '0,6'
          ? 'Fim de semana'
          : days.map((day) => WEEKDAY_NAMES[day].slice(0, 3)).join(', ')
  return `${when.charAt(0).toUpperCase()}${when.slice(1)} às ${reminder.time}`
}
