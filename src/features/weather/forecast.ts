import type { DayKey } from '../../lib/dates'
import type { AgendaItem } from '../calendar/agenda'

const HOUR = 3_600_000

/** How far ahead Open-Meteo forecasts (its maximum). */
export const FORECAST_DAYS = 16

/** A point on the map, in degrees. */
export interface Spot {
  lat: number
  lon: number
}

/** 2 decimals, about 1 km: enough for the weather, and the user's exact spot never leaves the phone. */
export const roundCoord = (degrees: number): number => Math.round(degrees * 100) / 100 || 0

export const spotOf = ({ lat, lon }: Spot): Spot => ({ lat: roundCoord(lat), lon: roundCoord(lon) })

export const sameSpot = (a: Spot, b: Spot): boolean => roundCoord(a.lat) === roundCoord(b.lat) && roundCoord(a.lon) === roundCoord(b.lon)

export interface HourForecast {
  /** The hour's start, ms. */
  time: number
  tempC: number
  /** Apparent ("feels like") temperature. */
  feelsC?: number
  /** Chance of rain in that hour, %. */
  rainChance?: number
  rainMm?: number
  /** WMO weather code (0 clear … 95 thunderstorm). */
  code?: number
  windKmh?: number
  /** Relative humidity, %. */
  humidity?: number
  /** Daylight: false between the sunset and the sunrise, for the moon icons. */
  isDay?: boolean
}

export interface DayForecast {
  /** The day at the place. */
  date: DayKey
  code?: number
  maxC: number
  minC: number
  /** The day's highest chance of rain, %. */
  rainChance?: number
  rainMm?: number
  /** The strongest wind of the day, km/h. */
  windKmh?: number
  /** The UV index at its peak. */
  uv?: number
  sunrise?: number
  sunset?: number
}

/** The latest reading (Open-Meteo's 15-minute data). */
export interface CurrentWeather {
  time: number
  tempC: number
  feelsC?: number
  humidity?: number
  windKmh?: number
  rainMm?: number
  code?: number
  isDay?: boolean
}

/** A forecast as kept on the device: for the rounded spot asked, not the model's grid point. */
export interface Forecast extends Spot {
  fetchedAt: number
  /** The place's offset from UTC, in seconds: its own hours and days. */
  utcOffsetSec: number
  current?: CurrentWeather
  hours: HourForecast[]
  days: DayForecast[]
}

const CURRENT = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'is_day', 'precipitation', 'weather_code', 'wind_speed_10m']
const HOURLY = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation_probability',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'relative_humidity_2m',
  'is_day',
]
const DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'precipitation_sum',
  'wind_speed_10m_max',
  'uv_index_max',
  'sunrise',
  'sunset',
]

/**
 * The 16-day forecast of a place, hour by hour and day by day, with the conditions now. Times come as
 * Unix seconds (an hour is matched without minding time zones) and `timezone=auto` makes the days
 * the place's own.
 */
export function forecastUrl(spot: Spot): string {
  const { lat, lon } = spotOf(spot)
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
    `&current=${CURRENT.join(',')}&hourly=${HOURLY.join(',')}&daily=${DAILY.join(',')}` +
    `&timezone=auto&timeformat=unixtime&forecast_days=${FORECAST_DAYS}`
  )
}

type Json = Record<string, unknown>

const finite = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const rounded = (value: number | undefined, digits = 0) => (value === undefined ? undefined : Number(value.toFixed(digits)))

/** A field of a block by index ("hourly", "daily"); undefined when missing or null. */
const column = (block: unknown, field: string) => {
  const values = block && typeof block === 'object' ? (block as Json)[field] : undefined
  return (i: number) => (Array.isArray(values) ? finite(values[i]) : undefined)
}

/** Without the empty fields, as the other rows of the app. */
const compact = <T extends object>(row: T): T => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)) as T

const flag = (value: number | undefined) => (value === undefined ? undefined : value === 1)

/** The day at the place of a moment, from its offset. */
export const localDay = (time: number, offsetSec: number): DayKey => new Date(time + offsetSec * 1000).toISOString().slice(0, 10)

/** The hour on the place's clock (0–23). */
export const localHour = (time: number, offsetSec: number): number => new Date(time + offsetSec * 1000).getUTCHours()

/** "05:28" on the place's clock. */
export const localClock = (time: number, offsetSec: number): string => new Date(time + offsetSec * 1000).toISOString().slice(11, 16)

/** Open-Meteo's answer as kept; undefined when it brings neither hours nor days (an error, say). */
export function readForecast(json: unknown, spot: Spot, fetchedAt: number): Forecast | undefined {
  if (!json || typeof json !== 'object') return undefined
  const root = json as Json
  const offset = finite(root.utc_offset_seconds) ?? 0

  const hourTime = column(root.hourly, 'time')
  const hourField = (field: string) => column(root.hourly, field)
  const [temp, feels, chance, rain, code, wind, humidity, isDay] = [
    'temperature_2m',
    'apparent_temperature',
    'precipitation_probability',
    'precipitation',
    'weather_code',
    'wind_speed_10m',
    'relative_humidity_2m',
    'is_day',
  ].map(hourField)
  const hourCount = Array.isArray((root.hourly as Json | undefined)?.time) ? ((root.hourly as Json).time as unknown[]).length : 0
  const hours: HourForecast[] = []
  for (let i = 0; i < hourCount; i++) {
    const time = hourTime(i)
    const tempC = temp(i)
    if (time === undefined || tempC === undefined) continue
    hours.push(
      compact({
        time: time * 1000,
        tempC: rounded(tempC, 1)!,
        feelsC: rounded(feels(i), 1),
        rainChance: rounded(chance(i)),
        rainMm: rounded(rain(i), 1),
        code: rounded(code(i)),
        windKmh: rounded(wind(i), 1),
        humidity: rounded(humidity(i)),
        isDay: flag(isDay(i)),
      }),
    )
  }

  const dayTime = column(root.daily, 'time')
  const [dayCode, max, min, dayChance, dayRain, dayWind, uv, sunrise, sunset] = [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_probability_max',
    'precipitation_sum',
    'wind_speed_10m_max',
    'uv_index_max',
    'sunrise',
    'sunset',
  ].map((field) => column(root.daily, field))
  const dayCount = Array.isArray((root.daily as Json | undefined)?.time) ? ((root.daily as Json).time as unknown[]).length : 0
  const days: DayForecast[] = []
  for (let i = 0; i < dayCount; i++) {
    const time = dayTime(i)
    const maxC = max(i)
    const minC = min(i)
    if (time === undefined || maxC === undefined || minC === undefined) continue
    const rise = sunrise(i)
    const set = sunset(i)
    days.push(
      compact({
        // Daily times are the place's midnight in Unix seconds: its offset gives back the date.
        date: localDay(time * 1000, offset),
        code: rounded(dayCode(i)),
        maxC: rounded(maxC, 1)!,
        minC: rounded(minC, 1)!,
        rainChance: rounded(dayChance(i)),
        rainMm: rounded(dayRain(i), 1),
        windKmh: rounded(dayWind(i), 1),
        uv: rounded(uv(i), 1),
        sunrise: rise === undefined ? undefined : rise * 1000,
        sunset: set === undefined ? undefined : set * 1000,
      }),
    )
  }

  let current: CurrentWeather | undefined
  const now = root.current && typeof root.current === 'object' ? (root.current as Json) : undefined
  const nowTime = finite(now?.time)
  const nowTemp = finite(now?.temperature_2m)
  if (nowTime !== undefined && nowTemp !== undefined) {
    current = compact({
      time: nowTime * 1000,
      tempC: rounded(nowTemp, 1)!,
      feelsC: rounded(finite(now?.apparent_temperature), 1),
      humidity: rounded(finite(now?.relative_humidity_2m)),
      windKmh: rounded(finite(now?.wind_speed_10m), 1),
      rainMm: rounded(finite(now?.precipitation), 1),
      code: rounded(finite(now?.weather_code)),
      isDay: flag(finite(now?.is_day)),
    })
  }

  if (hours.length === 0 && days.length === 0) return undefined
  return { ...spotOf(spot), fetchedAt, utcOffsetSec: offset, ...(current && { current }), hours, days }
}

/**
 * The forecast's hour nearest a moment, within half an hour: a workout at 7:20 gets the 7h forecast,
 * one at 7:30 the 8h one, whose temperature is mid-workout and whose chance of rain (Open-Meteo's is
 * for the hour before) covers its first half hour and more.
 */
export function hourAt(forecast: Pick<Forecast, 'hours'>, time: number): HourForecast | undefined {
  let best: HourForecast | undefined
  for (const hour of forecast.hours) {
    const distance = Math.abs(hour.time - time)
    if (distance <= HOUR / 2 && (!best || distance <= Math.abs(best.time - time))) best = hour
  }
  return best
}

export const dayOf = (forecast: Pick<Forecast, 'days'>, date: DayKey): DayForecast | undefined =>
  forecast.days.find((day) => day.date === date)

/** The weather of a scheduled workout: always its day's, and its hour's when it has a time. */
export interface WorkoutWeather {
  day: DayForecast
  hour?: HourForecast
}

/**
 * The forecast for a workout still ahead (from today on, not rest days): at its hour when it has a
 * time, else the day's high and low. Undefined beyond the forecast's days.
 */
export function workoutWeather(
  item: Pick<AgendaItem, 'date' | 'time' | 'status' | 'kind'>,
  forecast: Pick<Forecast, 'hours' | 'days'> | undefined,
  today: DayKey,
): WorkoutWeather | undefined {
  if (!forecast || item.status !== 'planned' || item.kind === 'rest' || item.date < today) return undefined
  const day = dayOf(forecast, item.date)
  if (!day) return undefined
  const hour = item.time === undefined ? undefined : hourAt(forecast, item.time)
  return hour ? { day, hour } : { day }
}

/** The hours around a moment: `before` hours before its own and `after` after it. */
export function hoursAround(forecast: Pick<Forecast, 'hours'>, time: number, before = 2, after = 3): HourForecast[] {
  const hour = hourAt(forecast, time)
  if (!hour) return []
  const i = forecast.hours.indexOf(hour)
  return forecast.hours.slice(Math.max(0, i - before), i + after + 1)
}

/** A day's hours on the place's clock, from `from` to `to` every `step` hours (6h, 9h, … 21h). */
export function dayHours(
  forecast: Pick<Forecast, 'hours' | 'utcOffsetSec'>,
  date: DayKey,
  { from = 0, to = 23, step = 1 }: { from?: number; to?: number; step?: number } = {},
): HourForecast[] {
  return forecast.hours.filter((hour) => {
    if (localDay(hour.time, forecast.utcOffsetSec) !== date) return false
    const h = localHour(hour.time, forecast.utcOffsetSec)
    return h >= from && h <= to && (h - from) % step === 0
  })
}

/** From the hour going on now, `count` hours ahead. */
export const nextHours = (forecast: Pick<Forecast, 'hours'>, now: number, count = 24): HourForecast[] =>
  forecast.hours.filter((hour) => hour.time + HOUR > now).slice(0, count)

/**
 * The weather now: the latest reading while it is recent, else the forecast for this hour (a
 * forecast kept from hours ago, when there was no connection since).
 */
export function nowWeather(forecast: Forecast, now: number): CurrentWeather | undefined {
  if (forecast.current && Math.abs(now - forecast.current.time) < 90 * 60_000) return forecast.current
  const hour = hourAt(forecast, now)
  if (!hour) return undefined
  const { time, tempC, feelsC, humidity, windKmh, rainMm, code, isDay } = hour
  return compact({ time, tempC, feelsC, humidity, windKmh, rainMm, code, isDay })
}

/** "24°" (no "−0°"). */
export const degrees = (celsius: number): string => `${Math.round(celsius) || 0}°`

/** "18° a 27°": a day's low and high. */
export const tempRange = (day: Pick<DayForecast, 'minC' | 'maxC'>): string => `${degrees(day.minC)} a ${degrees(day.maxC)}`

/** "7h" on the place's clock. */
export const hourLabel = (time: number, offsetSec: number): string => `${localHour(time, offsetSec)}h`

/** The UV index in words, as the WHO groups it. */
export function uvLevel(uv: number): string {
  if (uv < 3) return 'baixo'
  if (uv < 6) return 'moderado'
  if (uv < 8) return 'alto'
  if (uv < 11) return 'muito alto'
  return 'extremo'
}
