import type { Activity, DailyHealth, Habit, HabitLog, MealKey, SmartReminders, WaterLog, WorkoutSession } from '../../db/types'
import { dayKey, formatTime, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import type { AgendaItem } from '../calendar/agenda'
import { habitLogId, habitTime, isSkipped, isSuccess } from '../habits/habits'

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
 * already met (a goal reached), already logged (a habit to avoid) or set aside ("Hoje não vou fazer").
 */
export function plannedReminders(habits: Habit[], logs: HabitLog[], now: Date): PlannedReminder[] {
  const byId = new Map(logs.filter((log) => !log.deleted).map((log) => [log.id, log]))
  const planned: PlannedReminder[] = []
  for (const habit of habits) {
    const reminder = habit.reminder
    if (!reminder || habit.archived || habit.deleted || reminder.days.length === 0) continue
    const [hour, minute] = (habitTime(habit) ?? reminder.time).split(':').map(Number)
    for (let offset = 0; offset < HORIZON_DAYS; offset++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute)
      if (at <= now || !reminder.days.includes(at.getDay())) continue
      const date = dayKey(at)
      const log = byId.get(habitLogId(habit.id, date))
      if (isSkipped(log)) continue
      const value = log?.value
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

/** How long before a planned workout its heads-up comes (the options in Ajustes). */
export const WORKOUT_LEADS = [15, 30, 60, 90]
/** Workout heads-ups cover the coming days, in case the app isn't opened. */
export const WORKOUT_DAYS = 7

export interface WorkoutReminder {
  id: number
  at: Date
  date: DayKey
  title: string
  body: string
  /** The screen the notification opens. */
  route: string
}

/** "15 min", "1 hora", "1 h 30". */
export function leadText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : hours === 1 ? '1 hora' : `${hours} horas`
}

/**
 * A heads-up `leadMin` minutes before each workout still planned that has a time: the gym ones
 * open the Hoje screen, where "Agora" has the button to start; runs and walks open the day on the
 * calendar, with the workout's description. Hidden Garmin workouts never reach the agenda.
 */
export function plannedWorkoutReminders(
  agenda: Pick<AgendaItem, 'key' | 'date' | 'kind' | 'title' | 'status' | 'time'>[],
  leadMin: number | undefined,
  now: Date,
): WorkoutReminder[] {
  if (!leadMin) return []
  return agenda.flatMap((item) => {
    if (item.status !== 'planned' || item.kind === 'rest' || item.time === undefined) return []
    const at = new Date(item.time - leadMin * 60_000)
    if (at <= now) return []
    const gym = item.kind === 'gym'
    const tap = gym ? 'Toque para iniciar o treino.' : item.kind === 'walk' ? 'Toque para ver a caminhada.' : 'Toque para ver o treino.'
    return [
      {
        id: notificationId(`workout:${item.key}:${item.time}`),
        at,
        date: item.date,
        title: `${item.title} às ${formatTime(item.time)}`,
        body: `Começa em ${leadText(leadMin)}. ${tap}`,
        route: gym ? '/' : `/calendario?dia=${item.date}`,
      },
    ]
  })
}

/** The Sunday summary goes out at this hour. */
export const WEEKLY_HOUR = 20

/** The next Sunday at 20h after `now` (today's, on a Sunday before 20h). */
export function nextWeeklyAt(now: Date): Date {
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((7 - now.getDay()) % 7), WEEKLY_HOUR)
  return sunday > now ? sunday : new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 7, WEEKLY_HOUR)
}

/** The week a Sunday's summary is about: the one that ended the day before (Sunday to Saturday). */
export function summarizedWeek(at: Date): { from: DayKey; to: DayKey } {
  const sunday = weekStart(dayKey(at))
  return { from: shiftDay(sunday, -7), to: shiftDay(sunday, -1) }
}

export interface WeekDigest {
  /** Gym workouts finished. */
  workouts: number
  runs: number
  runKm: number
  /** Average sleep, over the nights the watch recorded. */
  sleepHours?: number
  /** Days the water goal was met. */
  waterDays: number
}

export interface DigestSources {
  sessions: Pick<WorkoutSession, 'date' | 'endedAt' | 'deleted'>[]
  activities: Pick<Activity, 'date' | 'sport' | 'distanceM' | 'deleted'>[]
  health: Pick<DailyHealth, 'id' | 'sleep'>[]
  water: Pick<WaterLog, 'date' | 'ml' | 'deleted'>[]
  waterGoalMl: number
}

/** The week's numbers for the Sunday summary. */
export function weekDigest(from: DayKey, to: DayKey, s: DigestSources): WeekDigest {
  const inWeek = (date: DayKey) => date >= from && date <= to
  const runs = s.activities.filter((activity) => !activity.deleted && inWeek(activity.date) && activity.sport === 'running')
  const nights = s.health.filter((day) => inWeek(day.id) && day.sleep).map((day) => day.sleep!.totalSec / 3600)
  const water = new Map<DayKey, number>()
  for (const log of s.water) if (!log.deleted && inWeek(log.date)) water.set(log.date, (water.get(log.date) ?? 0) + log.ml)
  return {
    workouts: s.sessions.filter((session) => !session.deleted && session.endedAt && inWeek(session.date)).length,
    runs: runs.length,
    runKm: runs.reduce((total, run) => total + (run.distanceM ?? 0), 0) / 1000,
    sleepHours: nights.length ? nights.reduce((a, b) => a + b, 0) / nights.length : undefined,
    waterDays: s.waterGoalMl > 0 ? [...water.values()].filter((ml) => ml >= s.waterGoalMl).length : 0,
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * The Sunday notification: the week in one sentence. Without the numbers (the week wasn't over
 * when it was scheduled), an invitation to look.
 */
export function weeklyMessage(digest: WeekDigest | undefined): { title: string; body: string } {
  const title = 'Resumo da semana'
  if (!digest) return { title, body: 'Veja como foi a semana: treinos, corrida, sono e água.' }
  const parts = [
    digest.workouts > 0 && plural(digest.workouts, 'treino de força', 'treinos de força'),
    digest.runs > 0 && `${plural(digest.runs, 'corrida', 'corridas')} (${formatNumber(digest.runKm, 1)} km)`,
    digest.sleepHours !== undefined && `sono médio de ${formatNumber(digest.sleepHours, 1)} h`,
    digest.waterDays > 0 && `meta de água em ${plural(digest.waterDays, 'dia', 'dias')}`,
  ].filter((part): part is string => Boolean(part))
  if (parts.length === 0) return { title, body: 'Uma semana sem registros. Que tal planejar a próxima no calendário?' }
  const sentence = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`
  return { title, body: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. Toque para ver a semana.` }
}
