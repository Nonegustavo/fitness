import { useSyncExternalStore } from 'react'
import { db } from '../../db/schema'
import { ringAlert, setRest, stopRest, unlockAudio } from './restTimer'
import { changeSet, completeSet, updateSession } from './training'
import { isPending } from './workoutQueue'

/** A timed set running (a plank): counting down from its duration, or up when it has none. */
export interface SetTimer {
  sessionId: string
  exerciseKey: string
  setKey: string
  startedAt: number
  /** Seconds it counts down from; unset, it counts up. */
  targetSec?: number
  /** The rest once it's checked (0: none), and the rest bar's label. */
  restSec: number
  label: string
}

// Timestamps, not ticks: the time stays right when the screen dims or the app goes to the background,
// and it's kept in localStorage so a reload doesn't lose it either.
const STORAGE_KEY = 'fitness.setTimer'
/** Back on screen this long after the end, a beep would only confuse. */
const LATE_MS = 3000

const listeners = new Set<() => void>()
let timer: SetTimer | null = load()
let alarm: ReturnType<typeof setTimeout> | undefined

function load(): SetTimer | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SetTimer | null
  } catch {
    return null
  }
}

function setTimer(next: SetTimer | null) {
  timer = next
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked: the timer still works for this page.
  }
  schedule()
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useSetTimer = (): SetTimer | null => useSyncExternalStore(subscribe, () => timer)

/** When a countdown ends (ms); undefined when counting up. */
export const timerEnd = (running: SetTimer): number | undefined =>
  running.targetSec === undefined ? undefined : running.startedAt + running.targetSec * 1000

/** Whole seconds held by `at`: since the start, and at most the countdown's. */
export function heldSec(running: SetTimer, at: number): number {
  const held = Math.max(0, Math.round((at - running.startedAt) / 1000))
  return running.targetSec === undefined ? held : Math.min(held, running.targetSec)
}

/** What the clock shows: the seconds left of a countdown (rounded up), or the seconds so far. */
export function clockSec(running: SetTimer, now: number): number {
  const end = timerEnd(running)
  return end === undefined
    ? Math.max(0, Math.floor((now - running.startedAt) / 1000))
    : Math.max(0, Math.ceil((end - now) / 1000))
}

/** The set is still to do, in a workout still running (the watch or the notification may have checked it). */
async function stillPending(running: SetTimer): Promise<boolean> {
  const session = await db.workoutSessions.get(running.sessionId)
  return !!session && !session.deleted && !session.endedAt && isPending(session, running.exerciseKey, running.setKey)
}

/** The time held, written on the set, which stays to be checked. */
async function fill(running: SetTimer, seconds: number) {
  if (seconds <= 0 || !(await stillPending(running))) return
  await updateSession(running.sessionId, (session) =>
    changeSet(session, running.exerciseKey, running.setKey, (set) => (set.done ? set : { ...set, durationSec: seconds })),
  )
}

/** The set checked off with the time held at `at`, as checking it does, and the rest from then. */
async function complete(running: SetTimer, at: number, ring: boolean) {
  if (!(await stillPending(running))) return
  if (ring) ringAlert()
  const values = { weightKg: undefined, reps: undefined, durationSec: heldSec(running, at) }
  await completeSet(running.sessionId, running.exerciseKey, running.setKey, values, at)
  const restEnd = at + running.restSec * 1000
  if (running.restSec > 0 && restEnd > Date.now()) {
    setRest({ endsAt: restEnd, totalSec: running.restSec, label: running.label })
  }
}

/**
 * Starts a timed set, from a tap (so its end can beep). A rest still running stops, as the set is on
 * now; another set's timer stops with its time written down.
 */
export function startSetTimer(next: Omit<SetTimer, 'startedAt'>): void {
  unlockAudio()
  stopRest()
  const previous = timer
  setTimer({ ...next, startedAt: Date.now() })
  if (previous && previous.setKey !== next.setKey) void fill(previous, heldSec(previous, Date.now()))
}

/** Stopped early: the time held so far goes on the set, still unchecked. */
export function stopSetTimer(): void {
  const running = timer
  if (!running) return
  setTimer(null)
  void fill(running, heldSec(running, Date.now()))
}

/** Checked while it runs: the set is done with the time held so far, and the rest starts. */
export function completeSetTimer(): void {
  const running = timer
  if (!running) return
  setTimer(null)
  unlockAudio()
  void complete(running, Date.now(), false)
}

/** The workout ended or went away: its set's timer stops without writing anything. */
export function cancelSetTimer(sessionId: string): void {
  if (timer?.sessionId === sessionId) setTimer(null)
}

function schedule() {
  clearTimeout(alarm)
  const end = timer ? timerEnd(timer) : undefined
  if (end !== undefined) alarm = setTimeout(check, Math.max(0, end - Date.now()))
}

/** A countdown at its end beeps (unless the app comes back long after) and checks the set at the end. */
function check() {
  const running = timer
  const end = running ? timerEnd(running) : undefined
  if (!running || end === undefined) return
  const now = Date.now()
  if (now < end) {
    schedule()
    return
  }
  setTimer(null)
  void complete(running, end, now - end < LATE_MS)
}

// Timers wait while the app is in the background; coming back settles a countdown that ended meanwhile.
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', check)
schedule()
