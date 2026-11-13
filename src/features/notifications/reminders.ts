import type {
  Activity,
  BodyCheckReminder,
  DailyHealth,
  Habit,
  HabitLog,
  MealKey,
  SmartReminders,
  WaterLog,
  WorkoutSession,
} from '../../db/types'
import { dayKey, dayTime, daysBetween, formatTime, parseDay, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { formatNumber, formatSigned } from '../../lib/format'
import type { AgendaItem } from '../calendar/agenda'
import type { PendingGoals } from '../food/checkIn'
import { daysByHabit, habitLogId, habitTime, isSkipped, isSuccess, NO_DAYS, weeklyTimes, weekResult } from '../habits/habits'

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
 * A weekly habit only rings while its week's target is still ahead (`logs` should cover the
 * current week from Sunday); a weekly limit to avoid never rings.
 */
export function plannedReminders(habits: Habit[], logs: HabitLog[], now: Date): PlannedReminder[] {
  const kept = logs.filter((log) => !log.deleted)
  const byId = new Map(kept.map((log) => [log.id, log]))
  const byHabit = daysByHabit(kept)
  const planned: PlannedReminder[] = []
  for (const habit of habits) {
    const reminder = habit.reminder
    if (!reminder || habit.archived || habit.deleted || reminder.days.length === 0) continue
    const weekly = weeklyTimes(habit) !== undefined
    if (weekly && habit.polarity === 'bad') continue
    const [hour, minute] = (habitTime(habit) ?? reminder.time).split(':').map(Number)
    for (let offset = 0; offset < HORIZON_DAYS; offset++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute)
      if (at <= now || !reminder.days.includes(at.getDay())) continue
      const date = dayKey(at)
      const log = byId.get(habitLogId(habit.id, date))
      if (isSkipped(log)) continue
      const value = log?.value
      if (habit.polarity === 'good' ? isSuccess(habit, value) : value !== undefined) continue
      const week = weekly ? weekResult(habit, byHabit.get(habit.id) ?? NO_DAYS, weekStart(date), date) : undefined
      if (week?.met) continue
      const tap = habit.kind === 'check' ? 'Toque em Feito para marcar.' : 'Toque para registrar.'
      planned.push({
        id: notificationId(habitLogId(habit.id, date)),
        at,
        habitId: habit.id,
        date,
        title: habit.name,
        body: week
          ? `${week.count} de ${week.times} nesta semana. ${tap}`
          : habit.polarity === 'bad'
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
  kind: 'weighIn' | 'lunch' | 'dinner' | 'water' | BodyCheck
  /** A water check's hour, to tell later whether the day caught up with it. */
  hour?: number
  title: string
  body: string
  /** The screen the notification opens. */
  route: string
}

/** The body checks that come every few weeks instead of every day. */
export type BodyCheck = 'measurements' | 'photos'
export const BODY_CHECKS: BodyCheck[] = ['measurements', 'photos']

/** The last day each body check was recorded (none ever: undefined). */
export type LastBodyChecks = Partial<Record<BodyCheck, DayKey>>

/** The intervals offered in Ajustes, and what a reminder starts with. */
export const BODY_CHECK_WEEKS = [2, 4, 6, 8]
export const BODY_CHECK_DEFAULT: BodyCheckReminder = { everyWeeks: 4, weekday: 0, time: '09:00' }

const BODY_CHECK_TEXT: Record<BodyCheck, { title: string; tap: string; first: string; route: string }> = {
  measurements: {
    title: 'Hora das medidas',
    tap: 'Toque para registrar.',
    first: 'Registre as primeiras medidas para acompanhar a recomposição.',
    route: '/corpo?novo=medida',
  },
  photos: {
    title: 'Fotos de progresso',
    tap: 'Mesma luz e mesmo lugar, de manhã. Toque para tirar.',
    first: 'Tire as primeiras fotos para comparar depois. Mesma luz e mesmo lugar, de manhã.',
    route: '/corpo?novo=foto',
  },
}

const everyWeeksOf = (plan: Pick<BodyCheckReminder, 'everyWeeks'>) => Math.max(1, Math.round(plan.everyWeeks) || 1)

/**
 * The day a body check is next due, from `from` on: the first chosen weekday at least `everyWeeks`
 * weeks after the last record, or the next such weekday when none was ever recorded. Once due, it
 * stays due (the same weekday each week after) until something is recorded.
 */
export function nextBodyCheck(
  last: DayKey | undefined,
  plan: Pick<BodyCheckReminder, 'everyWeeks' | 'weekday'>,
  from: DayKey,
): DayKey {
  const due = last && shiftDay(last, 7 * everyWeeksOf(plan))
  const start = due && due > from ? due : from
  return shiftDay(start, (((plan.weekday - parseDay(start).getDay()) % 7) + 7) % 7)
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
  lastBodyChecks: LastBodyChecks = {},
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
          hour,
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
  const today = dayKey(now)
  for (const kind of BODY_CHECKS) {
    const plan = settings[kind]
    if (!plan) continue
    const last = lastBodyChecks[kind]
    let date = nextBodyCheck(last, plan, today)
    // Due today but its time has passed: the same weekday next week, as nothing was recorded.
    if (date === today && at(0, plan.time) <= now) date = nextBodyCheck(last, plan, shiftDay(today, 1))
    const offset = daysBetween(today, date)
    if (offset >= SMART_DAYS) continue
    const text = BODY_CHECK_TEXT[kind]
    const weeks = last ? Math.floor(daysBetween(last, date) / 7) : 0
    add({
      at: at(offset, plan.time),
      date,
      kind,
      title: text.title,
      body: last ? `Faz ${weeks} ${weeks === 1 ? 'semana' : 'semanas'} desde as últimas. ${text.tap}` : text.first,
      route: text.route,
    })
  }
  return planned
}

/** A smart notification already on the screen, as its `extra` describes it. */
export interface ShownSmartReminder {
  id: number
  reminder: SmartReminder['kind']
  date: DayKey
  /** Water only; older notifications don't carry it. */
  hour?: number
}

/** What a shown notification is checked against. */
export interface SmartContext {
  status: Map<DayKey, DayStatus>
  waterGoalMl: number
  settings: SmartReminders | undefined
  lastBodyChecks: LastBodyChecks
}

/** The water check hour a notification was planned for, read back from its id (older ones carry no hour). */
function waterHourOf(id: number, date: DayKey): number | undefined {
  return WATER_CHECKS.find((hour) => notificationId(`smart:water:${dayTime(date, `${hour}:00`)}`) === id)
}

/**
 * Whether a smart notification already showing has been taken care of and can go: a weigh-in or the
 * meal recorded that day, the day's water back on the pace of the hour it was sent at, or a body
 * check recorded since it became due.
 */
export function smartReminderSettled(shown: ShownSmartReminder, context: SmartContext): boolean {
  const { reminder, date } = shown
  if (reminder === 'measurements' || reminder === 'photos') {
    const last = context.lastBodyChecks[reminder]
    if (!last) return false
    const plan = context.settings?.[reminder]
    // The record moved the next due day past the one it rang on.
    return plan ? shiftDay(last, 7 * everyWeeksOf(plan)) > date : last >= date
  }
  const day = context.status.get(date)
  if (!day) return false
  if (reminder === 'weighIn') return day.weighed
  if (reminder === 'lunch' || reminder === 'dinner') return day.meals.has(reminder)
  const hour = shown.hour ?? waterHourOf(shown.id, date)
  if (hour === undefined) return false
  return day.waterMl >= waterExpectedBy(hour, context.waterGoalMl) - WATER_SLACK_ML
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

/** The week's check-in in the summary: new nutrition targets waiting on the food screen. */
const goalsText = ({ kcal, delta }: PendingGoals) =>
  delta !== 0
    ? `Novas metas de alimentação para a semana: ${formatNumber(kcal, 0)} kcal por dia (${formatSigned(delta, 0)}), para revisar em Alimentação.`
    : 'Metas de alimentação da semana: proteína e gorduras ajustadas ao seu peso, para revisar em Alimentação.'

/**
 * The Sunday notification: the week in one sentence, and the new nutrition targets when the week's
 * check-in has some. Without the numbers (the week wasn't over when it was scheduled), an invitation to look.
 */
export function weeklyMessage(digest: WeekDigest | undefined, goals?: PendingGoals): { title: string; body: string } {
  const title = 'Resumo da semana'
  if (!digest) return { title, body: 'Veja como foi a semana: treinos, corrida, sono e água.' }
  const goalsLine = goals ? ` ${goalsText(goals)}` : ''
  const parts = [
    digest.workouts > 0 && plural(digest.workouts, 'treino de força', 'treinos de força'),
    digest.runs > 0 && `${plural(digest.runs, 'corrida', 'corridas')} (${formatNumber(digest.runKm, 1)} km)`,
    digest.sleepHours !== undefined && `sono médio de ${formatNumber(digest.sleepHours, 1)} h`,
    digest.waterDays > 0 && `meta de água em ${plural(digest.waterDays, 'dia', 'dias')}`,
  ].filter((part): part is string => Boolean(part))
  if (parts.length === 0) return { title, body: `Uma semana sem registros. Que tal planejar a próxima no calendário?${goalsLine}` }
  const sentence = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`
  return { title, body: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.${goalsLine} Toque para ver a semana.` }
}
