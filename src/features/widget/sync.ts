import { registerPlugin } from '@capacitor/core'
import { liveQuery } from 'dexie'
import { alive } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import { dayKey, parseDay, shiftDay } from '../../lib/dates'
import { buildAgenda } from '../calendar/agenda'
import { goalsFor, sumNutrients } from '../food/nutrition'
import { plannedEvents } from '../garmin/sync'
import { isAndroidApp } from '../healthconnect/plugin'
import { nextTemplate } from '../training/stats'
import { widgetSummary, widgetWorkouts, type WidgetSummary } from './summary'

/** The native side lives in android/app/src/main/java/.../WidgetPlugin.kt. */
interface WidgetPlugin {
  update(summary: WidgetSummary): Promise<void>
}

const Widget = registerPlugin<WidgetPlugin>('Widget')

/** How far ahead the widget knows the workouts, so it stays right for days without the app. */
const AHEAD_DAYS = 13

/** Today's numbers and the workouts ahead for the widget, from the local data. */
async function compute(): Promise<WidgetSummary> {
  const today = dayKey()
  const until = shiftDay(today, AHEAD_DAYS)
  const [settings, foodLogs, waterLogs, sessions, templates, plans, activities, events, eventTimes] = await Promise.all([
    db.settings.get(SETTINGS_ID),
    db.foodLogs.where('date').equals(today).toArray(),
    db.waterLogs.where('date').equals(today).toArray(),
    db.workoutSessions.toArray(),
    db.workoutTemplates.toArray(),
    // With the deleted rows: a deleted weekly walk's row takes its day off.
    db.workoutPlans.where('date').between(today, until, true, true).toArray(),
    // Today's activities mark today's Garmin workouts done.
    db.activities.where('startTime').aboveOrEqual(parseDay(today).getTime()).toArray(),
    plannedEvents(),
    db.eventTimes.where('date').between(today, until, true, true).toArray(),
  ])
  const workouts = alive(sessions)
  const live = alive(templates)
  const agenda = buildAgenda(today, until, today, {
    plans,
    events,
    sessions: workouts,
    activities: alive(activities),
    templates: live,
    eventTimes: alive(eventTimes),
    walkRoutine: settings?.walkRoutine,
  })
  const trainingDay = workouts.some((session) => session.date === today)
  return widgetSummary({
    date: today,
    eaten: sumNutrients(alive(foodLogs).map((log) => log.nutrients)),
    goals: settings ? goalsFor(settings, trainingDay) : undefined,
    waterMl: alive(waterLogs).reduce((total, log) => total + log.ml, 0),
    waterGoalMl: settings?.waterGoalMl ?? 0,
    agenda: widgetWorkouts(agenda),
    next: nextTemplate(live, workouts.filter((session) => session.endedAt))?.name,
  })
}

/**
 * Keeps the home-screen widget current in the Android app: on every change to the day's food,
 * water, workouts or schedule, and when the app comes back (a new day may have started).
 */
export function startWidgetSync(): void {
  if (!isAndroidApp()) return
  let last = ''
  const send = (summary: WidgetSummary) => {
    const key = JSON.stringify(summary)
    if (key === last) return
    last = key
    // An app installed before the widget plugin existed doesn't have it: nothing to update.
    void Widget.update(summary).catch((error: unknown) => console.warn('Widget indisponível', error))
  }
  liveQuery(compute).subscribe({ next: send, error: (error: unknown) => console.warn(error) })
  const refresh = () => void compute().then(send)
  document.addEventListener('resume', refresh)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh()
  })
}
