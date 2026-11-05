import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import type { Activity, ActivityWeather } from '../../db/types'
import { formatNumber } from '../../lib/format'

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Open-Meteo's forecast service keeps about three months back; older days come from its archive. */
const FORECAST_DAYS_BACK = 85

const FIELDS = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'wind_speed_10m', 'precipitation', 'weather_code']

/** The whole hour nearest an activity's middle, in ms (Open-Meteo's hours are UTC here). */
export const middleHour = (activity: Pick<Activity, 'startTime' | 'elapsedSec'>): number =>
  Math.round((activity.startTime + activity.elapsedSec * 500) / HOUR) * HOUR

/** About 1 km of precision: enough for the weather, and the route's start stays private. */
const coarse = (degrees: number) => (Math.round(degrees * 100) / 100).toFixed(2)

/**
 * The request for one hour's weather at a place: the forecast service for the last ~3 months
 * (the archive lags a few days behind), the archive before that. Everything in UTC, with Unix
 * times, so the hour is found without minding time zones.
 */
export function weatherUrl([lat, lon]: [number, number], hour: number, now = Date.now()): string {
  const day = new Date(hour).toISOString().slice(0, 10)
  const base =
    now - hour < FORECAST_DAYS_BACK * DAY ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive'
  return `${base}?latitude=${coarse(lat)}&longitude=${coarse(lon)}&hourly=${FIELDS.join(',')}&timezone=GMT&timeformat=unixtime&start_date=${day}&end_date=${day}`
}

const round = (value: number, digits = 0) => Number(value.toFixed(digits))

/** The values of that hour in Open-Meteo's answer; undefined when it doesn't have the temperature. */
export function readWeather(json: unknown, hour: number): ActivityWeather | undefined {
  const hourly = (json as { hourly?: Record<string, unknown> } | null)?.hourly
  const times = hourly?.time
  if (!Array.isArray(times)) return undefined
  const i = times.indexOf(hour / 1000)
  if (i === -1) return undefined
  const at = (field: string) => {
    const values = hourly?.[field]
    const value = Array.isArray(values) ? values[i] : undefined
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }
  const tempC = at('temperature_2m')
  if (tempC === undefined) return undefined
  const fields: ActivityWeather = {
    tempC: round(tempC, 1),
    feelsC: at('apparent_temperature'),
    humidity: at('relative_humidity_2m'),
    windKmh: at('wind_speed_10m'),
    precipitationMm: at('precipitation'),
    code: at('weather_code'),
  }
  if (fields.feelsC !== undefined) fields.feelsC = round(fields.feelsC, 1)
  if (fields.humidity !== undefined) fields.humidity = Math.round(fields.humidity)
  if (fields.windKmh !== undefined) fields.windKmh = round(fields.windKmh, 1)
  if (fields.precipitationMm !== undefined) fields.precipitationMm = round(fields.precipitationMm, 1)
  if (fields.code !== undefined) fields.code = Math.round(fields.code)
  // Without the empty fields, as the other rows of the app.
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as ActivityWeather
}

/** The WMO weather code in words. */
export function weatherCondition(code: number | undefined): string | undefined {
  if (code === undefined) return undefined
  if (code === 0) return 'céu limpo'
  if (code === 1) return 'poucas nuvens'
  if (code === 2) return 'parcialmente nublado'
  if (code === 3) return 'nublado'
  if (code === 45 || code === 48) return 'neblina'
  if (code >= 51 && code <= 57) return 'garoa'
  if (code === 61) return 'chuva fraca'
  if (code === 63) return 'chuva'
  if (code === 65) return 'chuva forte'
  if (code === 66 || code === 67) return 'chuva congelante'
  if (code === 80 || code === 81) return 'pancadas de chuva'
  if (code === 82) return 'pancadas fortes de chuva'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'neve'
  if (code === 95) return 'trovoada'
  if (code === 96 || code === 99) return 'trovoada com granizo'
  return undefined
}

/** The weather's icon; clear skies show the moon before 6h and from 19h. */
export function weatherIcon(code: number | undefined, localHour?: number): LucideIcon {
  const night = localHour !== undefined && (localHour < 6 || localHour >= 19)
  if (code === undefined || code <= 1) return night ? Moon : Sun
  if (code === 2) return night ? CloudMoon : CloudSun
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 57) return CloudDrizzle
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow
  if (code >= 95) return CloudLightning
  return Cloud
}

/**
 * "29 °C, sensação 32 °C, umidade 70%, vento 12 km/h" (and the rain, when it rained); with
 * `condition`, the sky first ("céu limpo, 29 °C…") for text without the icon, which then says
 * the rain itself.
 */
export function weatherText(weather: ActivityWeather, { condition = false } = {}): string {
  const parts: string[] = []
  const sky = condition ? weatherCondition(weather.code) : undefined
  if (sky) parts.push(sky)
  parts.push(`${Math.round(weather.tempC)} °C`)
  if (weather.feelsC !== undefined && Math.round(weather.feelsC) !== Math.round(weather.tempC)) {
    parts.push(`sensação ${Math.round(weather.feelsC)} °C`)
  }
  if (weather.humidity !== undefined) parts.push(`umidade ${weather.humidity}%`)
  if (weather.windKmh !== undefined) parts.push(`vento ${Math.round(weather.windKmh)} km/h`)
  const wet = sky !== undefined && /chuva|garoa|trovoada/.test(sky)
  if (weather.precipitationMm && !wet) parts.push(`chuva ${formatNumber(weather.precipitationMm, 1)} mm`)
  return parts.join(', ')
}
