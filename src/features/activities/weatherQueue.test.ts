import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/schema'
import type { Activity } from '../../db/types'
import { dayKey, shiftDay } from '../../lib/dates'
import { middleHour } from './weather'
import { queueWeather, runWeatherQueue } from './weatherQueue'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const DAY = 86_400_000

const run = (id: string, daysAgo: number, changes: Partial<Activity> = {}): Activity => {
  const startTime = Date.now() - daysAgo * DAY
  return { id, date: dayKey(startTime), sport: 'running', startTime, elapsedSec: 3600, timerSec: 3600, laps: [], hasTrack: true, ...meta, ...changes }
}

/** Open-Meteo's answer with the hour of each activity asked. */
function answer(url: string) {
  const day = /start_date=(\d{4}-\d{2}-\d{2})/.exec(url)![1]
  const start = Date.parse(`${day}T00:00:00Z`) / 1000
  const time = Array.from({ length: 24 }, (_, i) => start + i * 3600)
  return { hourly: { time, temperature_2m: time.map(() => 27.3), relative_humidity_2m: time.map(() => 61), weather_code: time.map(() => 1) } }
}

const queue = async () => ((await db.meta.get('weather'))?.value as { queue: { id: string; after?: string; tries?: number }[] }).queue

describe('the weather queue', () => {
  beforeEach(async () => {
    await Promise.all([db.activities.clear(), db.activityStreams.clear(), db.meta.clear()])
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('looks up, once, the last 60 days of activities with a route, then what is imported', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify(answer(url)))
    })
    await db.activities.bulkPut([run('recent', 3), run('old', 90), run('treadmill', 2, { subSport: 'treadmill' }), run('done', 4, { weather: { tempC: 18 } })])
    await db.activityStreams.bulkPut(
      ['recent', 'old', 'treadmill', 'done'].map((id) => ({ id, step: 1, track: [[-29.123, -51.456], [-29.2, -51.5]] as [number, number][], ...meta })),
    )
    await runWeatherQueue(0)
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('latitude=-29.12&longitude=-51.46')
    expect((await db.activities.get('recent'))).toMatchObject({ weather: { tempC: 27.3, humidity: 61, code: 1 }, dirty: 1 })
    expect((await db.activities.get('old'))?.weather).toBeUndefined()
    expect(await queue()).toEqual([])

    // The backfill is done; an older activity comes only when imported.
    await queueWeather(['old'])
    await runWeatherQueue(0)
    expect(urls).toHaveLength(2)
    expect(urls[1]).toContain('archive-api')
    expect((await db.activities.get('old'))?.weather?.tempC).toBe(27.3)
  })

  it('leaves a failure for another day, and stops after two in a row', async () => {
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      calls++
      throw new TypeError('offline')
    })
    await db.activities.bulkPut([run('a', 1), run('b', 2), run('c', 3)])
    await db.activityStreams.bulkPut(['a', 'b', 'c'].map((id) => ({ id, step: 1, track: [[-29, -51]] as [number, number][], ...meta })))
    await runWeatherQueue(0)
    expect(calls).toBe(2)
    const tomorrow = shiftDay(dayKey(), 1)
    const items = await queue()
    expect(items.filter((item) => item.after === tomorrow && item.tries === 1)).toHaveLength(2)
    expect(items.filter((item) => item.after === undefined)).toHaveLength(1)
  })

  it('asks for the hour of the middle of the activity', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url)
      return new Response(JSON.stringify(answer(url)))
    })
    const activity = run('a', 1)
    await db.activities.put(activity)
    await db.activityStreams.put({ id: 'a', step: 1, track: [[-29, -51]], ...meta })
    await runWeatherQueue(0)
    expect(asked[0]).toContain(`start_date=${new Date(middleHour(activity)).toISOString().slice(0, 10)}`)
  })
})
