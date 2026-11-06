import { FunctionsHttpError } from '@supabase/supabase-js'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import type { CoachWeek, CoachWorkout } from '../../../supabase/functions/sisrun/planilha'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { EventTime } from '../../db/types'
import { dayKey, parseDay, shiftDay, type DayKey } from '../../lib/dates'
import { getSyncState } from '../../sync/controller'
import { supabase } from '../../sync/supabase'
import { eventKind, fromCoach, hiddenKeys, keyedEvents } from '../calendar/agenda'
import type { PlannedEvent } from '../garmin/calendar'

export type { CoachWeek, CoachWorkout }

/**
 * This device's copy of the coach's plan, read from SisRUN by the `sisrun` function. Local, like the
 * Garmin calendar: each device reads it on its own.
 */
const META_KEY = 'sisrun'
/** Weeks kept after SisRUN stops sending them: the calendar's past days and the coach report use them. */
const KEEP_DAYS = 70
/** The weeks after the current one the function can read. */
const MAX_WEEKS_AHEAD = 2
/** After a failed read, the next one on its own waits this long (a wrong password isn't tried every sync). */
const RETRY_AFTER_ERROR_MS = 6 * 3_600_000
const WEEK_MS = 7 * 86_400_000

export interface CoachPlan {
  /** When the last read came. */
  fetchedAt?: number
  /** Each week's workouts, by its Monday. */
  weeks: Record<string, CoachWorkout[]>
  /**
   * The SisRUN workouts of the Garmin calendar (by their keys, name and day) that were there when
   * their week was last read: a new one or a renamed one means SisRUN has something to read.
   */
  seen?: string[]
  /** The last read's problem, until one works; `missing` when the secrets aren't set. */
  error?: { message: string; at: number; missing?: boolean }
}

/**
 * The plan after a read: each week that came replaces the one kept, unless it came without its
 * details (the structure would be lost); weeks that ended more than 70 days ago go.
 */
export function mergePlan(kept: CoachPlan, weeks: CoachWeek[], fetchedAt: number, today: DayKey): CoachPlan {
  const next: Record<string, CoachWorkout[]> = { ...kept.weeks }
  for (const week of weeks) {
    if (week.detailsMissing && next[week.start]?.length) continue
    next[week.start] = week.workouts
  }
  const oldest = shiftDay(today, -KEEP_DAYS)
  for (const start of Object.keys(next)) if (shiftDay(start, 6) < oldest) delete next[start]
  return { fetchedAt, weeks: next }
}

/** The Monday a day's SisRUN week starts on (the app's weeks start on Sunday, SisRUN's on Monday). */
export const sisrunWeek = (date: DayKey): DayKey => shiftDay(date, -((parseDay(date).getDay() + 6) % 7))

/** How many weeks after today's a day's SisRUN week is. */
const weeksFrom = (today: DayKey, date: DayKey) =>
  Math.round((parseDay(sisrunWeek(date)).getTime() - parseDay(sisrunWeek(today)).getTime()) / WEEK_MS)

/** The SisRUN workouts of the Garmin calendar from today to the end of the last week SisRUN can be read for, hidden ones and rest days left out. */
function readableWorkouts(events: PlannedEvent[] | null, times: EventTime[], today: DayKey): { event: PlannedEvent; key: string }[] {
  const hidden = hiddenKeys(times)
  return keyedEvents(events ?? []).filter(
    ({ event, key }) =>
      !hidden.has(key) &&
      event.date >= today &&
      weeksFrom(today, event.date) <= MAX_WEEKS_AHEAD &&
      fromCoach(event) &&
      eventKind(event) !== 'rest',
  )
}

/**
 * Whether SisRUN has something to read, and how far: the weeks after the current one up to the
 * latest SisRUN workout of the Garmin calendar not seen at a read yet (a week the coach just
 * published, or a workout renamed because the coach changed it). Undefined when there's none.
 */
export function weeksToRead(events: PlannedEvent[] | null, times: EventTime[], seen: string[], today: DayKey): number | undefined {
  const known = new Set(seen)
  const unseen = readableWorkouts(events, times, today).filter(({ key }) => !known.has(key))
  if (unseen.length === 0) return undefined
  return Math.max(...unseen.map(({ event }) => weeksFrom(today, event.date)))
}

/** The day in a workout's key (`t:name|2026-11-06`, or with `#2`). */
const keyDay = (key: string) => /\|(\d{4}-\d{2}-\d{2})/.exec(key)?.[1]

/**
 * The workouts seen after reading the current week and `ahead` more: the ones of those weeks join
 * the ones seen before, and those of days more than a week past go.
 */
export function markSeen(seen: string[], events: PlannedEvent[] | null, times: EventTime[], today: DayKey, ahead: number): string[] {
  const read = readableWorkouts(events, times, today)
    .filter(({ event }) => weeksFrom(today, event.date) <= ahead)
    .map(({ key }) => key)
  const oldest = shiftDay(today, -7)
  return [...new Set([...seen.filter((key) => (keyDay(key) ?? '') >= oldest), ...read])]
}

/** Every workout kept, by date. */
export const planWorkouts = (plan: CoachPlan | undefined): CoachWorkout[] =>
  Object.keys(plan?.weeks ?? {})
    .sort()
    .flatMap((start) => plan!.weeks[start])

export async function readPlan(): Promise<CoachPlan> {
  return ((await db.meta.get(META_KEY))?.value as CoachPlan | undefined) ?? { weeks: {} }
}

export const useCoachPlan = (): CoachPlan | undefined => useLiveQuery(readPlan)

/** The coach's workouts, for the calendar: none until SisRUN is set up. */
export function useCoachWorkouts(): CoachWorkout[] | undefined {
  const plan = useCoachPlan()
  return useMemo(() => (plan ? planWorkouts(plan) : undefined), [plan])
}

/** Whether SisRUN was ever read on this device, or its secrets are known to be missing. */
export const coachConfigured = (plan: CoachPlan | undefined): boolean => !!plan?.fetchedAt && !plan.error?.missing

/** A failed read; `missing` when the function says the secrets aren't set. */
class PlanError extends Error {
  constructor(
    message: string,
    readonly missing = false,
  ) {
    super(message)
  }
}

/** The Garmin calendar as the last Garmin sync left it (the `garminCalendar` meta of garmin/sync). */
const calendarEvents = async (): Promise<PlannedEvent[] | null> =>
  ((await db.meta.get('garminCalendar'))?.value as { events?: PlannedEvent[] } | undefined)?.events ?? null

let running = false

/**
 * Reads the coach's plan from SisRUN, sparingly: on its own (after each Garmin sync) only when the
 * Garmin calendar has a SisRUN workout this device hasn't read yet, and only the weeks up to it;
 * after a failure, not again for 6 hours. `force` (Ler agora) reads the current week and the next
 * one right away. Never throws: a failure is kept for Ajustes to show.
 */
export async function importCoachPlan({ force = false } = {}): Promise<void> {
  if (!supabase || !getSyncState().email || running) return
  running = true
  try {
    const kept = await readPlan()
    const today = dayKey()
    const [events, times] = await Promise.all([calendarEvents(), db.eventTimes.toArray().then(alive)])
    let ahead = 1
    if (!force) {
      const failed = kept.error && (!kept.fetchedAt || kept.error.at > kept.fetchedAt)
      if (failed && Date.now() - kept.error!.at < RETRY_AFTER_ERROR_MS) return
      const needed = weeksToRead(events, times, kept.seen ?? [], today)
      if (needed === undefined) return
      ahead = needed
    }
    try {
      const { data, error } = await supabase.functions.invoke('sisrun', { body: { weeksAhead: ahead } })
      if (error instanceof FunctionsHttpError) {
        const payload = (await error.context.json().catch(() => null)) as { error?: string; missing?: string } | null
        throw new PlanError(payload?.error ?? 'O SisRUN não respondeu.', payload?.missing === 'credentials')
      }
      if (error) throw new PlanError('Não foi possível falar com o servidor. Confira a internet.')
      const weeks = (data as { weeks?: CoachWeek[] } | null)?.weeks ?? []
      const latest = await readPlan()
      await db.meta.put({
        key: META_KEY,
        value: { ...mergePlan(latest, weeks, Date.now(), today), seen: markSeen(latest.seen ?? [], events, times, today, ahead) },
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const missing = cause instanceof PlanError && cause.missing
      await db.meta.put({ key: META_KEY, value: { ...(await readPlan()), error: { message, at: Date.now(), ...(missing && { missing }) } } })
    }
  } finally {
    running = false
  }
}
