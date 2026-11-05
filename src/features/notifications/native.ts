import { LocalNotifications, type ActionPerformed } from '@capacitor/local-notifications'
import { liveQuery } from 'dexie'
import { alive } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { Habit, HabitLog } from '../../db/types'
import { dayKey, parseDay, shiftDay, type DayKey } from '../../lib/dates'
import { buildAgenda } from '../calendar/agenda'
import { plannedEvents } from '../garmin/sync'
import { setHabitValue } from '../habits/habits'
import { isAndroidApp } from '../healthconnect/plugin'
import { getRestTimer, subscribeRestTimer, type RestTimer } from '../training/restTimer'
import {
  HORIZON_DAYS,
  nextWeeklyAt,
  plannedReminders,
  plannedSmartReminders,
  plannedWorkoutReminders,
  SMART_DAYS,
  summarizedWeek,
  weekDigest,
  weeklyMessage,
  WORKOUT_DAYS,
  type DayStatus,
  type SmartReminder,
  type WorkoutReminder,
} from './reminders'

const REST_ID = 1001

interface HabitExtra {
  kind: 'habit'
  habitId: string
  date: DayKey
}

interface SmartExtra {
  kind: 'smart'
  reminder: SmartReminder['kind']
  date: DayKey
  route: string
}

/** A heads-up before a planned workout, or the Sunday summary: both just open a screen. */
interface RouteExtra {
  kind: 'workout' | 'weekly'
  route: string
}

const WEEKLY_ID = 1002

/** Habit reminders and the end of the rest timer as Android notifications. Does nothing elsewhere. */
export function startNotifications(): void {
  if (!isAndroidApp()) return
  void setUp().catch((error: unknown) => console.warn('Notificações indisponíveis', error))
}

/** Asks for the notification permission, from a tap that turns a reminder on. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isAndroidApp()) return false
  return (await LocalNotifications.requestPermissions()).display === 'granted'
}

const allowed = async () => (await LocalNotifications.checkPermissions()).display === 'granted'

async function setUp() {
  await LocalNotifications.createChannel({
    id: 'lembretes',
    name: 'Lembretes de hábitos',
    description: 'Os lembretes marcados em cada hábito',
    importance: 4,
    vibration: true,
  })
  await LocalNotifications.createChannel({
    id: 'descanso',
    name: 'Fim do descanso',
    description: 'Avisa quando o descanso entre séries acaba',
    importance: 5,
    vibration: true,
  })
  await LocalNotifications.createChannel({
    id: 'inteligentes',
    name: 'Lembretes do dia',
    description: 'Pesagem, refeições e água, só quando falta registrar',
    importance: 4,
    vibration: true,
  })
  await LocalNotifications.createChannel({
    id: 'treinos',
    name: 'Treinos programados',
    description: 'Avisa antes dos treinos do calendário que têm horário',
    importance: 4,
    vibration: true,
  })
  await LocalNotifications.createChannel({
    id: 'resumo',
    name: 'Resumo da semana',
    description: 'Domingo às 20h, a semana em números',
    importance: 3,
    vibration: false,
  })
  await LocalNotifications.registerActionTypes({ types: [{ id: 'habit', actions: [{ id: 'done', title: 'Feito' }] }] })
  await LocalNotifications.addListener('localNotificationActionPerformed', (action) => void onAction(action))
  watchReminders()
  watchSmartReminders()
  watchWorkoutReminders()
  watchWeekly()
  watchRest()
}

/** The smart reminders follow the day's logs: weighing in, logging lunch or drinking takes them away. */
function watchSmartReminders() {
  let pending: ReturnType<typeof setTimeout> | undefined
  liveQuery(async () => {
    const today = dayKey()
    const last = shiftDay(today, SMART_DAYS)
    const [settings, weights, foodLogs, waterLogs] = await Promise.all([
      db.settings.get(SETTINGS_ID),
      db.weights.where('date').between(today, last, true, true).toArray(),
      db.foodLogs.where('date').between(today, last, true, true).toArray(),
      db.waterLogs.where('date').between(today, last, true, true).toArray(),
    ])
    const status = new Map<DayKey, DayStatus>()
    const dayOf = (date: DayKey) => {
      const day = status.get(date) ?? { weighed: false, meals: new Set(), waterMl: 0 }
      status.set(date, day)
      return day
    }
    for (const weight of alive(weights)) dayOf(weight.date).weighed = true
    for (const log of alive(foodLogs)) dayOf(log.date).meals.add(log.meal)
    for (const log of alive(waterLogs)) dayOf(log.date).waterMl += log.ml
    return { smart: settings?.smartReminders, goal: settings?.waterGoalMl ?? 0, status }
  }).subscribe({
    next: ({ smart, goal, status }) => {
      clearTimeout(pending)
      pending = setTimeout(() => {
        const planned = plannedSmartReminders(smart, status, goal, new Date())
        void rescheduleSmart(planned, status).catch((error: unknown) => console.warn(error))
      }, 1000)
    },
  })
}

async function rescheduleSmart(planned: SmartReminder[], status: Map<DayKey, DayStatus>) {
  if (!(await allowed())) return
  const { notifications: scheduled } = await LocalNotifications.getPending()
  const old = scheduled.filter((notification) => (notification.extra as SmartExtra | undefined)?.kind === 'smart')
  if (old.length > 0) await LocalNotifications.cancel({ notifications: old.map(({ id }) => ({ id })) })

  // One already showing goes away once it's been taken care of (weighed in, meal logged).
  const { notifications: shown } = await LocalNotifications.getDeliveredNotifications()
  const done = shown.filter((notification) => {
    const extra = notification.extra as SmartExtra | undefined
    const day = extra?.kind === 'smart' ? status.get(extra.date) : undefined
    if (!extra || !day) return false
    if (extra.reminder === 'weighIn') return day.weighed
    if (extra.reminder === 'lunch' || extra.reminder === 'dinner') return day.meals.has(extra.reminder)
    return false
  })
  if (done.length > 0) await LocalNotifications.removeDeliveredNotifications({ notifications: done })

  if (planned.length === 0) return
  await LocalNotifications.schedule({
    notifications: planned.map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      body: reminder.body,
      channelId: 'inteligentes',
      schedule: { at: reminder.at, allowWhileIdle: true },
      autoCancel: true,
      extra: { kind: 'smart', reminder: reminder.kind, date: reminder.date, route: reminder.route } satisfies SmartExtra,
    })),
  })
}

/** Removes the pending notifications of a kind, and schedules the new ones in their channel. */
async function replacePending(
  kind: RouteExtra['kind'],
  channelId: string,
  notifications: { id: number; at: Date; title: string; body: string; route: string }[],
) {
  if (!(await allowed())) return
  const { notifications: scheduled } = await LocalNotifications.getPending()
  const old = scheduled.filter((notification) => (notification.extra as RouteExtra | undefined)?.kind === kind)
  if (old.length > 0) await LocalNotifications.cancel({ notifications: old.map(({ id }) => ({ id })) })
  if (notifications.length === 0) return
  await LocalNotifications.schedule({
    notifications: notifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      channelId,
      schedule: { at: notification.at, allowWhileIdle: true },
      autoCancel: true,
      extra: { kind, route: notification.route } satisfies RouteExtra,
    })),
  })
}

/** The heads-ups follow the calendar: scheduling, moving or doing a workout updates them. */
function watchWorkoutReminders() {
  let pending: ReturnType<typeof setTimeout> | undefined
  liveQuery(async () => {
    const today = dayKey()
    const last = shiftDay(today, WORKOUT_DAYS)
    const [settings, plans, eventTimes, events, sessions, activities, templates] = await Promise.all([
      db.settings.get(SETTINGS_ID),
      db.workoutPlans.where('date').between(today, last, true, true).toArray(),
      db.eventTimes.where('date').between(today, last, true, true).toArray(),
      plannedEvents(),
      db.workoutSessions.where('date').between(today, last, true, true).toArray(),
      db.activities.where('startTime').aboveOrEqual(parseDay(today).getTime()).toArray(),
      db.workoutTemplates.toArray(),
    ])
    const lead = settings?.smartReminders?.workouts
    if (!lead) return { lead, agenda: [] }
    const agenda = buildAgenda(today, last, today, { plans, events, sessions, activities, templates, eventTimes })
    return { lead, agenda }
  }).subscribe({
    next: ({ lead, agenda }) => {
      clearTimeout(pending)
      pending = setTimeout(() => {
        const planned: WorkoutReminder[] = plannedWorkoutReminders(agenda, lead, new Date())
        void replacePending('workout', 'treinos', planned).catch((error: unknown) => console.warn(error))
      }, 1000)
    },
  })
}

/**
 * The Sunday summary: one notification, the next Sunday at 20h. Its numbers are filled in once the
 * week is over (the app opened on Sunday); before that it only invites to look.
 */
function watchWeekly() {
  let pending: ReturnType<typeof setTimeout> | undefined
  liveQuery(async () => {
    const at = nextWeeklyAt(new Date())
    const week = summarizedWeek(at)
    const [settings, sessions, activities, health, water] = await Promise.all([
      db.settings.get(SETTINGS_ID),
      db.workoutSessions.where('date').between(week.from, week.to, true, true).toArray(),
      db.activities.where('startTime').aboveOrEqual(parseDay(week.from).getTime()).toArray(),
      db.dailyHealth.where('id').between(week.from, week.to, true, true).toArray(),
      db.waterLogs.where('date').between(week.from, week.to, true, true).toArray(),
    ])
    if (!settings?.smartReminders?.weekly) return { at, message: undefined }
    const over = dayKey() > week.to
    const digest = over
      ? weekDigest(week.from, week.to, { sessions, activities, health, water, waterGoalMl: settings.waterGoalMl })
      : undefined
    return { at, message: { ...weeklyMessage(digest), route: '/semana' } }
  }).subscribe({
    next: ({ at, message }) => {
      clearTimeout(pending)
      pending = setTimeout(() => {
        const notifications = message ? [{ id: WEEKLY_ID, at, ...message }] : []
        void replacePending('weekly', 'resumo', notifications).catch((error: unknown) => console.warn(error))
      }, 1000)
    },
  })
}

/** Reminders follow the habits and their logs: checking a habit takes today's reminder away. */
function watchReminders() {
  let pending: ReturnType<typeof setTimeout> | undefined
  liveQuery(async () => {
    const today = dayKey()
    const [habits, logs] = await Promise.all([
      db.habits.toArray(),
      db.habitLogs.where('date').between(today, shiftDay(today, HORIZON_DAYS), true, true).toArray(),
    ])
    return { habits: alive(habits), logs }
  }).subscribe({
    next: ({ habits, logs }) => {
      clearTimeout(pending)
      pending = setTimeout(() => void reschedule(habits, logs).catch((error: unknown) => console.warn(error)), 1000)
    },
  })
}

async function reschedule(habits: Habit[], logs: HabitLog[]) {
  if (!(await allowed())) return
  const { notifications: scheduled } = await LocalNotifications.getPending()
  const old = scheduled.filter((notification) => (notification.extra as HabitExtra | undefined)?.kind === 'habit')
  if (old.length > 0) await LocalNotifications.cancel({ notifications: old.map(({ id }) => ({ id })) })

  // A reminder already showing goes away once its day is logged.
  const planned = plannedReminders(habits, logs, new Date())
  const logged = new Set(logs.filter((log) => !log.deleted && log.value > 0).map((log) => log.id))
  const { notifications: shown } = await LocalNotifications.getDeliveredNotifications()
  const done = shown.filter((notification) => {
    const extra = notification.extra as HabitExtra | undefined
    return extra?.kind === 'habit' && logged.has(`${extra.habitId}:${extra.date}`)
  })
  if (done.length > 0) await LocalNotifications.removeDeliveredNotifications({ notifications: done })

  if (planned.length === 0) return
  await LocalNotifications.schedule({
    notifications: planned.map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      body: reminder.body,
      channelId: 'lembretes',
      schedule: { at: reminder.at, allowWhileIdle: true },
      actionTypeId: reminder.canCheck ? 'habit' : undefined,
      autoCancel: true,
      extra: { kind: 'habit', habitId: reminder.habitId, date: reminder.date } satisfies HabitExtra,
    })),
  })
}

async function onAction({ actionId, notification }: ActionPerformed) {
  const extra = notification.extra as HabitExtra | SmartExtra | RouteExtra | undefined
  if (extra?.kind === 'smart' || extra?.kind === 'workout' || extra?.kind === 'weekly') {
    location.hash = `#${extra.route}`
    return
  }
  if (extra?.kind !== 'habit') return
  if (actionId === 'done') {
    const habit = await db.habits.get(extra.habitId)
    if (habit) await setHabitValue(habit, extra.date, 1)
    return
  }
  location.hash = '#/habitos'
}

/**
 * While the app is open, the rest bar beeps at the end. Once it goes to the background, a
 * notification takes over, and coming back cancels it.
 */
function watchRest() {
  let background = false
  let scheduledFor: number | undefined
  let previous = getRestTimer()

  const update = () => {
    const timer = getRestTimer()
    // The first rest of a workout is a good moment to ask, while the user is looking at the app.
    if (timer && !previous) void askOnce()
    previous = timer
    if (!background) {
      if (scheduledFor !== undefined) void cancelRest()
      scheduledFor = undefined
    } else if (timer && timer.endsAt > Date.now()) {
      if (timer.endsAt !== scheduledFor) void scheduleRest(timer)
      scheduledFor = timer.endsAt
    } else if (!timer && scheduledFor !== undefined && scheduledFor > Date.now()) {
      // Skipped before the end; a rest that simply ran out keeps its notification.
      void cancelRest()
      scheduledFor = undefined
    }
  }
  const setBackground = (value: boolean) => {
    background = value
    update()
  }
  document.addEventListener('visibilitychange', () => setBackground(document.visibilityState === 'hidden'))
  // Capacitor's own events for the app leaving and coming back to the screen.
  document.addEventListener('pause', () => setBackground(true))
  document.addEventListener('resume', () => setBackground(false))
  subscribeRestTimer(update)
}

let asked = false
async function askOnce() {
  if (asked) return
  asked = true
  const { display } = await LocalNotifications.checkPermissions()
  if (display === 'prompt' || display === 'prompt-with-rationale') await LocalNotifications.requestPermissions()
}

async function scheduleRest(timer: RestTimer) {
  if (!(await allowed())) return
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REST_ID,
        title: 'Fim do descanso',
        body: timer.label && timer.label !== 'Descanso' ? `Próxima série: ${timer.label}` : 'Hora da próxima série.',
        channelId: 'descanso',
        schedule: { at: new Date(timer.endsAt), allowWhileIdle: true },
        autoCancel: true,
        extra: { kind: 'rest' },
      },
    ],
  })
}

async function cancelRest() {
  await LocalNotifications.cancel({ notifications: [{ id: REST_ID }] })
  await LocalNotifications.removeDeliveredNotifications({
    notifications: [{ id: REST_ID, title: '', body: '' }],
  })
}
