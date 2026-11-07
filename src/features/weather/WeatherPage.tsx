import { CalendarDays, Clock, CloudSun, Droplets, Dumbbell, RefreshCw, Sun, Sunrise, Sunset, Umbrella, Wind, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { PullToRefresh } from '../../components/PullToRefresh'
import { ToneContext } from '../../components/tone'
import { Button, Card, cx, IconButton, Page, SkeletonCard } from '../../components/ui'
import { useNow, useToday } from '../../db/hooks'
import { formatDay, parseDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { weatherCondition } from '../activities/weather'
import type { AgendaItem } from '../calendar/agenda'
import { AgendaIcon, AgendaItems } from '../calendar/components'
import { useAgenda } from '../calendar/plans'
import { forecastSource, HourStrip, rainIntensity, skyIcon } from './components'
import {
  dayHours,
  dayOf,
  degrees,
  FORECAST_DAYS,
  hourAt,
  localClock,
  localDay,
  nextHours,
  nowWeather,
  peakRain,
  rains,
  spotOf,
  tempRange,
  uvLevel,
  workoutWeather,
  type DayForecast,
  type Forecast,
  type HourForecast,
} from './forecast'
import { PlaceCard } from './PlaceCard'
import type { ResolvedPlace } from './place'
import { MAX_AGE_MS, refreshForecast, useForecast, useForecastStatus } from './store'

const HOUR = 3_600_000
/** How many of the workouts ahead get their forecast listed. */
const WORKOUTS_SHOWN = 5

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const join = (parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ')

/**
 * Clima: the weather now, the next hours and the next 16 days at the place picked (or near the latest
 * outdoor activity), with the workouts scheduled marked on their hours and days.
 */
export default function WeatherPage() {
  const today = useToday()
  const now = useNow(60_000).getTime()
  const { place, forecast, loading } = useForecast()
  const status = useForecastStatus()
  const agenda = useAgenda(today, shiftDay(today, FORECAST_DAYS - 1), today)
  const [openDay, setOpenDay] = useState<DayKey>()
  const planned = useMemo(() => (agenda ?? []).filter((item) => item.status === 'planned' && item.kind !== 'rest'), [agenda])

  const refresh = async () => {
    if (place) await refreshForecast(spotOf(place), { force: true })
  }

  return (
    <PullToRefresh onRefresh={refresh}>
      <Page
        title="Clima"
        icon={CloudSun}
        tone="water"
        subtitle={place ? (place.source === 'chosen' ? place.name : 'Perto da última atividade ao ar livre') : 'Previsão do tempo'}
        actions={
          place && (
            <IconButton label="Atualizar a previsão" onClick={() => void refresh()} disabled={status.loading}>
              <RefreshCw size={20} className={cx(status.loading && 'animate-spin')} />
            </IconButton>
          )
        }
      >
        {place === undefined ? (
          <SkeletonCard lines={5} />
        ) : place === null ? (
          <PlaceCard place={null} />
        ) : (
          <>
            {forecast ? (
              <>
                <CurrentCard forecast={forecast} place={place} now={now} today={today} />
                <HoursCard forecast={forecast} now={now} planned={planned} />
                <WorkoutsCard forecast={forecast} planned={planned} today={today} />
                <DaysCard forecast={forecast} now={now} planned={planned} onOpen={setOpenDay} />
              </>
            ) : loading || status.loading || !status.failedAt ? (
              <SkeletonCard lines={5} />
            ) : (
              <Card>
                <p className="text-sm text-ink-2">Não deu para buscar a previsão agora. Confira a conexão e tente de novo.</p>
                <Button className="mt-3" onClick={() => void refresh()} disabled={status.loading}>
                  <RefreshCw size={16} /> Tentar de novo
                </Button>
              </Card>
            )}
            <PlaceCard place={place} />
          </>
        )}
        {openDay && forecast && (
          <DaySheet date={openDay} forecast={forecast} planned={planned} now={now} today={today} onClose={() => setOpenDay(undefined)} />
        )}
      </Page>
    </PullToRefresh>
  )
}

/** A number with its label and icon, in the grid under the temperature now. */
function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-ink-2">
        <Icon size={13} aria-hidden className="shrink-0" /> {label}
      </dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  )
}

/** The weather now, big, with the day's range, rain, wind, humidity, UV and the sun's times. */
function CurrentCard({ forecast, place, now, today }: { forecast: Forecast; place: ResolvedPlace; now: number; today: DayKey }) {
  const offset = forecast.utcOffsetSec
  const current = nowWeather(forecast, now)
  const day = dayOf(forecast, localDay(now, offset))
  if (!current && !day) {
    return (
      <Card>
        <p className="text-sm text-ink-2">{forecastSource(forecast, place, today)} Ela já não cobre hoje: atualize para ver o tempo agora.</p>
      </Card>
    )
  }
  const code = current?.code ?? day?.code
  const Icon = skyIcon(code, current?.isDay)
  const sky = weatherCondition(code)
  // An old forecast says how old it is a bit louder.
  const old = now - forecast.fetchedAt > 2 * MAX_AGE_MS
  return (
    <Card>
      <p className="text-xs font-medium text-ink-2">Agora</p>
      <div className="flex items-center gap-4">
        <Icon size={56} strokeWidth={1.5} aria-hidden className="shrink-0 text-ink-2" />
        <div className="min-w-0">
          <p className="text-5xl font-semibold tracking-tight">{current ? degrees(current.tempC) : tempRange(day!)}</p>
          {sky && <p className="font-medium first-letter:uppercase">{sky}</p>}
          <p className="text-sm text-ink-2">
            {join([
              current?.feelsC !== undefined && `sensação ${degrees(current.feelsC)}`,
              day && `máx ${degrees(day.maxC)}`,
              day && `mín ${degrees(day.minC)}`,
            ])}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3">
        {day?.rainChance !== undefined && (
          <Fact
            icon={Umbrella}
            label="Chuva hoje"
            value={
              <>
                {day.rainChance}%
                {/* How hard it falls in the day's heaviest hour. */}
                {rainIntensity(peakRain(forecast, day.date), true) && (
                  <span className="block text-xs font-normal text-ink-2">{rainIntensity(peakRain(forecast, day.date), true)}</span>
                )}
              </>
            }
          />
        )}
        {current?.windKmh !== undefined && <Fact icon={Wind} label="Vento" value={`${Math.round(current.windKmh)} km/h`} />}
        {current?.humidity !== undefined && <Fact icon={Droplets} label="Umidade" value={`${current.humidity}%`} />}
        {day?.uv !== undefined && <Fact icon={Sun} label="UV máximo" value={`${Math.round(day.uv)}, ${uvLevel(day.uv)}`} />}
        {day?.sunrise !== undefined && <Fact icon={Sunrise} label="Nascer do sol" value={localClock(day.sunrise, offset)} />}
        {day?.sunset !== undefined && <Fact icon={Sunset} label="Pôr do sol" value={localClock(day.sunset, offset)} />}
      </dl>
      <p className={cx('mt-3 text-xs', old ? 'text-ink-2' : 'text-muted')}>
        {forecastSource(forecast, place, today)}
        {old && ' Sem atualizar desde então: o app tenta de novo quando houver conexão.'}
      </p>
    </Card>
  )
}

/** The planned workouts of a list by the forecast hour they fall in, as icons over that hour. */
function hourMarks(forecast: Forecast, hours: HourForecast[], items: AgendaItem[]): Map<number, ReactNode> | undefined {
  const byHour = new Map<number, AgendaItem[]>()
  for (const item of items) {
    const hour = item.time === undefined ? undefined : hourAt(forecast, item.time)
    if (hour && hours.includes(hour)) byHour.set(hour.time, [...(byHour.get(hour.time) ?? []), item])
  }
  if (byHour.size === 0) return undefined
  return new Map(
    [...byHour].map(([time, workouts]) => [
      time,
      workouts.slice(0, 2).map((item) => (
        <span key={item.key} className="inline-flex">
          <AgendaIcon kind={item.kind} status="planned" size="xs" />
          <span className="sr-only">{item.title}</span>
        </span>
      )),
    ]),
  )
}

/** The next 24 hours, scrolling sideways, the workouts over their hours. */
function HoursCard({ forecast, now, planned }: { forecast: Forecast; now: number; planned: AgendaItem[] }) {
  const hours = nextHours(forecast, now, 24)
  if (hours.length === 0) return null
  const marks = hourMarks(forecast, hours, planned)
  const wet = hours.some((hour) => rains(hour.rainMm))
  return (
    <Card icon={Clock} tone="water" title="Próximas horas">
      <HourStrip hours={hours} offsetSec={forecast.utcOffsetSec} firstLabel="Agora" marks={marks} scroll />
      {(marks || wet) && (
        <p className="mt-1 text-xs text-muted">
          {join([
            wet && 'Embaixo da chance de chuva, os milímetros previstos em cada hora (mm/h)',
            marks && 'os ícones acima das horas são os treinos programados',
          ]).replace(/^./, (first) => first.toUpperCase())}
          .
        </p>
      )}
    </Card>
  )
}

/** The next workouts within the forecast, each with its weather (the rows of the calendar). */
function WorkoutsCard({ forecast, planned, today }: { forecast: Forecast; planned: AgendaItem[]; today: DayKey }) {
  const items = planned.filter((item) => workoutWeather(item, forecast, today)).slice(0, WORKOUTS_SHOWN)
  if (items.length === 0) return null
  return (
    <Card icon={Dumbbell} tone="training" title="Nos treinos programados">
      <AgendaItems items={items} today={today} showDay />
    </Card>
  )
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** "Hoje", "Amanhã", "Sáb, 8/11": short, for the list of days. */
function dayName(date: DayKey, today: DayKey): string {
  if (date === today) return 'Hoje'
  if (date === shiftDay(today, 1)) return 'Amanhã'
  return `${WEEKDAYS[parseDay(date).getDay()]}, ${formatDay(date, 'd/MM')}`
}

/** The next days, one per row: the sky, the chance of rain and the range of temperatures against the whole period's. */
function DaysCard({
  forecast,
  now,
  planned,
  onOpen,
}: {
  forecast: Forecast
  now: number
  planned: AgendaItem[]
  onOpen: (date: DayKey) => void
}) {
  const today = localDay(now, forecast.utcOffsetSec)
  const days = forecast.days.filter((day) => day.date >= today)
  if (days.length === 0) return null
  const low = Math.min(...days.map((day) => day.minC))
  const high = Math.max(...days.map((day) => day.maxC))
  return (
    <Card icon={CalendarDays} tone="water" title="Próximos dias">
      <ul className="-mx-2 divide-y divide-line">
        {days.map((day) => (
          <DayRow
            key={day.date}
            day={day}
            peakMm={peakRain(forecast, day.date)}
            name={dayName(day.date, today)}
            items={planned.filter((item) => item.date === day.date)}
            low={low}
            high={high}
            onOpen={() => onOpen(day.date)}
          />
        ))}
      </ul>
    </Card>
  )
}

function DayRow({
  day,
  peakMm,
  name,
  items,
  low,
  high,
  onOpen,
}: {
  day: DayForecast
  /** The day's heaviest hour of rain, mm/h. */
  peakMm?: number
  name: string
  items: AgendaItem[]
  low: number
  high: number
  onOpen: () => void
}) {
  const Icon = skyIcon(day.code)
  const sky = weatherCondition(day.code)
  const span = Math.max(high - low, 1)
  const left = ((day.minC - low) / span) * 100
  const width = Math.max(((day.maxC - day.minC) / span) * 100, 4)
  const chance = day.rainChance
  const intensity = rainIntensity(peakMm, true)
  const described = join([
    sky,
    tempRange(day),
    chance !== undefined && `chuva ${chance}%`,
    intensity,
    items.length > 0 && `${items.length === 1 ? '1 treino' : `${items.length} treinos`}: ${items.map((item) => item.title).join(', ')}`,
  ])
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-label={`${name}: ${described}`}
        className="grid min-h-12 w-full grid-cols-[5.5rem_1.5rem_4rem_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-surface-2 active:opacity-70"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{name}</span>
          {items.length > 0 && (
            <span aria-hidden className="mt-0.5 flex gap-0.5">
              {items.slice(0, 3).map((item) => (
                <AgendaIcon key={item.key} kind={item.kind} status="planned" size="xs" />
              ))}
            </span>
          )}
        </span>
        <Icon size={20} aria-hidden className="text-ink-2" />
        <span aria-hidden className={cx('text-xs tabular-nums', chance !== undefined && chance >= 30 ? 'text-ink-2' : 'text-muted')}>
          {chance !== undefined && (
            <span className="flex items-center gap-0.5">
              <Umbrella size={12} className="shrink-0" />
              {chance}%
            </span>
          )}
          {/* How hard it rains in the day's heaviest hour. */}
          {intensity && <span className="block text-[10px] whitespace-nowrap text-muted">{intensity}</span>}
        </span>
        <span aria-hidden className="flex items-center gap-2">
          <span className="w-8 text-right text-sm text-muted tabular-nums">{degrees(day.minC)}</span>
          {/* The day's low to high on the scale of the whole period, so warmer and cooler days stand apart. */}
          <span className="relative h-1.5 min-w-8 flex-1 rounded-full bg-surface-2">
            <span className="absolute inset-y-0 rounded-full bg-series-2" style={{ left: `${Math.min(left, 100 - width)}%`, width: `${width}%` }} />
          </span>
          <span className="w-8 text-sm font-medium tabular-nums">{degrees(day.maxC)}</span>
        </span>
      </button>
    </li>
  )
}

/** A day in detail: its summary, its hours and the workouts scheduled on it with their weather. */
function DaySheet({
  date,
  forecast,
  planned,
  now,
  today,
  onClose,
}: {
  date: DayKey
  forecast: Forecast
  planned: AgendaItem[]
  now: number
  today: DayKey
  onClose: () => void
}) {
  const day = dayOf(forecast, date)
  // The day's hours from 5h to 22h; today's from the one going on.
  const hours = dayHours(forecast, date, { from: 5, to: 22 }).filter((hour) => hour.time + HOUR > now)
  const items = planned.filter((item) => item.date === date)
  const Icon = skyIcon(day?.code)
  const sky = weatherCondition(day?.code)
  const offset = forecast.utcOffsetSec
  return (
    <Modal open title={capitalized(formatDay(date))} onClose={onClose}>
      {day && (
        <div className="flex items-center gap-3">
          <Icon size={40} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-2" />
          <div className="min-w-0">
            <p className="font-semibold">
              {tempRange(day)}
              {sky && <span className="font-normal text-ink-2">, {sky}</span>}
            </p>
            <p className="text-sm text-ink-2 first-letter:uppercase">
              {join([
                day.rainChance !== undefined && `chuva até ${day.rainChance}%`,
                rainIntensity(peakRain(forecast, date), true),
                !!day.rainMm && `${formatNumber(day.rainMm, 1)} mm no dia`,
                day.windKmh !== undefined && `vento até ${Math.round(day.windKmh)} km/h`,
              ])}
            </p>
            <p className="text-xs text-muted first-letter:uppercase">
              {join([
                day.uv !== undefined && `UV ${Math.round(day.uv)}, ${uvLevel(day.uv)}`,
                day.sunrise !== undefined && `nascer do sol ${localClock(day.sunrise, offset)}`,
                day.sunset !== undefined && `pôr do sol ${localClock(day.sunset, offset)}`,
              ])}
            </p>
          </div>
        </div>
      )}
      {hours.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-1 text-sm font-semibold">Hora a hora</h3>
          <HourStrip hours={hours} offsetSec={offset} marks={hourMarks(forecast, hours, items)} scroll />
        </section>
      )}
      {items.length > 0 && (
        <section className="mt-4">
          <h3 className="text-sm font-semibold">{items.length === 1 ? 'Treino programado' : 'Treinos programados'}</h3>
          {/* The rows' buttons in the training color, as in the calendar. */}
          <ToneContext value="training">
            <div data-tone="training">
              <AgendaItems items={items} today={today} />
            </div>
          </ToneContext>
        </section>
      )}
    </Modal>
  )
}
