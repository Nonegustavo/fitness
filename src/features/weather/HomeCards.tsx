import { CloudSun } from 'lucide-react'
import { Link } from 'react-router'
import { Card, SkeletonCard } from '../../components/ui'
import { useNow } from '../../db/hooks'
import { formatTime, parseDay, shiftDay } from '../../lib/dates'
import { weatherCondition } from '../activities/weather'
import { Note, SmallCard, TileSkeleton, Value } from '../today/tiles'
import { HourStrip, RainChance, skyIcon } from './components'
import { dayOf, degrees, localDay, nextHours, nowWeather, peakRain, rains, tempRange } from './forecast'
import { MAX_AGE_MS, useForecast, useForecastStatus } from './store'

/** The hours shown in the "Em foco" card: as many as fit side by side on a phone. */
const CARD_HOURS = 6
/** The days after today under them, a line each. */
const NEXT_DAYS = 2
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const linkClass = 'text-sm font-medium text-accent-ink'

/** What a card says without a forecast to show: no place yet, or none fetched. */
function missingText(hasPlace: boolean, failed: boolean): string {
  if (!hasPlace) return 'Escolha a cidade em Clima para ver aqui o tempo e a chuva das próximas horas.'
  return failed ? 'Não deu para buscar a previsão agora. O app tenta de novo quando houver conexão.' : 'Buscando a previsão…'
}

/**
 * "Em foco": the weather now at the place, the day's high, low and rain (with how hard it falls in
 * its heaviest hour), and the next hours with their chance of rain and millimetres.
 */
export function WeatherBig() {
  const now = useNow(60_000).getTime()
  const { place, forecast, loading } = useForecast()
  const status = useForecastStatus()
  const header = {
    icon: CloudSun,
    tone: 'water' as const,
    title: 'Clima',
    action: (
      <Link to="/clima" className={linkClass}>
        Detalhes
      </Link>
    ),
  }
  if (place === undefined || (loading && !forecast)) return <SkeletonCard lines={4} />
  if (!place || !forecast) {
    return (
      <Card {...header}>
        <p className="text-sm text-ink-2">{missingText(!!place, !!status.failedAt)}</p>
      </Card>
    )
  }

  const offset = forecast.utcOffsetSec
  const current = nowWeather(forecast, now)
  const today = localDay(now, offset)
  const day = dayOf(forecast, today)
  const hours = nextHours(forecast, now, CARD_HOURS)
  // The next days fill the rest of the card: what's coming for the next runs. When the hours bring
  // rain, their line of millimetres takes the room of the second day.
  const wet = hours.some((hour) => rains(hour.rainMm))
  const nextDays = forecast.days.filter((next) => next.date > today).slice(0, wet ? NEXT_DAYS - 1 : NEXT_DAYS)
  if (!current && !day) {
    return (
      <Card {...header}>
        <p className="text-sm text-ink-2">A previsão guardada já não cobre hoje. Ela volta quando o app conseguir atualizar.</p>
      </Card>
    )
  }
  const code = current?.code ?? day?.code
  const Icon = skyIcon(code, current?.isDay)
  // An old forecast (no connection for a while) says when it's from.
  const old = now - forecast.fetchedAt > 2 * MAX_AGE_MS
  const caption = [
    weatherCondition(code),
    place.source === 'chosen' && place.name,
    old && `previsão das ${formatTime(forecast.fetchedAt)}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Card {...header}>
      <div className="flex items-center gap-3">
        <Icon size={44} strokeWidth={1.5} aria-hidden className="shrink-0 text-ink-2" />
        <div className="min-w-0 flex-1">
          <p className="text-4xl leading-none font-semibold tracking-tight tabular-nums">{current ? degrees(current.tempC) : tempRange(day!)}</p>
          {caption && <p className="mt-1 truncate text-xs text-ink-2 first-letter:uppercase">{caption}</p>}
        </div>
        {day && (
          <div className="shrink-0 text-right text-xs text-ink-2 tabular-nums">
            <p>
              máx <span className="font-semibold text-ink">{degrees(day.maxC)}</span> · mín{' '}
              <span className="font-semibold text-ink">{degrees(day.minC)}</span>
            </p>
            {day.rainChance !== undefined && (
              <p className="mt-1 flex justify-end">
                <RainChance chance={day.rainChance} mm={peakRain(forecast, day.date)} peak />
              </p>
            )}
          </div>
        )}
      </div>
      {hours.length > 1 && (
        <div className="mt-3">
          <HourStrip hours={hours} offsetSec={offset} firstLabel="Agora" dense />
        </div>
      )}
      {nextDays.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs" aria-label="Próximos dias">
          {nextDays.map((next) => {
            const NextIcon = skyIcon(next.code)
            const nextSky = weatherCondition(next.code)
            return (
              <li key={next.date} className="flex items-center gap-2 overflow-hidden">
                <span className="w-14 shrink-0 text-ink-2">{next.date === shiftDay(today, 1) ? 'Amanhã' : WEEKDAYS[parseDay(next.date).getDay()]}</span>
                <NextIcon size={16} aria-hidden className="shrink-0 text-ink-2" />
                {nextSky && <span className="sr-only">{nextSky}</span>}
                <span className="w-[4.25rem] shrink-0 tabular-nums">{tempRange(next)}</span>
                {next.rainChance !== undefined && (
                  <RainChance chance={next.rainChance} mm={peakRain(forecast, next.date)} peak className="min-w-0 text-ink-2" />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/** "Visualização rápida": the temperature now, the day's high and low, and its rain. */
export function WeatherSmall() {
  const now = useNow(60_000).getTime()
  const { place, forecast, loading } = useForecast()
  const status = useForecastStatus()
  if (place === undefined || (loading && !forecast)) return <TileSkeleton />
  const offset = forecast?.utcOffsetSec ?? 0
  const current = forecast && nowWeather(forecast, now)
  const day = forecast && dayOf(forecast, localDay(now, offset))
  if (!place || !forecast || (!current && !day)) {
    return (
      <SmallCard icon={CloudSun} tone="water" label="Clima" to="/clima">
        <Note clamp={2}>{missingText(!!place, !!status.failedAt)}</Note>
      </SmallCard>
    )
  }
  const code = current?.code ?? day?.code
  const Icon = skyIcon(code, current?.isDay)
  const sky = weatherCondition(code)
  return (
    <SmallCard icon={CloudSun} tone="water" label="Clima" to="/clima">
      <span className="flex items-center gap-1.5">
        <Value value={current ? degrees(current.tempC) : tempRange(day!)} />
        <Icon size={22} aria-hidden className="shrink-0 text-ink-2" />
        {sky && <span className="sr-only">{sky}</span>}
      </span>
      <Note>{day ? `máx ${degrees(day.maxC)} · mín ${degrees(day.minC)}` : sky}</Note>
      {day?.rainChance !== undefined && (
        <span className="mt-0.5 block overflow-hidden text-xs text-muted">
          <RainChance chance={day.rainChance} mm={peakRain(forecast, day.date)} peak />
        </span>
      )}
    </SmallCard>
  )
}
