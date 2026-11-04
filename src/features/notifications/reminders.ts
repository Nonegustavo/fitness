import type { Habit, HabitLog, MealKey, SmartReminders } from '../../db/types'
import { dayKey, shiftDay, type DayKey } from '../../lib/dates'
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

/** Smart reminders cover the next days too, in case the app isn't opened (a weigh-in still syncs on opening). */
export const SMART_DAYS = 7

/** When the water pace is checked, and the day it is spread over (07:00 to 22:00). */
export const WATER_CHECKS = [11, 15, 19]
const WATER_DAY = { from: 7, to: 22 }
/** Some room before calling it behind: one glass. */
const WATER_SLACK_ML = 250

/** What a day already has, as far as the smart reminders care. */
export interface DayStatus {
  weighed: boolean
  meals: Set<MealKey>
  waterMl: number
}

export interface SmartReminder {
  id: number
  at: Date
  date: DayKey
  kind: 'weighIn' | 'lunch' | 'dinner' | 'water'
  title: string
  body: string
  /** The screen the notification opens. */
  route: string
}

/** The water the day should have by an hour, spread evenly over the waking hours. */
export const waterExpectedBy = (hour: number, goalMl: number): number =>
  goalMl * Math.min(1, Math.max(0, (hour - WATER_DAY.from) / (WATER_DAY.to - WATER_DAY.from)))

const liters = (ml: number) => `${(Math.round(ml / 100) / 10).toString().replace('.', ',')} L`

/**
 * The reminders still worth sending, from `now` over the next days: only where the thing is
 * missing (no weigh-in, nothing at lunch, water behind pace). Days not opened yet count as empty.
 */
export function plannedSmartReminders(
  settings: SmartReminders | undefined,
  status: Map<DayKey, DayStatus>,
  waterGoalMl: number,
  now: Date,
): SmartReminder[] {
  if (!settings) return []
  const planned: SmartReminder[] = []
  const at = (offset: number, clock: string) => {
    const [hour, minute] = clock.split(':').map(Number)
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour || 0, minute || 0)
  }
  const add = (reminder: Omit<SmartReminder, 'id'>) => {
    if (reminder.at > now) planned.push({ ...reminder, id: notificationId(`smart:${reminder.kind}:${reminder.at.getTime()}`) })
  }
  for (let offset = 0; offset < SMART_DAYS; offset++) {
    const date = shiftDay(dayKey(now), offset)
    const day = status.get(date) ?? { weighed: false, meals: new Set<MealKey>(), waterMl: 0 }
    if (settings.weighIn && !day.weighed) {
      add({
        at: at(offset, settings.weighIn),
        date,
        kind: 'weighIn',
        title: 'Pesagem de hoje',
        body: 'Ainda não há pesagem hoje. Abra para sincronizar com a balança ou registrar.',
        route: '/corpo?novo=peso',
      })
    }
    for (const meal of ['lunch', 'dinner'] as const) {
      const clock = settings[meal]
      if (!clock || day.meals.has(meal)) continue
      const label = meal === 'lunch' ? 'almoço' : 'jantar'
      add({
        at: at(offset, clock),
        date,
        kind: meal,
        title: `Registrar o ${label}`,
        body: `Nada registrado no ${label} ainda. Toque para adicionar.`,
        route: `/alimentacao/adicionar?refeicao=${meal}&data=${date}`,
      })
    }
    if (settings.water && waterGoalMl > 0) {
      for (const hour of WATER_CHECKS) {
        const expected = waterExpectedBy(hour, waterGoalMl)
        if (day.waterMl >= expected - WATER_SLACK_ML) continue
        add({
          at: at(offset, `${hour}:00`),
          date,
          kind: 'water',
          title: 'Água',
          body:
            offset === 0
              ? `Até agora ${liters(day.waterMl)} de ${liters(waterGoalMl)}. No ritmo do dia, já seriam ${liters(expected)}.`
              : `No ritmo do dia, já seriam ${liters(expected)} de ${liters(waterGoalMl)}.`,
          route: '/agua',
        })
      }
    }
  }
  return planned
}
