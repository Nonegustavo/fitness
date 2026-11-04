import type { Activity, WorkoutPlan, WorkoutSession, WorkoutTemplate } from '../../db/types'
import { dayTime, type DayKey } from '../../lib/dates'
import { activityLabel } from '../activities/activities'
import type { PlannedEvent } from '../garmin/calendar'

/** What an item of the calendar is, which picks its icon and color. */
export type AgendaKind = 'gym' | 'run' | 'walk' | 'ride' | 'swim' | 'rest' | 'other'

/**
 * planned: still ahead (or later today); done: it happened; missed: planned for a day that passed
 * without it; active: the gym workout in progress.
 */
export type AgendaStatus = 'planned' | 'done' | 'missed' | 'active'

/** One workout of a day: a template scheduled here, one from the Garmin calendar, or one done. */
export interface AgendaItem {
  key: string
  date: DayKey
  kind: AgendaKind
  title: string
  status: AgendaStatus
  /** When it starts or started: the planned time, or the start of what was done. */
  time?: number
  plan?: WorkoutPlan
  event?: PlannedEvent
  session?: WorkoutSession
  activity?: Activity
}

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * The kind of a workout from the Garmin calendar, read from its name and description. SisRUN sends
 * runs with names like "Rodagem" or "Intervalado", so anything unrecognized counts as a run.
 */
export function eventKind(event: Pick<PlannedEvent, 'title' | 'description'>): AgendaKind {
  const title = plain(event.title)
  const text = `${title} ${plain(event.description ?? '')}`
  if (/\b(descanso|folga|repouso|rest|off)\b/.test(title)) return 'rest'
  if (/muscula|forca|academia|strength|\bgym\b/.test(text)) return 'gym'
  if (/natac|\bnado\b|piscina|swim/.test(text)) return 'swim'
  if (/\bbike\b|pedal|cicli|bicicleta|spinning|\bride\b/.test(text)) return 'ride'
  if (/caminhada|\bwalk|trilha|\bhike/.test(title)) return 'walk'
  if (/yoga|pilates|along|mobilidade|funcional|hiit|crossfit/.test(title)) return 'other'
  return 'run'
}

/** SisRUN starts its names with the day ("06/11 Sex - Corrida 7 Km"), which the calendar already shows. */
export const eventTitle = (title: string): string =>
  title.replace(/^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+\p{L}{3,}\.?\s*[-–—:]\s*/u, '').trim() || title.trim()

/** The name for tight spots (the week strip, the widget): without the kind its icon already shows. */
export function shortTitle(item: Pick<AgendaItem, 'kind' | 'title'>): string {
  const short = item.kind === 'run' ? item.title.replace(/^corrida\b\s*[-–:]?\s*/i, '') : item.title
  return short ? short.charAt(0).toUpperCase() + short.slice(1) : item.title
}

/** The kind of a recorded activity (sport and sub-sport as the watch names them). */
export function activityKind(activity: Pick<Activity, 'sport' | 'subSport'>): AgendaKind {
  if (activity.subSport === 'strengthTraining') return 'gym'
  switch (activity.sport) {
    case 'running':
      return 'run'
    case 'walking':
    case 'hiking':
      return 'walk'
    case 'cycling':
    case 'eBiking':
      return 'ride'
    case 'swimming':
      return 'swim'
    default:
      return 'other'
  }
}

export interface AgendaSources {
  plans: WorkoutPlan[]
  /** The Garmin calendar, or null when it isn't set up. */
  events: PlannedEvent[] | null
  sessions: WorkoutSession[]
  activities: Activity[]
  templates: WorkoutTemplate[]
}

const sessionStatus = (session: WorkoutSession): AgendaStatus => (session.endedAt ? 'done' : 'active')

/**
 * Everything of the days from `from` to `to` (inclusive), in order. A scheduled template counts as
 * done by a workout of that template on its day (or, failing that, a strength activity of the
 * watch); a Garmin workout, by an activity of the same kind on its day. The watch's strength
 * activity on a day with a workout in the app is that same workout, so it isn't listed twice.
 */
export function buildAgenda(from: DayKey, to: DayKey, today: DayKey, sources: AgendaSources): AgendaItem[] {
  const inRange = (date: DayKey) => date >= from && date <= to
  const templateName = (id: string) => sources.templates.find((template) => template.id === id)?.name ?? 'Ficha apagada'
  const sessions = sources.sessions.filter((session) => !session.deleted && inRange(session.date))
  const activities = sources.activities.filter((activity) => !activity.deleted && inRange(activity.date))
  const usedSessions = new Set<string>()
  const usedActivities = new Set<string>()
  const items: AgendaItem[] = []

  const plans = sources.plans.filter((plan) => !plan.deleted && inRange(plan.date))
  for (const plan of plans) {
    const base = { key: `plan-${plan.id}`, date: plan.date, kind: 'gym' as const, plan }
    const session = sessions.find(
      (s) => s.date === plan.date && s.templateId === plan.templateId && !usedSessions.has(s.id),
    )
    if (session) {
      usedSessions.add(session.id)
      items.push({ ...base, title: session.name, status: sessionStatus(session), time: session.startedAt, session })
      continue
    }
    items.push({
      ...base,
      title: templateName(plan.templateId),
      status: plan.date < today ? 'missed' : 'planned',
      time: plan.time ? dayTime(plan.date, plan.time) : undefined,
    })
  }

  // A plan done only on the watch: its strength activity, when no workout of the app took that day.
  for (const item of items) {
    if (item.status === 'done' || item.status === 'active' || sessions.some((s) => s.date === item.date)) continue
    const activity = activities.find(
      (a) => a.date === item.date && activityKind(a) === 'gym' && !usedActivities.has(a.id),
    )
    if (!activity) continue
    usedActivities.add(activity.id)
    item.status = 'done'
    item.time = activity.startTime
    item.activity = activity
  }

  for (const session of sessions) {
    if (usedSessions.has(session.id)) continue
    items.push({
      key: `session-${session.id}`,
      date: session.date,
      kind: 'gym',
      title: session.name,
      status: sessionStatus(session),
      time: session.startedAt,
      session,
    })
  }

  for (const event of sources.events ?? []) {
    if (!inRange(event.date)) continue
    const kind = eventKind(event)
    const base = {
      key: `event-${event.uid ?? event.title}-${event.date}`,
      date: event.date,
      kind,
      title: eventTitle(event.title),
      event,
    }
    const activity =
      kind === 'rest'
        ? undefined
        : activities.find((a) => a.date === event.date && activityKind(a) === kind && !usedActivities.has(a.id))
    if (activity) {
      usedActivities.add(activity.id)
      items.push({ ...base, status: 'done', time: activity.startTime, activity })
    } else {
      items.push({ ...base, status: event.date < today && kind !== 'rest' ? 'missed' : 'planned', time: event.time })
    }
  }

  const gymDays = new Set(sessions.map((session) => session.date))
  for (const activity of activities) {
    if (usedActivities.has(activity.id)) continue
    const kind = activityKind(activity)
    if (kind === 'gym' && gymDays.has(activity.date)) continue
    items.push({
      key: `activity-${activity.id}`,
      date: activity.date,
      kind,
      title: activity.title?.trim() || activityLabel(activity),
      status: 'done',
      time: activity.startTime,
      activity,
    })
  }

  return items.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.time ?? Infinity) - (b.time ?? Infinity) || a.key.localeCompare(b.key),
  )
}

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`
const KM_RANGE = new RegExp(String.raw`${NUMBER}\s*(?:-|–|a|até)\s*${NUMBER}\s*km`, 'i')
const KM = new RegExp(String.raw`${NUMBER}\s*km`, 'i')
const decimal = (text: string) => parseFloat(text.replace(',', '.'))

/** The distance in a workout's name: "4,48 - 4,97 Km" counts the longer end, "7 Km" is 7, "(6 a 8km)" is 8. */
export function eventKm(title: string): number | undefined {
  const range = KM_RANGE.exec(title)
  if (range) return decimal(range[2])
  const single = KM.exec(title)
  return single ? decimal(single[1]) : undefined
}

/**
 * A race the user put in the Garmin calendar: not one of SisRUN's workouts (those start with the
 * day, "06/11 Sex - …"), and named like a race.
 */
export function isRace(event: Pick<PlannedEvent, 'title'>): boolean {
  if (/^\s*\d{1,2}\/\d{1,2}/.test(event.title)) return false
  return /r[uú]stica|maratona|meia|prova|corrida d[aeo]s?\b|\b\d+\s?k\b|\d\s?km\b|trail|desafio|circuito|\brun\b/i.test(event.title)
}

/** The next race from today on, if the Garmin calendar has one. */
export function nextRace(events: PlannedEvent[] | null, today: DayKey): PlannedEvent | undefined {
  return (events ?? [])
    .filter((event) => event.date >= today && isRace(event))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? 0) - (b.time ?? 0))[0]
}

export interface WeekSummary {
  /** Workouts done or in progress (planned or not). */
  done: number
  /** Every workout of the week: the ones done and the ones planned (rest days don't count). */
  total: number
  runKm: number
  /** The week's running as planned: the km run plus the runs still to do, when their names say. */
  plannedRunKm?: number
  /** Time of the workouts done: the watch's timer, or the gym workout's length. */
  trainedSec: number
}

/** How a week is going, from its agenda (like SisRUN's "Resumo da semana"). */
export function weekSummary(items: AgendaItem[]): WeekSummary {
  const workouts = items.filter((item) => item.kind !== 'rest')
  const done = workouts.filter((item) => item.status === 'done' || item.status === 'active')
  let runKm = 0
  let plannedRunKm = 0
  let trainedSec = 0
  for (const item of done) {
    if (item.activity) {
      trainedSec += item.activity.timerSec
      if (item.kind === 'run' && item.activity.distanceM) runKm += item.activity.distanceM / 1000
    } else if (item.session?.endedAt) {
      trainedSec += (item.session.endedAt - item.session.startedAt) / 1000
    }
  }
  // The Garmin calendar only keeps what is ahead, so the week's plan is what was run plus the runs still to do.
  for (const item of workouts) {
    if (item.kind === 'run' && item.status === 'planned' && item.event) plannedRunKm += eventKm(item.event.title) ?? 0
  }
  const km = (value: number) => Math.round(value * 100) / 100
  return {
    done: done.length,
    total: workouts.length,
    runKm: km(runKm),
    plannedRunKm: plannedRunKm > 0 ? km(runKm + plannedRunKm) : undefined,
    trainedSec,
  }
}

/** The items of each day, for calendars. */
export function byDay(items: AgendaItem[]): Map<DayKey, AgendaItem[]> {
  const days = new Map<DayKey, AgendaItem[]>()
  for (const item of items) days.set(item.date, [...(days.get(item.date) ?? []), item])
  return days
}

/**
 * The template that would come next on `date`: the one after the latest workout before that day in
 * the rotation, counting the workouts done and the ones scheduled from today on.
 */
export function suggestTemplate(
  date: DayKey,
  today: DayKey,
  { templates, sessions, plans }: Pick<AgendaSources, 'templates' | 'sessions' | 'plans'>,
): WorkoutTemplate | undefined {
  const rotation = templates.filter((t) => !t.deleted && !t.archived).sort((a, b) => a.order - b.order)
  if (rotation.length === 0) return undefined
  const inRotation = (id: string | undefined) => rotation.some((template) => template.id === id)
  let last: { at: number; templateId: string } | undefined
  const consider = (at: number, templateId: string) => {
    if (!last || at > last.at) last = { at, templateId }
  }
  for (const session of sessions) {
    if (session.deleted || !session.endedAt || session.date >= date || !inRotation(session.templateId)) continue
    consider(session.startedAt, session.templateId!)
  }
  for (const plan of plans) {
    if (plan.deleted || plan.date >= date || plan.date < today || !inRotation(plan.templateId)) continue
    // Already done: the workout above stands for it.
    if (sessions.some((s) => !s.deleted && s.date === plan.date && s.templateId === plan.templateId)) continue
    consider(dayTime(plan.date, plan.time ?? '23:59'), plan.templateId)
  }
  if (!last) return rotation[0]
  const index = rotation.findIndex((template) => template.id === last!.templateId)
  return rotation[(index + 1) % rotation.length]
}
