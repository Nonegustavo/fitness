import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useSyncExternalStore } from 'react'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { WeatherPlace } from '../../db/types'
import { isIndoor } from '../activities/weatherQueue'
import { forecastUrl, readForecast, sameSpot, spotOf, type Forecast, type Spot } from './forecast'
import { chosenPlace, placeFromActivity, type ResolvedPlace } from './place'

/** This device's last forecast (local, not synced: each device fetches its own). */
const FORECAST_KEY = 'weatherForecast'
/** A forecast younger than this is kept: Open-Meteo's models change about hourly. */
export const MAX_AGE_MS = 60 * 60_000
/** After a failure (offline, the service down) the next try waits this long; the last forecast stays. */
const RETRY_MS = 10 * 60_000
/** How often an open screen checks whether its forecast got old. */
const CHECK_EVERY_MS = 5 * 60_000
const TIMEOUT_MS = 15_000
/** How many recent outdoor activities to look through for one whose route is on this device. */
const FALLBACK_TRIES = 10

const isForecast = (value: unknown): value is Forecast =>
  !!value && typeof value === 'object' && Array.isArray((value as Forecast).hours) && Array.isArray((value as Forecast).days)

export async function loadForecast(): Promise<Forecast | undefined> {
  const value = (await db.meta.get(FORECAST_KEY))?.value
  return isForecast(value) ? value : undefined
}

/** The start of the latest outdoor activity with a route: where the user trains, until they pick a place. */
export async function findFallbackPlace(): Promise<ResolvedPlace | null> {
  const recent = await db.activities
    .orderBy('startTime')
    .reverse()
    .filter((activity) => !activity.deleted && activity.hasTrack && !isIndoor(activity))
    .limit(FALLBACK_TRIES)
    .toArray()
  for (const activity of recent) {
    // The route may not have come from the other device yet: the one before it, then.
    const start = (await db.activityStreams.get(activity.id))?.track?.[0]
    if (start) return placeFromActivity(activity, start)
  }
  return null
}

/** The place picked in Clima, else the fallback; null with neither. */
export async function resolvePlace(): Promise<ResolvedPlace | null> {
  const chosen = (await db.settings.get(SETTINGS_ID))?.weatherPlace
  return chosen ? chosenPlace(chosen) : findFallbackPlace()
}

/** Picks the place for the forecast (synced), rounded; undefined goes back to the latest activity's. */
export const setWeatherPlace = (place: WeatherPlace | undefined): Promise<void> =>
  patch(db.settings, SETTINGS_ID, { weatherPlace: place && { name: place.name, ...spotOf(place) } })

export interface ForecastStatus {
  loading: boolean
  /** When the last try failed, while no later one worked. */
  failedAt?: number
}

let status: ForecastStatus = { loading: false }
const listeners = new Set<() => void>()

function setStatus(next: ForecastStatus) {
  status = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useForecastStatus = (): ForecastStatus => useSyncExternalStore(subscribe, () => status)

let inflight: { spot: Spot; done: Promise<void> } | undefined
let lastFailure: { at: number; spot: Spot } | undefined

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

/**
 * Brings a new forecast for a spot when the one kept is older than an hour or for another place
 * (`force`: now, from the refresh button). Only while the app is visible and online; a failure is
 * quiet and waits 10 minutes, keeping the last forecast.
 */
export function refreshForecast(spot: Spot, { force = false } = {}): Promise<void> {
  // One request at a time. Every screen asks on opening: the same spot shares the request, another
  // one (a place just picked) or a forced refresh goes right after it.
  if (inflight) {
    if (!force && sameSpot(inflight.spot, spot)) return inflight.done
    return inflight.done.then(() => refreshForecast(spot, { force }))
  }
  const done = (async () => {
    try {
      const cached = await loadForecast()
      const now = Date.now()
      if (!force && cached && sameSpot(cached, spot) && now - cached.fetchedAt < MAX_AGE_MS) return
      if (!force && lastFailure && sameSpot(lastFailure.spot, spot) && now - lastFailure.at < RETRY_MS) return
      if (hidden() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        if (force) setStatus({ loading: false, failedAt: now })
        return
      }
      setStatus({ ...status, loading: true })
      const response = await fetch(forecastUrl(spot), { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) throw new Error(`Open-Meteo ${response.status}`)
      const forecast = readForecast(await response.json(), spot, Date.now())
      if (!forecast) throw new Error('Previsão ilegível')
      await db.meta.put({ key: FORECAST_KEY, value: forecast })
      lastFailure = undefined
      setStatus({ loading: false })
    } catch {
      lastFailure = { at: Date.now(), spot: spotOf(spot) }
      setStatus({ loading: false, failedAt: lastFailure.at })
    }
  })().finally(() => {
    inflight = undefined
  })
  inflight = { spot: spotOf(spot), done }
  return done
}

/** The place for the weather; null when there is none yet, undefined while loading. */
export const useWeatherPlace = (): ResolvedPlace | null | undefined => useLiveQuery(resolvePlace)

export interface ForecastState {
  place: ResolvedPlace | null | undefined
  /** The forecast kept for that place (maybe old: see `fetchedAt`); undefined when there's none. */
  forecast: Forecast | undefined
  /** Still reading the device. */
  loading: boolean
}

/**
 * The forecast for the weather place, as kept on the device. While a screen shows it, it's brought
 * up to date: on opening, when the app comes back to the front or online, and every few minutes
 * (each time only if older than an hour). `active: false` only reads it (a list of past days).
 */
export function useForecast({ active = true }: { active?: boolean } = {}): ForecastState {
  const place = useWeatherPlace()
  const cached = useLiveQuery(async () => (await loadForecast()) ?? null)
  const key = place && active ? `${spotOf(place).lat},${spotOf(place).lon}` : ''
  useEffect(() => {
    if (!key) return
    const [lat, lon] = key.split(',').map(Number)
    const check = () => {
      if (!hidden()) void refreshForecast({ lat, lon })
    }
    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('online', check)
    }
  }, [key])
  const forecast = place && cached && sameSpot(cached, place) ? cached : undefined
  return { place, forecast, loading: place === undefined || cached === undefined }
}
