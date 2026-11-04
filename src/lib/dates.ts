import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** A calendar day in local time, formatted yyyy-MM-dd (sorts as a string). */
export type DayKey = string

export const dayKey = (date: Date | number = new Date()): DayKey => format(date, 'yyyy-MM-dd')

export const parseDay = (key: DayKey): Date => parseISO(key)

export const shiftDay = (key: DayKey, days: number): DayKey => dayKey(addDays(parseDay(key), days))

export const daysBetween = (from: DayKey, to: DayKey): number =>
  differenceInCalendarDays(parseDay(to), parseDay(from))

export const formatDay = (key: DayKey, pattern = "EEEE, d 'de' MMMM"): string =>
  format(parseDay(key), pattern, { locale: ptBR })

export const formatTime = (time: number): string => format(time, 'HH:mm')

/** "hoje", "ontem" or "3 de nov." */
export function relativeDay(key: DayKey, today: DayKey): string {
  if (key === today) return 'hoje'
  if (key === shiftDay(today, -1)) return 'ontem'
  return formatDay(key, "d 'de' MMM")
}

/** Day keys from `from` to `to`, both included. */
export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const days: DayKey[] = []
  for (let day = from; day <= to; day = shiftDay(day, 1)) days.push(day)
  return days
}

/** Weeks start on Sunday everywhere in the app (the calendar, "Minha semana", the weekly summaries). */
export const WEEK_STARTS_ON = 0

/** The Sunday that starts the week of a day. */
export const weekStart = (key: DayKey): DayKey => dayKey(startOfWeek(parseDay(key), { weekStartsOn: WEEK_STARTS_ON }))

/** Combines a day key and an "HH:mm" string into a local timestamp. */
export function dayTime(key: DayKey, time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  const date = parseDay(key)
  date.setHours(hours || 0, minutes || 0, 0, 0)
  return date.getTime()
}
