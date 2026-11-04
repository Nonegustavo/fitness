import { registerPlugin } from '@capacitor/core'
import { liveQuery } from 'dexie'
import { alive } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import { dayKey } from '../../lib/dates'
import { goalsFor } from '../food/nutrition'
import { isAndroidApp } from '../healthconnect/plugin'
import { nextTemplate } from '../training/stats'
import { findActive } from '../training/training'
import { widgetSummary, type WidgetSummary } from './summary'

/** The native side lives in android/app/src/main/java/.../WidgetPlugin.kt. */
interface WidgetPlugin {
  update(summary: WidgetSummary): Promise<void>
}

const Widget = registerPlugin<WidgetPlugin>('Widget')

/** Today's numbers for the widget, from the local data. */
async function compute(): Promise<WidgetSummary> {
  const today = dayKey()
  const [settings, foodLogs, waterLogs, sessions, templates] = await Promise.all([
    db.settings.get(SETTINGS_ID),
    db.foodLogs.where('date').equals(today).toArray(),
    db.waterLogs.where('date').equals(today).toArray(),
    db.workoutSessions.toArray(),
    db.workoutTemplates.toArray(),
  ])
  const workouts = alive(sessions)
  const active = findActive(workouts)
  const next = nextTemplate(alive(templates), workouts)
  const trainingDay = workouts.some((session) => session.date === today)
  return widgetSummary({
    date: today,
    eatenKcal: alive(foodLogs).reduce((total, log) => total + log.nutrients.kcal, 0),
    goalKcal: settings ? goalsFor(settings, trainingDay)?.kcal : undefined,
    waterMl: alive(waterLogs).reduce((total, log) => total + log.ml, 0),
    waterGoalMl: settings?.waterGoalMl ?? 0,
    workout: active ? { name: active.name, active: true } : next ? { name: next.name, active: false } : undefined,
  })
}

/**
 * Keeps the home-screen widget's numbers current in the Android app: on every change to the day's
 * food, water or workouts, and when the app comes back (a new day may have started).
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
