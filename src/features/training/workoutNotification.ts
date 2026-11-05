import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { liveQuery } from 'dexie'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import { isAndroidApp } from '../healthconnect/plugin'
import { getRestTimer, setRestAlertGate, subscribeRestTimer } from './restTimer'
import { findActive } from './training'
import { applyAction, notificationState, type NotificationState, type WorkoutAction } from './workoutQueue'

/** The native side lives in android/app/src/main/java/.../WorkoutPlugin.kt and WorkoutNotification.kt. */
interface WorkoutPlugin {
  /** Shows or updates the notification. `ack`: the last queued action already applied here. */
  show(options: { state: NotificationState; ack: number }): Promise<void>
  /** Takes the notification away, with its alarm and its queue. */
  clear(): Promise<void>
  /** What was done in the notification and not acknowledged yet, oldest first. */
  drain(): Promise<{ actions: WorkoutAction[] }>
  /** Fired when a button is tapped while the app is running. */
  addListener(eventName: 'workoutAction', listener: () => void): Promise<PluginListenerHandle>
}

const Workout = registerPlugin<WorkoutPlugin>('Workout')

let started = false
let showing = false
/** The last queued action applied in this run. The native ids only grow, so it never goes back. */
let applied = 0
/** What was last sent, to skip sending the same again ('' to send anyway). */
let sent = ''
let running = false
let again = false

/** Whether the workout notification rings at the end of the rest itself (native.ts then doesn't). */
export const restRingsNatively = (): boolean => showing

/**
 * One round at a time: apply what was done in the notification, then send the state, so what is sent
 * already includes it. A change during a round asks for another.
 */
function sync(): void {
  if (!started) return
  if (running) {
    again = true
    return
  }
  running = true
  void (async () => {
    try {
      do {
        again = false
        await applyQueued()
        await push()
      } while (again)
    } catch (error) {
      // What was not applied stays queued on the phone for the next round.
      console.warn('Notificação do treino', error)
    } finally {
      running = false
    }
  })()
}

async function applyQueued() {
  const { actions } = await Workout.drain()
  for (const action of actions) {
    if (action.id <= applied) continue
    await applyAction(action)
    applied = action.id
  }
}

async function push() {
  const [sessions, exercises] = await Promise.all([db.workoutSessions.toArray(), db.exercises.toArray()])
  const history = alive(sessions).sort((a, b) => b.startedAt - a.startedAt)
  const session = findActive(history)
  if (!session) {
    // Finished or discarded (here or on another device): the notification goes away.
    if (sent !== 'clear') await Workout.clear()
    sent = 'clear'
    showing = false
    return
  }
  askPermission()
  const state = notificationState(session, new Map(exercises.map((e) => [e.id, e])), history, getRestTimer())
  const message = JSON.stringify({ state, ack: applied })
  if (message !== sent) await Workout.show({ state, ack: applied })
  sent = message
  showing = true
}

// The rest bar rings only for a rest that ended with the app on screen; the notification rings for the
// others. Without the permission nothing can ring outside, so the bar always does.
let onScreenSince: number | null = null
let canNotify = false

function watchScreen() {
  let paused = false
  let visible = document.visibilityState === 'visible'
  const changed = () => {
    const on = visible && !paused
    if (!on) onScreenSince = null
    else if (onScreenSince === null) onScreenSince = Date.now()
  }
  changed()
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState === 'visible'
    changed()
  })
  // Capacitor's events for the activity leaving and coming back: the same moments the native side uses.
  document.addEventListener('pause', () => {
    paused = true
    changed()
  })
  document.addEventListener('resume', () => {
    paused = false
    changed()
    // Back from the settings, maybe with the permission now; and what was tapped meanwhile.
    void checkPermission(false).catch((error: unknown) => console.warn(error))
    sync()
  })
  setRestAlertGate((endsAt) => !canNotify || (onScreenSince !== null && onScreenSince <= endsAt))
}

async function checkPermission(ask: boolean) {
  let { display } = await LocalNotifications.checkPermissions()
  if (ask && (display === 'prompt' || display === 'prompt-with-rationale')) {
    display = (await LocalNotifications.requestPermissions()).display
  }
  const allowed = display === 'granted'
  if (allowed === canNotify) return
  canNotify = allowed
  // Allowed now: draw the notification again, as it couldn't be shown before.
  sent = ''
  sync()
}

let asked = false
/** The start of a workout, with the user looking at the app, is a good moment to ask. */
function askPermission() {
  if (asked || document.visibilityState !== 'visible') return
  asked = true
  void checkPermission(true).catch((error: unknown) => console.warn(error))
}

/**
 * The workout in progress as an Android notification that follows the app and drives it: the current
 * set with −/+ and "Concluir", then the rest's countdown. Does nothing elsewhere.
 */
export function startWorkoutNotification(): void {
  if (!isAndroidApp()) return
  watchScreen()
  void checkPermission(false).catch((error: unknown) => console.warn(error))
  // An app built before the plugin existed: the rest keeps today's notification (native.ts).
  if (!Capacitor.isPluginAvailable('Workout')) return
  started = true
  void Workout.addListener('workoutAction', sync)
  liveQuery(() => Promise.all([db.workoutSessions.toArray(), db.exercises.toArray()])).subscribe({
    next: () => sync(),
    error: (error: unknown) => console.warn(error),
  })
  subscribeRestTimer(sync)
  sync()
}
