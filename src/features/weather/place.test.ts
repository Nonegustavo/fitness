import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, db, SETTINGS_ID } from '../../db/schema'
import type { Activity } from '../../db/types'
import { geocodeUrl, placeFromActivity, readPlaces } from './place'
import { findFallbackPlace, loadForecast, refreshForecast, resolvePlace, setWeatherPlace } from './store'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const

const activity = (id: string, startTime: number, changes: Partial<Activity> = {}): Activity => ({
  id,
  date: new Date(startTime).toISOString().slice(0, 10),
  sport: 'running',
  startTime,
  elapsedSec: 3600,
  timerSec: 3600,
  laps: [],
  hasTrack: true,
  ...meta,
  ...changes,
})

describe('searching a place', () => {
  it('asks Open-Meteo in Portuguese', () => {
    expect(geocodeUrl(' São Leopoldo ')).toBe(
      'https://geocoding-api.open-meteo.com/v1/search?name=S%C3%A3o%20Leopoldo&count=8&language=pt&format=json',
    )
  })

  it('names Brazilian places with the state, others with the country, rounded to about 1 km', () => {
    const places = readPlaces({
      results: [
        { id: 1, name: 'Porto Alegre', latitude: -30.03283, longitude: -51.23019, country_code: 'BR', country: 'Brasil', admin1: 'Rio Grande do Sul', admin2: 'Porto Alegre' },
        { id: 2, name: 'Pôrto Alegre', latitude: -9.75, longitude: -46.16667, country_code: 'BR', country: 'Brasil', admin1: 'Maranhão', admin2: 'Alto Parnaíba' },
        { id: 3, name: 'Lisboa', latitude: 38.72509, longitude: -9.1498, country_code: 'PT', country: 'Portugal', admin1: 'Distrito de Lisboa', admin2: 'Lisboa' },
        // The same spot again, and rows without a place.
        { id: 4, name: 'Porto Alegre', latitude: -30.031, longitude: -51.229, country_code: 'BR', country: 'Brasil' },
        { id: 5, name: '', latitude: 1, longitude: 1 },
        { id: 6, name: 'Sem lugar', latitude: null, longitude: 2 },
        'lixo',
      ],
    })
    expect(places).toEqual([
      { id: '1', name: 'Porto Alegre, RS', lat: -30.03, lon: -51.23, detail: 'Rio Grande do Sul, Brasil' },
      { id: '2', name: 'Pôrto Alegre, MA', lat: -9.75, lon: -46.17, detail: 'Alto Parnaíba, Maranhão, Brasil' },
      { id: '3', name: 'Lisboa, Portugal', lat: 38.73, lon: -9.15, detail: 'Distrito de Lisboa, Portugal' },
    ])
    // Nothing found: Open-Meteo leaves "results" out.
    expect(readPlaces({ generationtime_ms: 0.14 })).toEqual([])
  })
})

describe('the place of the forecast', () => {
  beforeEach(async () => {
    await Promise.all([db.activities.clear(), db.activityStreams.clear(), db.meta.clear(), db.settings.clear()])
    await db.settings.put({ id: SETTINGS_ID, ...DEFAULT_SETTINGS, ...meta })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('comes from an activity’s start, rounded, with what it was', () => {
    const place = placeFromActivity(activity('a', Date.UTC(2026, 10, 5, 9)), [-29.123456, -51.987654])
    expect(place).toEqual({
      name: 'Última atividade ao ar livre',
      lat: -29.12,
      lon: -51.99,
      source: 'activity',
      activity: { id: 'a', label: 'Corrida de 5/11' },
    })
  })

  it('is the start of the latest outdoor activity whose route is here, until a place is picked', async () => {
    const day = 86_400_000
    const now = Date.UTC(2026, 10, 6, 12)
    await db.activities.bulkPut([
      activity('old', now - 5 * day),
      activity('treadmill', now - 1 * day, { subSport: 'treadmill' }),
      activity('deleted', now - 2 * day, { deleted: 1 }),
      activity('no-route', now - 3 * day, { hasTrack: false }),
      // Its route hasn't come from the other device yet.
      activity('not-here', now - 4 * day),
    ])
    await db.activityStreams.bulkPut(
      [
        ['old', -29.761, -51.147],
        ['treadmill', -1, -1],
        ['deleted', -2, -2],
      ].map(([id, lat, lon]) => ({ id: id as string, step: 1, track: [[lat, lon]] as [number, number][], ...meta })),
    )
    expect(await findFallbackPlace()).toMatchObject({ lat: -29.76, lon: -51.15, source: 'activity', activity: { id: 'old' } })

    await setWeatherPlace({ name: 'Porto Alegre, RS', lat: -30.03283, lon: -51.23019 })
    expect((await db.settings.get(SETTINGS_ID))?.weatherPlace).toEqual({ name: 'Porto Alegre, RS', lat: -30.03, lon: -51.23 })
    expect(await resolvePlace()).toEqual({ name: 'Porto Alegre, RS', lat: -30.03, lon: -51.23, source: 'chosen' })

    // Back to the latest activity's.
    await setWeatherPlace(undefined)
    expect((await resolvePlace())?.source).toBe('activity')
  })

  it('is none without a place or an outdoor activity', async () => {
    expect(await resolvePlace()).toBeNull()
  })

  it('keeps the forecast an hour, fetches another place right away, and keeps the last one on a failure', async () => {
    const urls: string[] = []
    let fail = false
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      if (fail) throw new TypeError('offline')
      const start = Math.floor(Date.now() / 3_600_000) * 3600
      return new Response(
        JSON.stringify({
          utc_offset_seconds: -10_800,
          hourly: { time: [start, start + 3600], temperature_2m: [20, 21] },
          daily: { time: [start], temperature_2m_max: [25], temperature_2m_min: [15] },
        }),
      )
    })
    const home = { lat: -29.76, lon: -51.15 }
    await refreshForecast(home)
    expect(urls).toHaveLength(1)
    expect(await loadForecast()).toMatchObject({ lat: -29.76, lon: -51.15, hours: [{ tempC: 20 }, { tempC: 21 }] })

    // Within the hour, and asked by several screens at once: no new request.
    await Promise.all([refreshForecast(home), refreshForecast(home)])
    expect(urls).toHaveLength(1)

    // Another place: right away.
    const away = { lat: 38.72509, lon: -9.1498 }
    await refreshForecast(away)
    expect(urls).toHaveLength(2)
    expect(urls[1]).toContain('latitude=38.73&longitude=-9.15')

    // A failure keeps the last forecast, and the next try waits.
    fail = true
    await refreshForecast(home)
    expect(urls).toHaveLength(3)
    expect(await loadForecast()).toMatchObject({ lat: 38.73, lon: -9.15 })
    await refreshForecast(home)
    expect(urls).toHaveLength(3)
    // Unless the user asks.
    await refreshForecast(home, { force: true })
    expect(urls).toHaveLength(4)
  })
})
