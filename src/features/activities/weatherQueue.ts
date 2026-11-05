import { alive, patch } from '../../db/repo'
import { db } from '../../db/schema'
import type { Activity } from '../../db/types'
import { dayKey, parseDay, shiftDay, type DayKey } from '../../lib/dates'
import { middleHour, readWeather, weatherUrl } from './weather'

/** This device's line of activities waiting for their weather (local, not synced: the weather itself is). */
const META_KEY = 'weather'
/** The first run looks this far back once; after that, only what is imported. */
const BACKFILL_DAYS = 60
/** A failure waits for the next day; after this many, the activity goes without weather. */
const MAX_TRIES = 5
/** One request at a time, a second apart: Open-Meteo is free and asks to be used gently. */
const PAUSE_MS = 1_000
const TIMEOUT_MS = 15_000

const INDOOR = new Set(['treadmill', 'indoorRunning', 'indoorCycling', 'indoorWalking', 'indoorRowing', 'spin', 'virtualActivity'])

interface Pending {
  id: string
  /** Not before this day: set when a try fails. */
  after?: DayKey
  tries?: number
}

interface WeatherMeta {
  queue: Pending[]
  backfilled?: boolean
}

const readMeta = async (): Promise<WeatherMeta> => ({
  queue: [],
  ...((await db.meta.get(META_KEY))?.value as Partial<WeatherMeta> | undefined),
})

/** Read-modify-write of the line in one transaction, so an import adding to it while it runs isn't lost. */
const updateMeta = (change: (meta: WeatherMeta) => void) =>
  db.transaction('rw', db.meta, async () => {
    const meta = await readMeta()
    change(meta)
    await db.meta.put({ key: META_KEY, value: meta })
  })

/** An activity whose weather can be looked up: outdoors, with a route, and none yet. */
export const wantsWeather = (activity: Pick<Activity, 'deleted' | 'hasTrack' | 'weather' | 'subSport'>): boolean =>
  !activity.deleted && activity.hasTrack && !activity.weather && !INDOOR.has(activity.subSport ?? '')

/** Puts activities in line for their weather (as they are imported). */
export async function queueWeather(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await updateMeta((meta) => {
    for (const id of ids) if (!meta.queue.some((item) => item.id === id)) meta.queue.push({ id })
  })
}

/** Once per device: the activities of the last 60 days that have no weather yet. */
async function backfillOnce(): Promise<void> {
  if ((await readMeta()).backfilled) return
  const from = parseDay(shiftDay(dayKey(), -BACKFILL_DAYS)).getTime()
  const recent = alive(await db.activities.where('startTime').aboveOrEqual(from).toArray()).filter(wantsWeather)
  await updateMeta((meta) => {
    for (const activity of recent) if (!meta.queue.some((item) => item.id === activity.id)) meta.queue.push({ id: activity.id })
    meta.backfilled = true
  })
}

type Outcome = 'saved' | 'drop' | 'retry'

/** One activity's weather at the start of its route and the middle of its time. */
async function lookUp(id: string): Promise<Outcome> {
  const activity = await db.activities.get(id)
  if (!activity || !wantsWeather(activity)) return 'drop'
  // The route may not have arrived from the other device yet.
  const start = (await db.activityStreams.get(id))?.track?.[0]
  if (!start) return 'retry'
  const hour = middleHour(activity)
  let json: unknown
  try {
    const response = await fetch(weatherUrl(start, hour), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return 'retry'
    json = await response.json()
  } catch {
    return 'retry'
  }
  const weather = readWeather(json, hour)
  if (!weather) return 'retry'
  // The other device may have brought it in the meantime.
  const current = await db.activities.get(id)
  if (!current || !wantsWeather(current)) return 'drop'
  await patch(db.activities, id, { weather })
  return 'saved'
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let running = false

/**
 * Looks up the weather of the activities in line, one at a time, a second apart, in the
 * background (after a Garmin sync or an import). A failure waits for a later day; two in a row
 * (offline, the service down) end this run and leave the rest for the next.
 */
export async function runWeatherQueue(pauseMs = PAUSE_MS): Promise<void> {
  if (running || navigator.onLine === false) return
  running = true
  try {
    await backfillOnce()
    let failures = 0
    while (failures < 2) {
      const today = dayKey()
      const next = (await readMeta()).queue.find((item) => !item.after || item.after <= today)
      if (!next) break
      const outcome = await lookUp(next.id)
      failures = outcome === 'retry' ? failures + 1 : 0
      await updateMeta((meta) => {
        const item = meta.queue.find((entry) => entry.id === next.id)
        if (!item) return
        const tries = (item.tries ?? 0) + 1
        if (outcome === 'retry' && tries < MAX_TRIES) {
          item.tries = tries
          item.after = shiftDay(today, 1)
        } else meta.queue = meta.queue.filter((entry) => entry !== item)
      })
      await pause(pauseMs)
    }
  } catch {
    // Whatever is left stays in line for the next run.
  } finally {
    running = false
  }
}
