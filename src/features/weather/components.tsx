import { Umbrella, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../../components/ui'
import { dayKey, formatTime, relativeDay, type DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { weatherCondition, weatherIcon } from '../activities/weather'
import type { AgendaItem } from '../calendar/agenda'
import {
  dayHours,
  degrees,
  hourLabel,
  hoursAround,
  peakRain,
  rainRate,
  rains,
  tempRange,
  uvLevel,
  workoutWeather,
  type Forecast,
  type HourForecast,
  type WorkoutWeather,
} from './forecast'
import type { ResolvedPlace } from './place'
import { useForecast } from './store'

/** The sky's icon, the moon at night (Open-Meteo's daylight flag follows the sunset, not a fixed hour). */
export const skyIcon = (code: number | undefined, isDay = true): LucideIcon => weatherIcon(code, isDay ? 12 : 0)

/** "Previsão de hoje às 21:30 para Porto Alegre, RS": how old it is and where it's for. */
export function forecastSource(forecast: Forecast, place: ResolvedPlace, today: DayKey): string {
  const when = `${relativeDay(dayKey(forecast.fetchedAt), today)} às ${formatTime(forecast.fetchedAt)}`
  const where =
    place.source === 'chosen'
      ? place.name
      : `o início da última atividade ao ar livre${place.activity ? ` (${place.activity.label})` : ''}`
  return `Previsão de ${when} para ${where}.`
}

/** "1,2 mm/h", or "até 1,2 mm/h" for a day's heaviest hour; undefined without rain to speak of. */
export const rainIntensity = (mm: number | undefined, peak = false): string | undefined => {
  const rate = rainRate(mm)
  return rate && (peak ? `até ${rate}` : rate)
}

/**
 * The chance of rain with its intensity: "☂ 75% · 1,2 mm/h" (for a day, "até" its heaviest hour).
 * Spans only, kept whole on one line.
 */
export function RainChance({ chance, mm, peak = false, className }: { chance: number; mm?: number; peak?: boolean; className?: string }) {
  const intensity = rainIntensity(mm, peak)
  return (
    <span className={cx('flex items-center gap-0.5 whitespace-nowrap', className)}>
      <Umbrella size={12} aria-hidden className="shrink-0" />
      <span className="sr-only">chuva </span>
      {chance}%
      {intensity && <span className="text-muted">&nbsp;·&nbsp;{intensity}</span>}
    </span>
  )
}

/**
 * A workout's forecast in its row: the sky, the temperature (at its hour, else the day's low and
 * high) and the chance of rain with how hard it falls. Spans only: the row's text can sit inside a button.
 */
export function WorkoutWeatherLine({ weather }: { weather: WorkoutWeather }) {
  const { day, hour } = weather
  const code = hour?.code ?? day.code
  const Icon = skyIcon(code, hour?.isDay)
  const sky = weatherCondition(code)
  const chance = hour ? hour.rainChance : day.rainChance
  // Two units led by their icons (the umbrella is the chance of rain, as on Clima): in a narrow row
  // (one with Iniciar) the second goes to the next line whole.
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-ink-2">
      <span className="flex items-center gap-1 whitespace-nowrap">
        <Icon size={13} aria-hidden className="shrink-0" />
        <span className="sr-only">Previsão: {sky ? `${sky}, ` : ''}</span>
        {hour ? degrees(hour.tempC) : tempRange(day)}
      </span>
      {chance !== undefined && <RainChance chance={chance} mm={hour ? hour.rainMm : weather.peakMm} peak={!hour} />}
    </span>
  )
}

/**
 * The hours side by side: the hour, the sky, the temperature and the chance of rain, which also
 * rises as a little column so the wet hours stand out, with the millimetres of rain of each hour
 * (its intensity, mm/h) under it when any of them rains. `marks` puts something over an hour (the
 * workouts on the Clima page); `highlight` is the workout's own hour; `dense` drops the columns, for
 * a card of fixed height.
 */
export function HourStrip({
  hours,
  offsetSec,
  highlight,
  marks,
  firstLabel,
  scroll = false,
  dense = false,
}: {
  hours: HourForecast[]
  offsetSec: number
  highlight?: number
  marks?: Map<number, ReactNode>
  /** "Agora", for the hour going on. */
  firstLabel?: string
  scroll?: boolean
  dense?: boolean
}) {
  // A line for the millimetres only when some hour has them, the same height in every hour.
  const wet = hours.some((hour) => rains(hour.rainMm))
  return (
    <ol
      className={cx(scroll ? 'scroll-fade-x -mx-4 flex gap-1 overflow-x-auto overscroll-x-contain px-4 pb-1' : 'grid gap-1')}
      style={scroll ? undefined : { gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}
    >
      {hours.map((hour, i) => {
        const Icon = skyIcon(hour.code, hour.isDay)
        const sky = weatherCondition(hour.code)
        const label = i === 0 && firstLabel ? firstLabel : hourLabel(hour.time, offsetSec)
        const chance = hour.rainChance
        return (
          <li
            key={hour.time}
            className={cx(
              'flex flex-col items-center rounded-xl',
              dense ? 'gap-0.5 py-1' : 'gap-1 py-2',
              scroll && 'w-12 shrink-0',
              hour.time === highlight && 'bg-surface ring-1 ring-line',
            )}
          >
            {marks && <span className="flex h-[18px] items-center gap-0.5">{marks.get(hour.time)}</span>}
            <span className={cx('text-xs', hour.time === highlight ? 'font-semibold text-ink' : 'text-muted')}>{label}</span>
            <Icon size={dense ? 18 : 20} aria-hidden className="text-ink-2" />
            {sky && <span className="sr-only">{sky}</span>}
            <span className="text-sm font-semibold">{degrees(hour.tempC)}</span>
            {chance !== undefined && (
              <>
                {/* The chance as a column on a shared baseline; nothing at 0%. */}
                {!dense && (
                  <span aria-hidden className="flex h-4 items-end">
                    <span className="w-2 rounded-t bg-series-1" style={{ height: `${chance}%` }} />
                  </span>
                )}
                <span className="text-[11px] text-ink-2 tabular-nums">
                  <span className="sr-only">chuva </span>
                  {chance}%
                </span>
              </>
            )}
            {wet && (
              <span className="h-3.5 text-[10px] leading-3.5 whitespace-nowrap text-muted tabular-nums">
                {rains(hour.rainMm) && (
                  <>
                    {formatNumber(hour.rainMm, 1)}
                    <span aria-hidden> mm</span>
                    <span className="sr-only"> milímetros por hora</span>
                  </>
                )}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** "chuva 75% · umidade 70%", each fact kept whole when the line wraps. */
const join = (parts: (string | false | undefined)[]) =>
  parts
    .filter((part): part is string => !!part)
    .map((part) => part.replace(/ /g, ' '))
    .join(' · ')

/**
 * The forecast in a workout's sheet: the sky and temperature at its hour, the feels-like, wind and
 * humidity, the day's range and the chance of rain through the hours around it (through the day,
 * every three hours, for a workout without a time). Nothing beyond the forecast's 16 days.
 */
export function WorkoutWeatherDetails({ item, today }: { item: AgendaItem; today: DayKey }) {
  const { place, forecast } = useForecast()
  const weather = workoutWeather(item, forecast, today)
  if (!forecast || !place || !weather) return null
  const { day, hour } = weather
  const offset = forecast.utcOffsetSec
  const code = hour?.code ?? day.code
  const Icon = skyIcon(code, hour?.isDay)
  const sky = weatherCondition(code)
  const strip = hour ? hoursAround(forecast, hour.time) : dayHours(forecast, day.date, { from: 6, to: 21, step: 3 })
  const headline = `${hour ? `${degrees(hour.tempC)} às ${hourLabel(hour.time, offset)}` : tempRange(day)}${sky ? `, ${sky}` : ''}`
  const details = hour
    ? join([
        hour.rainChance !== undefined && `chuva ${hour.rainChance}%${rains(hour.rainMm) ? `, ${rainRate(hour.rainMm)}` : ''}`,
        hour.feelsC !== undefined && Math.round(hour.feelsC) !== Math.round(hour.tempC) && `sensação ${degrees(hour.feelsC)}`,
        hour.windKmh !== undefined && `vento ${Math.round(hour.windKmh)} km/h`,
        hour.humidity !== undefined && `umidade ${hour.humidity}%`,
      ])
    : join([
        day.rainChance !== undefined && `chuva até ${day.rainChance}%`,
        rainIntensity(weather.peakMm, true),
        !!day.rainMm && `${formatNumber(day.rainMm, 1)} mm no dia`,
        day.windKmh !== undefined && `vento até ${Math.round(day.windKmh)} km/h`,
        day.uv !== undefined && `UV ${Math.round(day.uv)} (${uvLevel(day.uv)})`,
      ])
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-sm font-semibold">Clima previsto</h3>
      <div className="rounded-xl bg-surface-2 px-3 py-2.5">
        <div className="flex items-center gap-3">
          <Icon size={30} aria-hidden className="shrink-0 text-ink-2" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{headline}</p>
            {details && <p className="text-xs text-ink-2 first-letter:uppercase">{details}</p>}
            {hour && (
              <p className="text-xs text-ink-2">
                {join([
                  `No dia: ${tempRange(day)}`,
                  day.rainChance !== undefined && `chuva até ${day.rainChance}%`,
                  rainIntensity(peakRain(forecast, day.date), true),
                ])}
              </p>
            )}
          </div>
        </div>
        {strip.length > 1 && (
          <>
            <p className="mt-3 mb-1 text-xs font-medium text-ink-2">{hour ? 'Nas horas em volta' : 'Ao longo do dia'}</p>
            <HourStrip hours={strip} offsetSec={offset} highlight={hour?.time} />
          </>
        )}
        <p className="mt-2 text-[11px] text-muted">{forecastSource(forecast, place, today)}</p>
      </div>
    </section>
  )
}
