import { describe, expect, it } from 'vitest'
import {
  dayHours,
  degrees,
  forecastUrl,
  hourAt,
  hoursAround,
  nextHours,
  nowWeather,
  peakRain,
  rainRate,
  readForecast,
  tempRange,
  uvLevel,
  workoutWeather,
  type Forecast,
} from './forecast'

const HOUR = 3_600_000
/** Brazil's offset (UTC−3), as Open-Meteo sends it with timezone=auto. */
const OFFSET = -10_800
/** Midnight of 7 Nov 2026 in Brazil. */
const MIDNIGHT = Date.UTC(2026, 10, 7, 3)
const SPOT = { lat: -29.12, lon: -51.46 }

/** Open-Meteo's answer for two days from MIDNIGHT, hour by hour (with unixtime). */
function answer() {
  const time = Array.from({ length: 48 }, (_, i) => MIDNIGHT / 1000 + i * 3600)
  return {
    latitude: -29.125,
    longitude: -51.5,
    utc_offset_seconds: OFFSET,
    timezone: 'America/Sao_Paulo',
    current: { time: MIDNIGHT / 1000 + 10 * 3600 + 900, interval: 900, temperature_2m: 22.46, apparent_temperature: 24.04, is_day: 1, weather_code: 2, wind_speed_10m: 8.04, relative_humidity_2m: 69.6, precipitation: 0 },
    hourly: {
      time,
      temperature_2m: time.map((_, i) => (i === 5 ? null : 15 + (i % 24) / 2)),
      apparent_temperature: time.map((_, i) => 16 + (i % 24) / 2),
      precipitation_probability: time.map((_, i) => (i * 7) % 100),
      precipitation: time.map(() => 0),
      weather_code: time.map((_, i) => (i < 24 ? 1 : 61)),
      wind_speed_10m: time.map(() => 11.84),
      relative_humidity_2m: time.map(() => 70.4),
      is_day: time.map((_, i) => (i % 24 >= 6 && i % 24 < 19 ? 1 : 0)),
    },
    daily: {
      time: [MIDNIGHT / 1000, MIDNIGHT / 1000 + 86_400],
      weather_code: [1, 61],
      temperature_2m_max: [26.54, 21],
      temperature_2m_min: [15.04, 14],
      precipitation_probability_max: [10, null],
      precipitation_sum: [0, 12.36],
      wind_speed_10m_max: [14.4, 30.2],
      uv_index_max: [9.65, 2],
      sunrise: [MIDNIGHT / 1000 + 5.5 * 3600, MIDNIGHT / 1000 + 86_400 + 5.5 * 3600],
      sunset: [MIDNIGHT / 1000 + 19.25 * 3600, MIDNIGHT / 1000 + 86_400 + 19.25 * 3600],
    },
  }
}

const forecast = readForecast(answer(), SPOT, MIDNIGHT + 10 * HOUR)!

describe('the forecast request', () => {
  it('asks for 16 days of the place, rounded to about 1 km, in Unix time and the place’s days', () => {
    const url = forecastUrl({ lat: -29.123456, lon: -51.456789 })
    expect(url).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=-29\.12&longitude=-51\.46&/)
    expect(url).toContain('&timezone=auto&timeformat=unixtime&forecast_days=16')
    expect(url).toContain(
      '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,is_day',
    )
    expect(url).toContain(
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max,sunrise,sunset',
    )
    expect(url).toContain('&current=temperature_2m,')
  })
})

describe('reading the forecast', () => {
  it('keeps the spot asked, not the model’s grid point, and the place’s offset', () => {
    expect(forecast).toMatchObject({ lat: -29.12, lon: -51.46, utcOffsetSec: OFFSET, fetchedAt: MIDNIGHT + 10 * HOUR })
  })

  it('reads the hours in ms, rounded, without the ones missing the temperature', () => {
    expect(forecast.hours).toHaveLength(47)
    expect(forecast.hours[0]).toEqual({
      time: MIDNIGHT,
      tempC: 15,
      feelsC: 16,
      rainChance: 0,
      rainMm: 0,
      code: 1,
      windKmh: 11.8,
      humidity: 70,
      isDay: false,
    })
    expect(forecast.hours.some((hour) => hour.time === MIDNIGHT + 5 * HOUR)).toBe(false)
    expect(forecast.hours.find((hour) => hour.time === MIDNIGHT + 7 * HOUR)?.isDay).toBe(true)
  })

  it('reads the days as the place’s dates, leaving out what is missing', () => {
    expect(forecast.days).toEqual([
      {
        date: '2026-11-07',
        code: 1,
        maxC: 26.5,
        minC: 15,
        rainChance: 10,
        rainMm: 0,
        windKmh: 14.4,
        uv: 9.7,
        sunrise: MIDNIGHT + 5.5 * HOUR,
        sunset: MIDNIGHT + 19.25 * HOUR,
      },
      {
        date: '2026-11-08',
        code: 61,
        maxC: 21,
        minC: 14,
        rainMm: 12.4,
        windKmh: 30.2,
        uv: 2,
        sunrise: MIDNIGHT + 29.5 * HOUR,
        sunset: MIDNIGHT + 43.25 * HOUR,
      },
    ])
  })

  it('reads the conditions now', () => {
    expect(forecast.current).toEqual({
      time: MIDNIGHT + 10.25 * HOUR,
      tempC: 22.5,
      feelsC: 24,
      humidity: 70,
      windKmh: 8,
      rainMm: 0,
      code: 2,
      isDay: true,
    })
  })

  it('gives up on an error or an empty answer', () => {
    expect(readForecast({ error: true, reason: 'Latitude must be in range of -90 to 90°.' }, SPOT, 0)).toBeUndefined()
    expect(readForecast(null, SPOT, 0)).toBeUndefined()
    expect(readForecast({ hourly: { time: [MIDNIGHT / 1000], temperature_2m: [null] } }, SPOT, 0)).toBeUndefined()
  })
})

describe('the weather of a workout', () => {
  const planned = { status: 'planned', kind: 'run', date: '2026-11-07' } as const

  it('takes the hour nearest its time', () => {
    expect(hourAt(forecast, MIDNIGHT + 7 * HOUR + 20 * 60_000)?.time).toBe(MIDNIGHT + 7 * HOUR)
    expect(hourAt(forecast, MIDNIGHT + 7.5 * HOUR)?.time).toBe(MIDNIGHT + 8 * HOUR)
    expect(hourAt(forecast, MIDNIGHT + 60 * HOUR)).toBeUndefined()
  })

  it('is the hour’s weather when it has a time, else the day’s', () => {
    const at7 = workoutWeather({ ...planned, time: MIDNIGHT + 7 * HOUR }, forecast, '2026-11-07')
    expect(at7?.hour).toMatchObject({ time: MIDNIGHT + 7 * HOUR, tempC: 18.5, rainChance: 49 })
    expect(at7?.day.date).toBe('2026-11-07')
    const allDay = workoutWeather(planned, forecast, '2026-11-07')
    expect(allDay).toEqual({ day: forecast.days[0] })
  })

  it('falls back to the day when its hour isn’t in the forecast (the hour missing its temperature)', () => {
    expect(workoutWeather({ ...planned, time: MIDNIGHT + 5 * HOUR }, forecast, '2026-11-07')).toEqual({ day: forecast.days[0] })
  })

  it('is only for workouts still ahead, in the forecast’s days', () => {
    const today = '2026-11-07'
    expect(workoutWeather({ ...planned, status: 'done' }, forecast, today)).toBeUndefined()
    expect(workoutWeather({ ...planned, status: 'missed' }, forecast, today)).toBeUndefined()
    expect(workoutWeather({ ...planned, kind: 'rest' }, forecast, today)).toBeUndefined()
    expect(workoutWeather(planned, forecast, '2026-11-08')).toBeUndefined()
    expect(workoutWeather({ ...planned, date: '2026-11-20' }, forecast, today)).toBeUndefined()
    expect(workoutWeather(planned, undefined, today)).toBeUndefined()
    expect(workoutWeather({ ...planned, date: '2026-11-08' }, forecast, today)?.day.code).toBe(61)
  })

  it('shows the hours around it, and a whole day every three hours', () => {
    expect(hoursAround(forecast, MIDNIGHT + 9 * HOUR).map((hour) => hour.time)).toEqual(
      [7, 8, 9, 10, 11, 12].map((h) => MIDNIGHT + h * HOUR),
    )
    // At the start of the forecast there's nothing before.
    expect(hoursAround(forecast, MIDNIGHT).map((hour) => hour.time)).toEqual([0, 1, 2, 3].map((h) => MIDNIGHT + h * HOUR))
    expect(dayHours(forecast, '2026-11-08', { from: 6, to: 21, step: 3 }).map((hour) => hour.time)).toEqual(
      [30, 33, 36, 39, 42, 45].map((h) => MIDNIGHT + h * HOUR),
    )
  })
})

describe('how hard it rains', () => {
  // The second day rains from 6h, heaviest at 15h (2,4 mm in that hour); the first stays dry.
  const wetAnswer = answer()
  wetAnswer.hourly.precipitation = wetAnswer.hourly.time.map((_, i) => (i < 30 ? 0 : i === 39 ? 2.44 : i % 2 === 0 ? 0.04 : 0.6))
  const wet = readForecast(wetAnswer, SPOT, MIDNIGHT + 10 * HOUR)!

  it('takes the heaviest hour of the place’s day, ignoring less than 0,1 mm', () => {
    expect(peakRain(wet, '2026-11-08')).toBe(2.4)
    expect(peakRain(wet, '2026-11-07')).toBeUndefined()
    expect(peakRain(wet, '2026-11-09')).toBeUndefined()
    // An hour of 0,04 mm is no rain to speak of.
    expect(peakRain({ hours: [{ time: MIDNIGHT + 30 * HOUR, tempC: 20, rainMm: 0 }], utcOffsetSec: OFFSET }, '2026-11-08')).toBeUndefined()
  })

  it('counts the hours by the place’s day, not UTC’s', () => {
    // 1h on 8 Nov in Brazil is still 7 Nov in UTC−3… and 8 Nov at 4h UTC.
    const lateRain = { hours: [{ time: MIDNIGHT + 25 * HOUR, tempC: 18, rainMm: 1.2 }], utcOffsetSec: OFFSET }
    expect(peakRain(lateRain, '2026-11-08')).toBe(1.2)
    expect(peakRain(lateRain, '2026-11-07')).toBeUndefined()
  })

  it('writes the intensity in mm/h, with nothing below 0,1 mm', () => {
    expect(rainRate(2.4)).toBe('2,4 mm/h')
    expect(rainRate(0.6)).toBe('0,6 mm/h')
    expect(rainRate(12)).toBe('12 mm/h')
    expect(rainRate(0)).toBeUndefined()
    expect(rainRate(0.04)).toBeUndefined()
    expect(rainRate(undefined)).toBeUndefined()
  })

  it('gives a workout without a time its day’s heaviest hour; one with a time keeps its own hour', () => {
    const planned = { status: 'planned', kind: 'run', date: '2026-11-08' } as const
    expect(workoutWeather(planned, wet, '2026-11-07')).toEqual({ day: wet.days[1], peakMm: 2.4 })
    expect(workoutWeather({ ...planned, time: MIDNIGHT + 31 * HOUR }, wet, '2026-11-07')?.hour?.rainMm).toBe(0.6)
    // A dry day has no peak.
    expect(workoutWeather({ ...planned, date: '2026-11-07' }, wet, '2026-11-07')).toEqual({ day: wet.days[0] })
  })
})

describe('the weather now', () => {
  it('starts the next hours at the one going on', () => {
    const hours = nextHours(forecast, MIDNIGHT + 10.5 * HOUR, 3)
    expect(hours.map((hour) => hour.time)).toEqual([10, 11, 12].map((h) => MIDNIGHT + h * HOUR))
  })

  it('is the latest reading while recent, else the forecast for this hour', () => {
    expect(nowWeather(forecast, MIDNIGHT + 10.5 * HOUR)?.tempC).toBe(22.5)
    const later = nowWeather(forecast, MIDNIGHT + 20 * HOUR)
    expect(later).toMatchObject({ time: MIDNIGHT + 20 * HOUR, tempC: 25, isDay: false })
    const old: Forecast = { ...forecast, hours: [] }
    expect(nowWeather(old, MIDNIGHT + 20 * HOUR)).toBeUndefined()
  })
})

describe('the weather in words', () => {
  it('writes degrees, the day’s range and the UV', () => {
    expect(degrees(23.5)).toBe('24°')
    expect(degrees(-0.4)).toBe('0°')
    expect(tempRange({ minC: 15.04, maxC: 26.5 })).toBe('15° a 27°')
    expect([1, 3, 6, 9.7, 11].map(uvLevel)).toEqual(['baixo', 'moderado', 'alto', 'muito alto', 'extremo'])
  })
})
