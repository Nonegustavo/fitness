import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { notifyLocalChange } from '../../db/events'
import { alive, patch, remove, restore, save } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { EventTime, WalkRoutine, WorkoutPlan, WorkoutSession, WorkoutTemplate } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { useActivities } from '../activities/activities'
import type { PlannedEvent } from '../garmin/calendar'
import { usePlannedEvents } from '../garmin/sync'
import { nextTemplate } from '../training/stats'
import { useSessions, useTemplates } from '../training/training'
import { buildAgenda, hiddenEvents, type AgendaItem } from './agenda'
import { isRoutineDay, type WalkFields } from './walks'

/** The templates and walks scheduled between two days (inclusive). */
export function usePlans(from: DayKey, to: DayKey): WorkoutPlan[] | undefined {
  return useLiveQuery(
    async () => alive(await db.workoutPlans.where('date').between(from, to, true, true).toArray()),
    [from, to],
  )
}

/** The same with the deleted rows, which take a weekly walk's day off. */
function usePlanRows(from: DayKey, to: DayKey): WorkoutPlan[] | undefined {
  return useLiveQuery(() => db.workoutPlans.where('date').between(from, to, true, true).toArray(), [from, to])
}

/** The walks planned every week; null when there are none, undefined while loading. */
export function useWalkRoutine(): WalkRoutine | null | undefined {
  return useLiveQuery(async () => (await db.settings.get(SETTINGS_ID))?.walkRoutine ?? null)
}

export const schedule = (date: DayKey, templateId: string, time?: string) =>
  save(db.workoutPlans, { date, templateId, ...(time ? { time } : {}) })

/** A cleared time is removed (Dexie drops fields updated to undefined). */
export const reschedule = (id: string, changes: Partial<Pick<WorkoutPlan, 'date' | 'templateId' | 'time'>>) =>
  patch(db.workoutPlans, id, changes)

export const unschedule = (id: string) => remove(db.workoutPlans, id)
export const undoUnschedule = (id: string) => restore(db.workoutPlans, id)

const walkFields = ({ time, targetMin, targetKm }: WalkFields) => ({
  ...(time && { time }),
  ...(targetMin && { targetMin }),
  ...(targetKm && { targetKm }),
})

/** A walk on one day, not repeated. */
export const scheduleWalk = (date: DayKey, fields: WalkFields) =>
  save(db.workoutPlans, { date, kind: 'walk', ...walkFields(fields) })

/**
 * Changes one walk. A weekly one gets its own row for that day (`walk-<date>`), which then wins
 * over the routine there; one scheduled on its own can also move to another day.
 */
export async function changeWalk(plan: WorkoutPlan, fields: WalkFields & { date?: DayKey }): Promise<void> {
  if (isRoutineDay(plan)) await save(db.workoutPlans, { id: plan.id, date: plan.date, kind: 'walk', ...walkFields(fields) })
  else {
    const { time, targetMin, targetKm } = fields
    await patch(db.workoutPlans, plan.id, { date: fields.date ?? plan.date, time, targetMin, targetKm })
  }
}

/**
 * Takes a walk off its day. A weekly one leaves its row deleted (made here when the day had none),
 * so the day stays off on every device; undoing brings the row back.
 */
export async function dropWalk(plan: WorkoutPlan): Promise<void> {
  if (!isRoutineDay(plan)) return remove(db.workoutPlans, plan.id)
  await db.workoutPlans.put({ ...plan, kind: 'walk', updatedAt: Date.now(), deleted: 1, dirty: 1 })
  notifyLocalChange()
}

export const undoDropWalk = (id: string) => restore(db.workoutPlans, id)

/** After the weekly walk changes, a day that had been changed on its own takes the new values too. */
export async function refreshRoutineDay(id: string, fields: WalkFields): Promise<void> {
  const row = await db.workoutPlans.get(id)
  if (row && !row.deleted) await save(db.workoutPlans, { id, date: row.date, kind: 'walk', ...walkFields(fields) })
}

/** Saves the weekly walks, or ends them (undefined). */
export const setWalkRoutine = (walkRoutine: WalkRoutine | undefined) => patch(db.settings, SETTINGS_ID, { walkRoutine })

/** The times set for the Garmin workouts (and the hidden ones) between two days. */
export function useEventTimes(from: DayKey, to: DayKey): EventTime[] | undefined {
  return useLiveQuery(
    async () => alive(await db.eventTimes.where('date').between(from, to, true, true).toArray()),
    [from, to],
  )
}

const eventRow = async (key: string): Promise<EventTime | undefined> => {
  const row = await db.eventTimes.get(key)
  return row && !row.deleted ? row : undefined
}

/** Plans a Garmin workout at a time ("07:00"), or clears the time; a hidden one stays hidden. */
export async function setEventTime(key: string, date: DayKey, time: string | undefined): Promise<void> {
  const row = await eventRow(key)
  if (time) await save(db.eventTimes, { id: key, date, time, ...(row?.hidden && { hidden: true }) })
  else if (row?.hidden) await patch(db.eventTimes, key, { time: undefined })
  else if (row) await remove(db.eventTimes, key)
}

/** Hides a Garmin workout on its day (a duplicate, say), or brings it back with the time it had. */
export async function setEventHidden(key: string, date: DayKey, hidden: boolean): Promise<void> {
  const row = await eventRow(key)
  if (hidden) await save(db.eventTimes, { id: key, date, ...(row?.time && { time: row.time }), hidden: true })
  else if (row?.time) await save(db.eventTimes, { id: key, date, time: row.time })
  else if (row) await remove(db.eventTimes, key)
}

/** The Garmin workouts hidden from `from` on, to bring back; undefined while loading. */
export function useHiddenEvents(from: DayKey): { event: PlannedEvent; key: string }[] | undefined {
  const events = usePlannedEvents()
  const times = useLiveQuery(async () => alive(await db.eventTimes.where('date').aboveOrEqual(from).toArray()), [from])
  return useMemo(
    () => (events === undefined || !times ? undefined : hiddenEvents(events, times).filter(({ event }) => event.date >= from)),
    [events, times, from],
  )
}

/** The calendar of the days from `from` to `to`; undefined while it loads. */
export function useAgenda(from: DayKey, to: DayKey, today: DayKey): AgendaItem[] | undefined {
  const plans = usePlanRows(from, to)
  const eventTimes = useEventTimes(from, to)
  const walkRoutine = useWalkRoutine()
  const events = usePlannedEvents()
  const sessions = useSessions()
  const activities = useActivities()
  const templates = useTemplates()
  return useMemo(() => {
    if (!plans || !eventTimes || walkRoutine === undefined || events === undefined || !sessions || !activities || !templates) {
      return undefined
    }
    return buildAgenda(from, to, today, {
      plans,
      events,
      sessions,
      activities,
      templates,
      eventTimes,
      walkRoutine: walkRoutine ?? undefined,
    })
  }, [from, to, today, plans, eventTimes, walkRoutine, events, sessions, activities, templates])
}

/** Today's scheduled template not done yet (the first, when there are two). */
export function plannedToday(
  plans: WorkoutPlan[],
  templates: WorkoutTemplate[],
  sessions: WorkoutSession[],
  today: DayKey,
): { plan: WorkoutPlan; template: WorkoutTemplate } | undefined {
  const done = (plan: WorkoutPlan) =>
    sessions.some((s) => s.date === today && s.templateId === plan.templateId && s.endedAt)
  const pending = plans
    .filter((plan) => plan.date === today && plan.kind !== 'walk' && !!plan.templateId && !done(plan))
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
  for (const plan of pending) {
    const template = templates.find((t) => t.id === plan.templateId)
    if (template) return { plan, template }
  }
  return undefined
}

/**
 * The template to start today: the one scheduled for today, or else the next in the rotation.
 * `planned` tells which, for the label. undefined while loading or with no template at all.
 */
export function useTodayTemplate(
  today: DayKey,
): { template: WorkoutTemplate; plan?: WorkoutPlan } | undefined {
  const plans = usePlans(today, today)
  const templates = useTemplates()
  const sessions = useSessions()
  return useMemo(() => {
    if (!plans || !templates || !sessions) return undefined
    const planned = plannedToday(plans, templates, sessions, today)
    if (planned) return planned
    const next = nextTemplate(templates, sessions.filter((session) => session.endedAt))
    return next && { template: next }
  }, [plans, templates, sessions, today])
}
