import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { notifyLocalChange } from '../../db/events'
import { alive, patch } from '../../db/repo'
import { db } from '../../db/schema'
import type { Activity } from '../../db/types'
import { dayKey, shiftDay, type DayKey } from '../../lib/dates'
import { getSyncState, onSyncStateChange } from '../../sync/controller'
import { supabase } from '../../sync/supabase'
import { runWeatherQueue } from '../activities/weatherQueue'
import { garminCalendar, garminFile, garminGet, GarminError, orNull } from './api'
import { parseCalendar, type PlannedEvent } from './calendar'
import { keepPastEvents } from './calendarHistory'
import { dayChunks, mergeHealth, saveHealth, type GarminDailySummary, type GarminHrv, type GarminSleep } from './health'
import { toPlannedWorkout, type GarminWorkout } from './workout'

/** On the first sync, how far back to look. Older days come with "Buscar meses anteriores". */
const FIRST_DAYS = 30
const AUTO_EVERY_MS = 3 * 3_600_000
const PAGE = 50
/** Garmin's sleep and summary ranges top out around four weeks. */
const HEALTH_CHUNK_DAYS = 28
/** Coaches' plans (SisRUN, Garmin Coach) are runs, rides and swims. */
const WORKOUT_SPORTS = new Set(['running', 'cycling', 'swimming', 'walking'])

/** This device's Garmin bookkeeping (local, not synced). */
interface GarminMeta {
  lastRunAt?: number
  /** The day the last complete sync reached. */
  lastDay?: DayKey
  /** The oldest day already fetched. */
  historyFrom?: DayKey
  /** Activities with no .FIT original (manual entries, GPX uploads), not to download again. */
  skipped?: number[]
}

const META_KEY = 'garmin'
const CALENDAR_KEY = 'garminCalendar'

export interface GarminState {
  phase: 'idle' | 'syncing' | 'error'
  progress?: string
  /** What the last run brought, or its error. */
  message?: string
  lastRunAt?: number
  historyFrom?: DayKey
}

let state: GarminState = { phase: 'idle' }
const listeners = new Set<() => void>()

function setState(changes: Partial<GarminState>) {
  state = { ...state, ...changes }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useGarminState = (): GarminState => useSyncExternalStore(subscribe, () => state)

/** The workouts from the last calendar fetch, or null when no calendar is set up. */
export async function plannedEvents(): Promise<PlannedEvent[] | null> {
  const row = await db.meta.get(CALENDAR_KEY)
  return row ? (row.value as { events: PlannedEvent[] }).events : null
}

export const usePlannedEvents = (): PlannedEvent[] | null | undefined => useLiveQuery(plannedEvents)

const readMeta = async (): Promise<GarminMeta> => ((await db.meta.get(META_KEY))?.value as GarminMeta | undefined) ?? {}
const writeMeta = (meta: GarminMeta) => db.meta.put({ key: META_KEY, value: meta })

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface GarminActivitySummary {
  activityId?: number
  activityName?: string
  beginTimestamp?: number
}

/** Downloads the activities Garmin has in the range that the app doesn't, oldest first. */
async function importActivities(from: DayKey, to: DayKey, meta: GarminMeta): Promise<number> {
  const listed: GarminActivitySummary[] = []
  for (let start = 0; ; start += PAGE) {
    const page =
      (await garminGet<GarminActivitySummary[]>('/activitylist-service/activities/search/activities', {
        start,
        limit: PAGE,
        startDate: from,
        endDate: to,
        sortOrder: 'asc',
      })) ?? []
    listed.push(...page)
    if (page.length < PAGE) break
  }

  const known = alive(await db.activities.toArray())
  const skipped = new Set(meta.skipped ?? [])
  let imported = 0
  // The FIT SDK is large; it only loads when there is something to read.
  let fit: typeof import('../activities/importFit') | undefined
  let parser: typeof import('../activities/fit') | undefined

  try {
    for (const [i, item] of listed.entries()) {
      const id = item.activityId
      if (typeof id !== 'number' || skipped.has(id) || known.some((activity) => activity.garminId === id)) continue
      setState({ progress: `Atividades: ${i + 1} de ${listed.length}` })
      const title = item.activityName?.trim() || undefined

      // Imported by hand before: link it to Garmin instead of downloading it again.
      const begin = item.beginTimestamp
      const same = begin === undefined ? undefined : known.find((activity) => Math.abs(activity.startTime - begin) < 60_000)
      if (same) {
        await patch(db.activities, same.id, {
          garminId: id,
          title: same.title ?? title,
          workout: same.workout ?? (await plannedWorkout(id, same.sport)),
        })
        continue
      }

      let bytes: Uint8Array
      try {
        bytes = await garminFile(id)
      } catch (error) {
        // No original file: a manual entry, for example.
        if (error instanceof GarminError && error.status === 404) {
          skipped.add(id)
          continue
        }
        throw error
      }
      fit ??= await import('../activities/importFit')
      parser ??= await import('../activities/fit')
      try {
        // Usually a zip with the .fit inside; a zip of a GPX upload has none.
        const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b
        const entry = fit.fitEntries(zipped ? `${id}.zip` : `${id}.fit`, bytes)[0]
        if (!entry) throw new Error('Sem .fit no arquivo.')
        const parsed = parser.parseFit(entry.bytes, entry.name)
        await fit.saveParsed(parsed, { garminId: id, title, workout: await plannedWorkout(id, parsed.activity.sport) })
        imported++
      } catch (error) {
        if (error instanceof GarminError) throw error
        skipped.add(id)
      }
      // Be gentle with Garmin's limits.
      await pause(300)
    }
  } finally {
    meta.skipped = [...skipped]
    if (imported > 0) notifyLocalChange()
  }
  return imported
}

/** The structured workout the watch followed, for sports where coaches send them. */
async function plannedWorkout(activityId: number, sport: Activity['sport']) {
  if (!WORKOUT_SPORTS.has(sport)) return undefined
  return toPlannedWorkout(await orNull(garminGet<GarminWorkout[]>(`/activity-service/activity/${activityId}/workouts`)))
}

/** Sleep, HRV and daily summaries (resting heart rate, stress, Body Battery, steps) per day. */
async function importHealth(from: DayKey, to: DayKey): Promise<number> {
  let changed = 0
  for (const [start, end] of dayChunks(from, to, HEALTH_CHUNK_DAYS)) {
    setState({ progress: `Sono e recuperação: ${start.slice(8)}/${start.slice(5, 7)} a ${end.slice(8)}/${end.slice(5, 7)}` })
    const [sleeps, hrv, summaries] = await Promise.all([
      orNull(garminGet<GarminSleep[]>('/sleep-service/sleep/dailySleepSummariesByDate', { startDate: start, endDate: end })),
      orNull(garminGet<{ hrvSummaries?: GarminHrv[] }>(`/hrv-service/hrv/daily/${start}/${end}`)),
      orNull(garminGet<{ data?: GarminDailySummary[] }>('/usersummary-service/v2/dailysummaries', { startDate: start, endDate: end })),
    ])
    changed += await saveHealth(mergeHealth(sleeps ?? [], hrv?.hrvSummaries ?? [], summaries?.data ?? []))
  }
  return changed
}

/** The planned workouts, if the calendar link is set up; a flaky calendar never fails the sync. */
async function importCalendar(): Promise<void> {
  try {
    const events = parseCalendar(await garminCalendar())
    await keepPastEvents(await plannedEvents(), events, dayKey()).catch(() => undefined)
    await db.meta.put({ key: CALENDAR_KEY, value: { fetchedAt: Date.now(), events } })
  } catch (error) {
    if (error instanceof GarminError && error.missing === 'calendar') await db.meta.delete(CALENDAR_KEY)
  }
}

let running = false

async function run(range: (meta: GarminMeta, today: DayKey) => [DayKey, DayKey], done: (meta: GarminMeta, from: DayKey, today: DayKey) => void) {
  if (!supabase || !getSyncState().email || running) return
  running = true
  setState({ phase: 'syncing', progress: 'Conectando ao Garmin…', message: undefined })
  const meta = await readMeta()
  try {
    const today = dayKey()
    const [from, to] = range(meta, today)
    const activities = await importActivities(from, to, meta)
    const days = await importHealth(from, to)
    await importCalendar()
    done(meta, from, today)
    const parts = [
      activities === 1 ? '1 atividade nova' : `${activities} atividades novas`,
      days === 1 ? '1 dia de sono e recuperação atualizado' : `${days} dias de sono e recuperação atualizados`,
    ]
    meta.lastRunAt = Date.now()
    await writeMeta(meta)
    setState({ phase: 'idle', progress: undefined, message: parts.join(' · '), lastRunAt: meta.lastRunAt, historyFrom: meta.historyFrom })
  } catch (error) {
    // Even a failed run waits for the next window, so an error doesn't hammer Garmin.
    meta.lastRunAt = Date.now()
    await writeMeta(meta)
    const message = error instanceof Error ? error.message : String(error)
    setState({ phase: 'error', progress: undefined, message, lastRunAt: meta.lastRunAt })
  } finally {
    running = false
    // The weather of what came (and of the last 60 days, the first time), slowly in the background.
    void runWeatherQueue()
  }
}

/** Brings what's new since the last sync (the last 30 days the first time). */
export function syncGarmin(): Promise<void> {
  return run(
    (meta, today) => [meta.lastDay ? shiftDay(meta.lastDay, -2) : shiftDay(today, -FIRST_DAYS), today],
    (meta, from, today) => {
      meta.lastDay = today
      if (!meta.historyFrom || from < meta.historyFrom) meta.historyFrom = from
    },
  )
}

/** Fetches the `days` before the oldest day already in the app. */
export function importOlder(days = 90): Promise<void> {
  return run(
    (meta, today) => {
      const oldest = meta.historyFrom ?? shiftDay(today, -FIRST_DAYS)
      return [shiftDay(oldest, -days), shiftDay(oldest, -1)]
    },
    (meta, from) => {
      meta.historyFrom = from
    },
  )
}

let autoTimer: ReturnType<typeof setTimeout> | undefined

/** Syncs on its own, at most every 3 hours, while the app is open and signed in. */
export function startGarminSync(): void {
  if (!supabase) return
  void readMeta().then((meta) => setState({ lastRunAt: meta.lastRunAt, historyFrom: meta.historyFrom }))
  const check = () => {
    if (!getSyncState().email || document.visibilityState !== 'visible') return
    clearTimeout(autoTimer)
    // A few seconds after opening, so the regular sync brings what the other device imported first.
    autoTimer = setTimeout(() => {
      void readMeta().then((meta) => {
        if (Date.now() - (meta.lastRunAt ?? 0) >= AUTO_EVERY_MS) void syncGarmin()
      })
    }, 8_000)
  }
  onSyncStateChange(check)
  document.addEventListener('visibilitychange', check)
  check()
}
