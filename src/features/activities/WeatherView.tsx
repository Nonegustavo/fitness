import type { Activity } from '../../db/types'
import { middleHour, weatherCondition, weatherIcon, weatherText } from './weather'

/** The hour of the activity's middle on this device's clock, for the night icons. */
const localHour = (activity: Activity) => new Date(middleHour(activity)).getHours()

/** The weather during an activity: its icon and "29 °C, sensação 32 °C, umidade 70%, vento 12 km/h". */
export function WeatherLine({ activity }: { activity: Activity }) {
  const weather = activity.weather
  if (!weather) return null
  const Icon = weatherIcon(weather.code, localHour(activity))
  const sky = weatherCondition(weather.code)
  return (
    <p className="mt-3 flex items-center gap-2 text-sm text-ink-2" title={sky}>
      <Icon size={18} aria-hidden className="shrink-0" />
      <span>
        {sky && <span className="sr-only">{sky}, </span>}
        {weatherText(weather)}
      </span>
    </p>
  )
}

/** The same in a list row: the icon and the temperature. */
export function WeatherChip({ activity }: { activity: Activity }) {
  const weather = activity.weather
  if (!weather) return null
  const Icon = weatherIcon(weather.code, localHour(activity))
  return (
    <span className="inline-flex items-center gap-0.5 align-[-1px]" title={weatherText(weather, { condition: true })}>
      <Icon size={12} aria-hidden />
      {Math.round(weather.tempC)}°<span className="sr-only"> ({weatherCondition(weather.code) ?? 'clima'})</span>
    </span>
  )
}
