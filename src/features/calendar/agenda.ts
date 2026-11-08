import type { Activity, EventTime, Race, WalkRoutine, WorkoutPlan, WorkoutSession, WorkoutTemplate } from '../../db/types'
import { dayTime, type DayKey } from '../../lib/dates'
import { activityLabel } from '../activities/activities'
import type { PlannedEvent } from '../garmin/calendar'
import type { CoachWorkout } from '../sisrun/coachPlan'
import { isRoutineDay, routineWalks, walkTitle } from './walks'

/** What an item of the calendar is, which picks its icon and color. */
export type AgendaKind = 'gym' | 'run' | 'walk' | 'ride' | 'swim' | 'rest' | 'other'

/**
 * planned: still ahead (or later today); done: it happened; missed: planned for a day that passed
 * without it; active: the gym workout in progress.
 */
export type AgendaStatus = 'planned' | 'done' | 'missed' | 'active'

/** One workout of a day: a template or a walk scheduled here, one from the Garmin calendar, or one done. */
export interface AgendaItem {
  key: string
  date: DayKey
  kind: AgendaKind
  title: string
  status: AgendaStatus
  /** When it starts or started: the planned time, or the start of what was done. */
  time?: number
  plan?: WorkoutPlan
  /** A walk of the weekly routine, rather than one scheduled on its own. */
  repeats?: boolean
  event?: PlannedEvent
  /** A Garmin workout's key, for the time the user plans it at. */
  eventKey?: string
  /** That time ("07:00"), when the user set one. */
  customTime?: string
  /** For a SisRUN workout of the Garmin calendar: the coach's prescription, read from SisRUN. */
  coach?: CoachWorkout
  /** A race of the app's list, which on its day stands for the Garmin calendar's runs too. */
  race?: Race
  session?: WorkoutSession
  activity?: Activity
}

/**
 * The key of a Garmin calendar workout, for the time the user plans it at: its name and its day.
 * Not its UID: the published calendar makes up new UIDs every time it is fetched, which made the
 * time set for a workout disappear on the next sync.
 */
export const eventKey = (event: Pick<PlannedEvent, 'title' | 'date'>): string =>
  `t:${event.title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()}|${event.date}`

/**
 * Each Garmin workout with its key. Two with the same name on the same day (the feed repeating
 * one) get "#2", "#3"…, so either can have its own time or be hidden. The copies are ordered by
 * time and description first, so each keeps its key on the next fetch.
 */
export function keyedEvents(events: PlannedEvent[]): { event: PlannedEvent; key: string }[] {
  const groups = new Map<string, PlannedEvent[]>()
  for (const event of events) {
    const base = eventKey(event)
    groups.set(base, [...(groups.get(base) ?? []), event])
  }
  const keys = new Map<PlannedEvent, string>()
  for (const [base, group] of groups) {
    group
      .sort((a, b) => (a.time ?? -1) - (b.time ?? -1) || (a.description ?? '').localeCompare(b.description ?? ''))
      .forEach((event, i) => keys.set(event, i === 0 ? base : `${base}#${i + 1}`))
  }
  return events.map((event) => ({ event, key: keys.get(event)! }))
}

/** The keys of the Garmin workouts the user hid (a race listed twice, say). */
export const hiddenKeys = (times: EventTime[] | undefined): Set<string> =>
  new Set((times ?? []).filter((time) => !time.deleted && time.hidden).map((time) => time.id))

/** The Garmin calendar without the hidden workouts, which leave every list. */
export function visibleEvents(events: PlannedEvent[] | null, times: EventTime[] | undefined): PlannedEvent[] | null {
  if (!events) return events
  const hidden = hiddenKeys(times)
  return keyedEvents(events).flatMap(({ event, key }) => (hidden.has(key) ? [] : [event]))
}

/** The hidden workouts, by day, with the key that brings each one back. */
export function hiddenEvents(events: PlannedEvent[] | null, times: EventTime[] | undefined): { event: PlannedEvent; key: string }[] {
  const hidden = hiddenKeys(times)
  return keyedEvents(events ?? [])
    .filter(({ key }) => hidden.has(key))
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || (a.event.time ?? 0) - (b.event.time ?? 0))
}

/** Times saved before, keyed by the feed's UID instead of the name. */
const isLegacyKey = (id: string) => !id.startsWith('t:')

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
  /** The scheduled workouts; deleted rows too, since a deleted weekly walk's row takes its day off. */
  plans: WorkoutPlan[]
  /** The Garmin calendar, or null when it isn't set up. */
  events: PlannedEvent[] | null
  sessions: WorkoutSession[]
  activities: Activity[]
  templates: WorkoutTemplate[]
  /** The times the user set for the Garmin workouts, and the ones hidden. */
  eventTimes?: EventTime[]
  /** The walks planned every week. */
  walkRoutine?: WalkRoutine
  /** The coach's plan read from SisRUN, which details the SisRUN workouts of the Garmin calendar. */
  coach?: CoachWorkout[]
  /** The races of the app's list. */
  races?: Race[]
}

/** The run that was a race: the one linked to it, else the longest run of its day. */
export function raceRun(race: Pick<Race, 'date' | 'activityId'>, activities: Activity[]): Activity | undefined {
  if (race.activityId) return activities.find((activity) => activity.id === race.activityId && !activity.deleted)
  return activities
    .filter((activity) => !activity.deleted && activity.date === race.date && activityKind(activity) === 'run')
    .reduce<Activity | undefined>((best, run) => ((run.distanceM ?? 0) > (best?.distanceM ?? 0) ? run : best), undefined)
}

/** A race's distance in km: the longer end of a range ("6 a 8 km"). */
export const raceKm = (race: Pick<Race, 'distanceM' | 'rangeM'>): number | undefined => {
  const meters = race.rangeM?.[1] ?? race.distanceM
  return meters === undefined ? undefined : meters / 1000
}

/** A workout SisRUN sent to the Garmin calendar: its name starts with the day ("06/11 Sex - …"). */
export const fromCoach = (event: Pick<PlannedEvent, 'title'>): boolean =>
  /^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+\p{L}{3,}\.?\s*[-–—:]/u.test(event.title)

/**
 * The coach's prescription for a SisRUN workout of the Garmin calendar, taken from that day's ones
 * not matched yet: the one whose type the name has ("… Corrida Intervalado ativo …"), else the
 * day's first. A walk SisRUN only imported ("Feito Avulso") isn't a prescription.
 */
function takePrescription(event: PlannedEvent, left: Map<DayKey, CoachWorkout[]>): CoachWorkout | undefined {
  const day = left.get(event.date)
  if (!day?.length) return undefined
  const name = plain(event.title)
  const typed = day.findIndex((workout) => workout.type && name.includes(plain(workout.type)))
  const [workout] = day.splice(typed === -1 ? 0 : typed, 1)
  return workout
}

const sessionStatus = (session: WorkoutSession): AgendaStatus => (session.endedAt ? 'done' : 'active')

/** The activity that started nearest a time; the day's first without one. */
function nearest(candidates: Activity[], time: number | undefined): Activity | undefined {
  const distance = (activity: Activity) => (time === undefined ? activity.startTime : Math.abs(activity.startTime - time))
  return candidates.reduce<Activity | undefined>((best, activity) => (!best || distance(activity) < distance(best) ? activity : best), undefined)
}

/**
 * Everything of the days from `from` to `to` (inclusive), in order. A scheduled template counts as
 * done by a workout of that template on its day (or, failing that, a strength activity of the
 * watch); a walk, by a walk or a hike of the watch that day; a Garmin workout, by an activity of
 * the same kind on its day. The watch's strength activity on a day with a workout in the app is
 * that same workout, so it isn't listed twice. Hidden Garmin workouts are left out.
 */
export function buildAgenda(from: DayKey, to: DayKey, today: DayKey, sources: AgendaSources): AgendaItem[] {
  const inRange = (date: DayKey) => date >= from && date <= to
  const templateName = (id: string | undefined) => sources.templates.find((template) => template.id === id)?.name ?? 'Ficha apagada'
  const sessions = sources.sessions.filter((session) => !session.deleted && inRange(session.date))
  const activities = sources.activities.filter((activity) => !activity.deleted && inRange(activity.date))
  const usedSessions = new Set<string>()
  const usedActivities = new Set<string>()
  const items: AgendaItem[] = []

  // The weekly walk's own rows go with the routine, below.
  const plans = sources.plans.filter((plan) => !plan.deleted && inRange(plan.date) && !isRoutineDay(plan))
  for (const plan of plans) {
    if (plan.kind === 'walk') continue
    const base = { key: `plan-${plan.id}`, date: plan.date, kind: 'gym' as const, plan }
    const session = sessions.find(
      (s) => s.date === plan.date && !!plan.templateId && s.templateId === plan.templateId && !usedSessions.has(s.id),
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

  // Walks: done by a walk or a hike that day, the one that started nearest the planned time.
  const walks = [
    ...plans.filter((plan) => plan.kind === 'walk').map((plan) => ({ plan, repeats: false })),
    ...routineWalks(sources.walkRoutine, sources.plans, from, to, today).map((plan) => ({ plan, repeats: true })),
  ].sort((a, b) => a.plan.date.localeCompare(b.plan.date) || (a.plan.time ?? '99').localeCompare(b.plan.time ?? '99'))
  for (const { plan, repeats } of walks) {
    const planned = plan.time ? dayTime(plan.date, plan.time) : undefined
    const base = { key: `plan-${plan.id}`, date: plan.date, kind: 'walk' as const, title: walkTitle(plan), plan, ...(repeats && { repeats }) }
    const activity = nearest(
      activities.filter((a) => a.date === plan.date && activityKind(a) === 'walk' && !usedActivities.has(a.id)),
      planned,
    )
    if (activity) {
      usedActivities.add(activity.id)
      items.push({ ...base, status: 'done', time: activity.startTime, activity })
    } else {
      items.push({ ...base, status: plan.date < today ? 'missed' : 'planned', time: planned })
    }
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

  // The races of the app's list, done by their run. On a race's day the Garmin calendar's runs (the
  // race brought from it, the coach's workout for the race) are that same race: one item, not three.
  const raceDays = new Set<DayKey>()
  const broughtKeys = new Set<string>()
  const races = (sources.races ?? [])
    .filter((race) => !race.deleted && inRange(race.date))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
  for (const race of races) {
    raceDays.add(race.date)
    if (race.eventKey) broughtKeys.add(race.eventKey)
    const base = { key: `race-${race.id}`, date: race.date, kind: 'run' as const, title: race.name, race }
    const activity = raceRun(race, activities.filter((a) => !usedActivities.has(a.id)))
    if (activity) {
      usedActivities.add(activity.id)
      items.push({ ...base, status: 'done', time: activity.startTime, activity })
    } else {
      items.push({
        ...base,
        status: race.date < today ? 'missed' : 'planned',
        time: race.time ? dayTime(race.date, race.time) : undefined,
      })
    }
  }

  const saved = (sources.eventTimes ?? []).filter((time) => !time.deleted).sort((a, b) => a.updatedAt - b.updatedAt)
  const times = new Map(saved.flatMap((time) => (time.time ? [[time.id, time.time] as const] : [])))
  const hidden = hiddenKeys(saved)
  // A time saved under an old UID key still counts for the day's only Garmin workout (the latest one set).
  const legacy = new Map(saved.flatMap((time) => (isLegacyKey(time.id) && time.time ? [[time.date, time.time] as const] : [])))
  const eventsOn = new Map<DayKey, number>()
  for (const event of sources.events ?? []) eventsOn.set(event.date, (eventsOn.get(event.date) ?? 0) + 1)
  // The coach's prescriptions by day, in the planilha's order, for the SisRUN workouts below.
  const prescriptions = new Map<DayKey, CoachWorkout[]>()
  for (const workout of sources.coach ?? []) {
    if (workout.status === 'Feito Avulso' || !inRange(workout.date)) continue
    prescriptions.set(workout.date, [...(prescriptions.get(workout.date) ?? []), workout])
  }
  for (const { event, key } of keyedEvents(sources.events ?? [])) {
    if (!inRange(event.date) || hidden.has(key) || broughtKeys.has(key)) continue
    const kind = eventKind(event)
    if (kind === 'run' && raceDays.has(event.date)) continue
    const customTime = times.get(key) ?? (eventsOn.get(event.date) === 1 ? legacy.get(event.date) : undefined)
    const coach = kind !== 'rest' && fromCoach(event) ? takePrescription(event, prescriptions) : undefined
    const base = {
      key: `event-${key}`,
      date: event.date,
      kind,
      title: eventTitle(event.title),
      event,
      eventKey: key,
      ...(customTime && { customTime }),
      ...(coach && { coach }),
    }
    const activity =
      kind === 'rest'
        ? undefined
        : activities.find((a) => a.date === event.date && activityKind(a) === kind && !usedActivities.has(a.id))
    if (activity) {
      usedActivities.add(activity.id)
      items.push({ ...base, status: 'done', time: activity.startTime, activity })
    } else {
      items.push({
        ...base,
        status: event.date < today && kind !== 'rest' ? 'missed' : 'planned',
        time: customTime ? dayTime(event.date, customTime) : event.time,
      })
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
// SisRUN sometimes leaves the unit out ("Corrida 3,725 - 4,48", "Fartlek 5,59"). Only decimals with a
// comma ending the name count, so "10x400 m" or a year never reads as kilometers.
const BARE_RANGE = /(\d+,\d+)\s*(?:-|–|a|até)\s*(\d+(?:,\d+)?)\s*$/i
const BARE = /(?:^|\s)(\d+,\d+)\s*$/
const decimal = (text: string) => parseFloat(text.replace(',', '.'))

/**
 * The distance in a workout's name, as a range: "4,48 - 4,97 Km", "(6 a 8km)", "7 Km" (7 to 7), and
 * SisRUN's "3,725 - 4,48" or "5,59" without the unit.
 */
export function eventDistance(title: string): { low: number; high: number } | undefined {
  const range = KM_RANGE.exec(title) ?? BARE_RANGE.exec(title)
  if (range) {
    const [a, b] = [decimal(range[1]), decimal(range[2])]
    return { low: Math.min(a, b), high: Math.max(a, b) }
  }
  const single = KM.exec(title) ?? BARE.exec(title)
  if (!single) return undefined
  const km = decimal(single[1])
  return { low: km, high: km }
}

/** The distance in a workout's name: "4,48 - 4,97 Km" counts the longer end, "7 Km" is 7, "(6 a 8km)" is 8. */
export const eventKm = (title: string): number | undefined => eventDistance(title)?.high

/** The km a run plans: a race's distance, what the coach prescribed on SisRUN, or what its name says. */
export const plannedKm = (item: Pick<AgendaItem, 'coach' | 'event' | 'race'>): number | undefined =>
  item.race ? raceKm(item.race) : (item.coach?.plannedKm ?? (item.event ? eventKm(item.event.title) : undefined))

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
  /** Workouts done or in progress (planned or not), walks included. */
  done: number
  /** Every workout of the week: the ones done and the ones planned (rest days don't count). */
  total: number
  runKm: number
  /** The week's running as planned: the km run plus the runs still to do, when their names say. */
  plannedRunKm?: number
  /** The km walked, kept apart from the running. */
  walkKm: number
  /** Time of the workouts done: the watch's timer, or the gym workout's length. */
  trainedSec: number
}

/** How a week is going, from its agenda (like SisRUN's "Resumo da semana"). */
export function weekSummary(items: AgendaItem[]): WeekSummary {
  const workouts = items.filter((item) => item.kind !== 'rest')
  const done = workouts.filter((item) => item.status === 'done' || item.status === 'active')
  let runKm = 0
  let plannedRunKm = 0
  let walkKm = 0
  let trainedSec = 0
  for (const item of done) {
    if (item.activity) {
      trainedSec += item.activity.timerSec
      if (item.kind === 'run' && item.activity.distanceM) runKm += item.activity.distanceM / 1000
      if (item.kind === 'walk' && item.activity.distanceM) walkKm += item.activity.distanceM / 1000
    } else if (item.session?.endedAt) {
      trainedSec += (item.session.endedAt - item.session.startedAt) / 1000
    }
  }
  // The Garmin calendar only keeps what is ahead, so the week's plan is what was run plus the runs still
  // to do: the distance the coach prescribed on SisRUN, or the one in the name.
  for (const item of workouts) {
    if (item.kind === 'run' && item.status === 'planned' && (item.event || item.race)) plannedRunKm += plannedKm(item) ?? 0
  }
  const km = (value: number) => Math.round(value * 100) / 100
  return {
    done: done.length,
    total: workouts.length,
    runKm: km(runKm),
    plannedRunKm: plannedRunKm > 0 ? km(runKm + plannedRunKm) : undefined,
    walkKm: km(walkKm),
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
  const inRotation = (id: string | undefined): id is string => rotation.some((template) => template.id === id)
  let last: { at: number; templateId: string } | undefined
  const consider = (at: number, templateId: string) => {
    if (!last || at > last.at) last = { at, templateId }
  }
  for (const session of sessions) {
    if (session.deleted || !session.endedAt || session.date >= date || !inRotation(session.templateId)) continue
    consider(session.startedAt, session.templateId)
  }
  for (const plan of plans) {
    const templateId = plan.templateId
    if (plan.deleted || plan.date >= date || plan.date < today || !inRotation(templateId)) continue
    // Already done: the workout above stands for it.
    if (sessions.some((s) => !s.deleted && s.date === plan.date && s.templateId === templateId)) continue
    consider(dayTime(plan.date, plan.time ?? '23:59'), templateId)
  }
  if (!last) return rotation[0]
  const index = rotation.findIndex((template) => template.id === last!.templateId)
  return rotation[(index + 1) % rotation.length]
}
