/**
 * A made-up answer of Open-Meteo's forecast, in its shape (see readForecast in
 * src/features/weather/forecast.ts): 16 days by the hour from today, at São Paulo's offset. The smoke
 * test serves it instead of the real one, so Clima and the workout cards have a forecast to draw and
 * nothing depends on the network.
 */
export function forecastAnswer(now = new Date()) {
  const offset = -3 * 3600
  const hour = 3600
  // The place's midnight, in Unix seconds.
  const localNow = Math.floor(now.getTime() / 1000) + offset
  const midnight = localNow - (localNow % 86_400) - offset
  const hours = Array.from({ length: 16 * 24 }, (_, i) => i)
  const days = Array.from({ length: 16 }, (_, i) => i)
  const wave = (i: number) => Math.sin(((i % 24) - 9) / 3.82)
  return {
    utc_offset_seconds: offset,
    current: {
      time: Math.floor(now.getTime() / 1000),
      temperature_2m: 21.4,
      apparent_temperature: 22.1,
      relative_humidity_2m: 68,
      is_day: 1,
      precipitation: 0,
      weather_code: 2,
      wind_speed_10m: 11.2,
    },
    hourly: {
      time: hours.map((i) => midnight + i * hour),
      temperature_2m: hours.map((i) => Math.round((19 + wave(i) * 6) * 10) / 10),
      apparent_temperature: hours.map((i) => Math.round((19.5 + wave(i) * 6) * 10) / 10),
      precipitation_probability: hours.map((i) => (i % 7 === 3 ? 60 : 10)),
      precipitation: hours.map((i) => (i % 7 === 3 ? 1.8 : 0)),
      weather_code: hours.map((i) => (i % 7 === 3 ? 61 : i % 5 === 0 ? 3 : 1)),
      wind_speed_10m: hours.map((i) => 8 + (i % 6)),
      relative_humidity_2m: hours.map((i) => 60 + (i % 20)),
      is_day: hours.map((i) => (i % 24 >= 6 && i % 24 < 19 ? 1 : 0)),
    },
    daily: {
      time: days.map((i) => midnight + i * 86_400),
      weather_code: days.map((i) => (i % 4 === 2 ? 61 : 2)),
      temperature_2m_max: days.map((i) => 24 + (i % 5)),
      temperature_2m_min: days.map((i) => 14 + (i % 4)),
      precipitation_probability_max: days.map((i) => (i % 4 === 2 ? 70 : 15)),
      precipitation_sum: days.map((i) => (i % 4 === 2 ? 6.4 : 0)),
      wind_speed_10m_max: days.map((i) => 14 + (i % 7)),
      uv_index_max: days.map((i) => 7 + (i % 3)),
      sunrise: days.map((i) => midnight + i * 86_400 + 5 * hour + 28 * 60),
      sunset: days.map((i) => midnight + i * 86_400 + 19 * hour + 2 * 60),
    },
  }
}
