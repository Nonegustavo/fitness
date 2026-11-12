import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { alive, save } from '../../db/repo'
import { db, DEFAULT_SETTINGS, SETTINGS_ID } from '../../db/schema'
import type { ActivityStream, DailyInsight, InsightSection } from '../../db/types'
import { dayKey, shiftDay, type DayKey } from '../../lib/dates'
import { getSyncState, onSyncStateChange } from '../../sync/controller'
import { invokeFunction, LONG_TIMEOUT_MS } from '../../sync/functions'
import { supabase } from '../../sync/supabase'
import { buildAgenda, visibleEvents } from '../calendar/agenda'
import { coachSummary } from '../calendar/eventText'
import { garminSyncedAt, plannedEvents } from '../garmin/sync'
import { planWorkouts, readPlan } from '../sisrun/coachPlan'
import { loadSources } from '../insights/useDailyData'
import { isOutdoorRun } from '../running/running'
import { buildContext, hasRecentData } from './context'

const AREAS: InsightSection['area'][] = ['sono', 'recuperacao', 'treino', 'alimentacao', 'corpo', 'habitos', 'geral']

type InsightBody = Pick<DailyInsight, 'headline' | 'sections' | 'model'>

/** Checks the function's answer field by field; anything malformed is dropped, not trusted. */
export function parseInsight(value: unknown): InsightBody | undefined {
  const data = value as { headline?: unknown; sections?: unknown; model?: unknown } | null
  if (typeof data?.headline !== 'string' || !data.headline.trim() || !Array.isArray(data.sections)) return undefined
  const sections = data.sections.flatMap((raw): InsightSection[] => {
    const section = raw as Partial<Record<keyof InsightSection, unknown>>
    if (typeof section.title !== 'string' || typeof section.text !== 'string') return []
    const area = AREAS.includes(section.area as InsightSection['area']) ? (section.area as InsightSection['area']) : 'geral'
    const tips = Array.isArray(section.tips) ? section.tips.filter((tip): tip is string => typeof tip === 'string') : []
    return [{ area, title: section.title, text: section.text, tips: tips.slice(0, 3) }]
  })
  if (sections.length === 0) return undefined
  return { headline: data.headline.trim(), sections, model: typeof data.model === 'string' ? data.model : 'claude' }
}

interface GenerateState {
  generating: boolean
  error?: string
}

let state: GenerateState = { generating: false }
const listeners = new Set<() => void>()
const setState = (next: GenerateState) => {
  state = next
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useInsightState = (): GenerateState => useSyncExternalStore(subscribe, () => state)

const metaTime = async (key: string, field: string): Promise<number | undefined> => {
  const value = (await db.meta.get(key))?.value as Record<string, unknown> | undefined
  return typeof value?.[field] === 'number' ? (value[field] as number) : undefined
}

/** The summary of the data the analysis reads, built on the device from the local data. */
export async function contextFor(day: DayKey = dayKey(), withPrevious = true): Promise<string> {
  const from = shiftDay(day, -14)
  const to = shiftDay(day, 7)
  const [sources, settings, events, insights, plans, templates, eventTimes, exercises, measurements, raceRows] = await Promise.all([
    loadSources(),
    db.settings.get(SETTINGS_ID),
    plannedEvents(),
    db.insights.where('id').between(shiftDay(day, -4), shiftDay(day, -1), true, true).toArray(),
    // With the deleted rows: a deleted weekly walk's row takes its day off.
    db.workoutPlans.where('date').between(from, to, true, true).toArray(),
    db.workoutTemplates.toArray(),
    // All of them, so a workout hidden beyond the next week (the race) stays out too.
    db.eventTimes.toArray(),
    db.exercises.toArray(),
    db.measurements.toArray(),
    db.races.toArray(),
  ])
  const races = alive(raceRows)
  const runs = sources.activities.filter(isOutdoorRun)
  const [streams, garmin, healthConnect, calendar, coachPlan] = await Promise.all([
    db.activityStreams.bulkGet(runs.map((run) => run.id)),
    garminSyncedAt(),
    metaTime('healthConnect', 'lastImportAt'),
    metaTime('garminCalendar', 'fetchedAt'),
    readPlan(),
  ])
  const times = alive(eventTimes)
  const agenda = buildAgenda(from, to, day, {
    plans,
    events,
    sessions: sources.sessions,
    activities: sources.activities,
    templates: alive(templates),
    eventTimes: times,
    walkRoutine: settings?.walkRoutine,
    coach: planWorkouts(coachPlan),
    races,
  })
  // The coach's workouts with the time the user planned them at, when there is one, and the
  // prescription read from SisRUN in place of the description; the hidden ones left out.
  const timed = new Map(agenda.flatMap((item) => (item.event && item.time !== undefined ? [[item.event, item.time] as const] : [])))
  const prescribed = new Map(agenda.flatMap((item) => (item.event && item.coach ? [[item.event, coachSummary(item.coach)] as const] : [])))
  const planned =
    visibleEvents(events, times)?.map((event) => {
      const time = timed.get(event)
      const text = prescribed.get(event)
      if (time === undefined && !text) return event
      return {
        ...event,
        ...(time !== undefined && { time }),
        ...(text && { description: event.description ? `${text} · ${event.description}` : text }),
      }
    }) ?? null
  // Scheduled templates and walks still ahead: one done that day is left out.
  const ahead = agenda.filter((item) => item.plan && item.status === 'planned' && item.date >= day)
  const gymPlans = ahead.flatMap((item) => (item.kind === 'gym' ? [{ date: item.date, name: item.title, time: item.plan?.time }] : []))
  const walkPlans = ahead.flatMap((item) => (item.kind === 'walk' ? [{ date: item.date, title: item.title, time: item.plan?.time }] : []))
  const live = alive(insights)
  const previous = live.find((insight) => insight.id === shiftDay(day, -1))
  return buildContext({
    sources,
    settings: settings ?? { id: SETTINGS_ID, ...DEFAULT_SETTINGS, updatedAt: 0, deleted: 0, dirty: 0 },
    planned,
    races,
    gymPlans,
    walkPlans,
    previous: withPrevious ? previous : undefined,
    insights: live,
    exercises: new Map(alive(exercises).map((exercise) => [exercise.id, exercise])),
    measurements: alive(measurements),
    streams: new Map(streams.filter((stream): stream is ActivityStream => !!stream && !stream.deleted).map((stream) => [stream.id, stream])),
    agenda,
    synced: { garmin, healthConnect, calendar },
    today: day,
    now: new Date(),
  })
}

/** Builds today's summary on the device and asks Claude (daily-insights function) to read it. */
export async function generateInsight(day: DayKey = dayKey()): Promise<void> {
  if (state.generating) return
  if (!supabase) throw new Error('Configure a sincronização para usar a análise do dia.')
  setState({ generating: true })
  try {
    const context = await contextFor(day)
    const data = await invokeFunction(
      'daily-insights',
      { context },
      { unconfigured: 'Configure a sincronização para usar a análise do dia.', fallback: 'A análise falhou.', timeoutMs: LONG_TIMEOUT_MS },
    )
    const insight = parseInsight(data)
    if (!insight) throw new Error('A resposta da análise veio incompleta.')
    await save(db.insights, { id: day, createdAt: Date.now(), ...insight })
    setState({ generating: false })
  } catch (cause) {
    setState({ generating: false, error: cause instanceof Error ? cause.message : String(cause) })
  }
}

// One automatic try per day on each device, success or not: a failure never turns into a loop of paid calls.
const ATTEMPT_KEY = 'insightAttempt'

async function maybeGenerate() {
  const today = dayKey()
  const settings = await db.settings.get(SETTINGS_ID)
  if (settings?.insightsAuto === false) return
  const existing = await db.insights.get(today)
  if (existing && !existing.deleted) return
  if ((await db.meta.get(ATTEMPT_KEY))?.value === today) return
  if (!hasRecentData(await loadSources(), today)) return
  await db.meta.put({ key: ATTEMPT_KEY, value: today })
  await generateInsight(today)
}

/**
 * Once a day, a little after the first sync: the other device's analysis has arrived by then (so it
 * isn't made twice) and the morning's Garmin and Health Connect imports have had time to land.
 */
export function startDailyInsights(): void {
  if (!supabase) return
  let timer: ReturnType<typeof setTimeout> | undefined
  const check = () => {
    const { phase, lastSyncAt, email } = getSyncState()
    if (!email || phase !== 'idle' || !lastSyncAt) return
    clearTimeout(timer)
    timer = setTimeout(() => void maybeGenerate().catch(() => {}), 20_000)
  }
  onSyncStateChange(check)
  check()
}

export const useInsight = (day: DayKey) =>
  useLiveQuery(async () => {
    const insight = await db.insights.get(day)
    return insight && !insight.deleted ? insight : null
  }, [day])

/** Whether this device already made its automatic try of the day; undefined while loading. */
export const useInsightAttempted = (day: DayKey): boolean | undefined =>
  useLiveQuery(async () => (await db.meta.get(ATTEMPT_KEY))?.value === day, [day])

/**
 * Why there's no analysis of the day yet, for the Hoje cards: no account to run it with, the daily
 * one turned off, a try that didn't work out (today's automatic one, or the last by hand), or else
 * it's coming by itself a little after the next sync.
 */
export type InsightWait = 'signedOut' | 'off' | 'failed' | 'soon'

export function insightWait({
  configured,
  email,
  authChecked = false,
  auto,
  attempted,
  error,
}: {
  configured: boolean
  email: string | null
  authChecked?: boolean
  auto: boolean
  attempted: boolean
  error?: string
}): InsightWait {
  // Before the saved login is read, a missing email isn't a signed-out user yet.
  if (!configured || (authChecked && !email)) return 'signedOut'
  if (error) return 'failed'
  if (!auto) return 'off'
  return attempted ? 'failed' : 'soon'
}

/** Past analyses, newest first. */
export const useInsightHistory = () =>
  useLiveQuery(async () => alive(await db.insights.toArray()).sort((a, b) => b.id.localeCompare(a.id)))
