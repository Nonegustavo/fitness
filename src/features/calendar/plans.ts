import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { alive, patch, remove, restore, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { WorkoutPlan, WorkoutSession, WorkoutTemplate } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { useActivities } from '../activities/activities'
import { usePlannedEvents } from '../garmin/sync'
import { nextTemplate } from '../training/stats'
import { useSessions, useTemplates } from '../training/training'
import { buildAgenda, type AgendaItem } from './agenda'

/** The templates scheduled between two days (inclusive). */
export function usePlans(from: DayKey, to: DayKey): WorkoutPlan[] | undefined {
  return useLiveQuery(
    async () => alive(await db.workoutPlans.where('date').between(from, to, true, true).toArray()),
    [from, to],
  )
}

export const schedule = (date: DayKey, templateId: string, time?: string) =>
  save(db.workoutPlans, { date, templateId, ...(time ? { time } : {}) })

/** A cleared time is removed (Dexie drops fields updated to undefined). */
export const reschedule = (id: string, changes: Partial<Pick<WorkoutPlan, 'date' | 'templateId' | 'time'>>) =>
  patch(db.workoutPlans, id, changes)

export const unschedule = (id: string) => remove(db.workoutPlans, id)
export const undoUnschedule = (id: string) => restore(db.workoutPlans, id)

/** The calendar of the days from `from` to `to`; undefined while it loads. */
export function useAgenda(from: DayKey, to: DayKey, today: DayKey): AgendaItem[] | undefined {
  const plans = usePlans(from, to)
  const events = usePlannedEvents()
  const sessions = useSessions()
  const activities = useActivities()
  const templates = useTemplates()
  return useMemo(() => {
    if (!plans || events === undefined || !sessions || !activities || !templates) return undefined
    return buildAgenda(from, to, today, { plans, events, sessions, activities, templates })
  }, [from, to, today, plans, events, sessions, activities, templates])
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
    .filter((plan) => plan.date === today && !done(plan))
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
