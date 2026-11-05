import { describe, expect, it } from 'vitest'
import { middleHour, readWeather, weatherCondition, weatherText, weatherUrl } from './weather'

const NOW = Date.UTC(2026, 10, 5, 15, 0)

describe('the weather of an activity', () => {
  it('takes the whole hour nearest the middle, in UTC', () => {
    // 06:10–07:20 in Brazil (UTC−3): the middle is 06:45, so the 07h hour, 10h UTC.
    const start = Date.UTC(2026, 10, 1, 9, 10)
    expect(middleHour({ startTime: start, elapsedSec: 70 * 60 })).toBe(Date.UTC(2026, 10, 1, 10))
  })

  it('asks the forecast service for recent days and the archive for older ones, with the place rounded', () => {
    const recent = weatherUrl([-29.123456, -51.987654], Date.UTC(2026, 10, 1, 10), NOW)
    expect(recent).toBe(
      'https://api.open-meteo.com/v1/forecast?latitude=-29.12&longitude=-51.99&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&timezone=GMT&timeformat=unixtime&start_date=2026-11-01&end_date=2026-11-01',
    )
    const old = weatherUrl([-29.12, -51.99], Date.UTC(2026, 5, 1, 23), NOW)
    expect(old).toMatch(/^https:\/\/archive-api\.open-meteo\.com\/v1\/archive\?latitude=-29\.12&longitude=-51\.99&.*start_date=2026-06-01&end_date=2026-06-01$/)
  })

  it('reads the values of that hour', () => {
    const hour = Date.UTC(2026, 10, 1, 10)
    const json = {
      hourly: {
        time: [hour / 1000 - 3600, hour / 1000, hour / 1000 + 3600],
        temperature_2m: [21.2, 23.46, 25],
        apparent_temperature: [22, 25.04, 27],
        relative_humidity_2m: [80, 69.6, 60],
        wind_speed_10m: [5, 11.84, 12],
        precipitation: [0, 0, 0.2],
        weather_code: [1, 2, 61],
      },
    }
    expect(readWeather(json, hour)).toEqual({ tempC: 23.5, feelsC: 25, humidity: 70, windKmh: 11.8, precipitationMm: 0, code: 2 })
    expect(readWeather(json, hour + 7200)).toBeUndefined()
    expect(readWeather({ hourly: { time: [hour / 1000], temperature_2m: [null] } }, hour)).toBeUndefined()
    expect(readWeather({ error: true, reason: 'out of range' }, hour)).toBeUndefined()
  })

  it('writes it as a line, the feels-like only when it differs', () => {
    expect(weatherText({ tempC: 29.4, feelsC: 32.1, humidity: 70, windKmh: 12.2, precipitationMm: 0, code: 0 })).toBe(
      '29 °C, sensação 32 °C, umidade 70%, vento 12 km/h',
    )
    // The sky says the rain, so the millimeters only go with the icon.
    expect(weatherText({ tempC: 18, feelsC: 18.2, precipitationMm: 1.24, code: 63 }, { condition: true })).toBe('chuva, 18 °C')
    expect(weatherText({ tempC: 18, precipitationMm: 1.24, code: 63 })).toBe('18 °C, chuva 1,2 mm')
    expect(weatherCondition(95)).toBe('trovoada')
    expect(weatherCondition(3)).toBe('nublado')
  })
})
