import { Activity, BatteryMedium, Flame, Footprints, HeartPulse, Scale, Target, Utensils } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { MiniBars, RangeBars, Sparkline } from '../../components/MiniCharts'
import { toneColor } from '../../components/tone'
import { Card, SkeletonCard } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import type { DailyHealth } from '../../db/types'
import { dayRange, daysBetween, formatDay, formatTime, parseDay, relativeDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatFixed, formatNumber, formatSigned } from '../../lib/format'
import { changeOver } from '../../lib/stats'
import { useActivities } from '../activities/activities'
import { metricSeries, useWeights } from '../body/body'
import { eventKm, eventTitle } from '../calendar/agenda'
import { DayProgress } from '../food/DayProgress'
import { goalsFor, sumNutrients, useFoodLogs, useTrainingDays } from '../food/nutrition'
import { hrvStatus } from '../garmin/recovery'
import { RacePredictionLine } from '../running/RacePrediction'
import { weeklyVolume } from '../running/running'
import { ActiveRestBar, average, useNextRace, useRecentHealth } from './tiles'

const LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const detailsLink = (to: string, label = 'Detalhes') => (
  <Link to={to} className="text-sm font-medium text-accent-ink">
    {label}
  </Link>
)

/** The big number of a card, with its unit and a line under it. */
function Headline({ value, unit, note }: { value: ReactNode; unit?: string; note?: ReactNode }) {
  return (
    <div>
      <p className="text-4xl leading-none font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1.5 text-base font-normal text-ink-2">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-sm text-ink-2">{note}</p>}
    </div>
  )
}

/** Weekday letters under a week of bars. */
function DayLetters({ days, today }: { days: DayKey[]; today: DayKey }) {
  return (
    <div className="mt-1 flex gap-[3px] text-center text-[10px] text-muted">
      {days.map((day) => (
        <span key={day} className={day === today ? 'min-w-0 flex-1 font-bold text-ink-2' : 'min-w-0 flex-1'}>
          {LETTERS[parseDay(day).getDay()]}
        </span>
      ))}
    </div>
  )
}

/** One value per day of the range, from the watch's daily rows. */
function perDay<T>(rows: DailyHealth[], days: DayKey[], pick: (row: DailyHealth) => T | undefined): (T | undefined)[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return days.map((day) => {
    const row = byId.get(day)
    return row ? pick(row) : undefined
  })
}

/** The day's food for "Em foco": the same summary as on top of the food screen. */
export function FoodBig({ today }: { today: DayKey }) {
  const settings = useSettings()
  const logs = useFoodLogs(today, today)
  const trainingDay = useTrainingDays(today, today)?.has(today) ?? false
  if (!logs) return <SkeletonCard lines={5} />
  const totals = sumNutrients(logs.map((log) => log.nutrients))
  return (
    <Card icon={Utensils} tone="food" title="Alimentação" action={detailsLink('/alimentacao', 'Refeições')}>
      <DayProgress totals={totals} goals={goalsFor(settings, trainingDay)} date={today} today={today} />
    </Card>
  )
}

export function WeightBig({ today }: { today: DayKey }) {
  const weights = useWeights()
  const settings = useSettings()
  const series = useMemo(() => metricSeries(weights ?? [], (entry) => entry.weightKg), [weights])
  if (!weights) return <SkeletonCard lines={4} />
  const latest = weights.at(-1)
  const from = shiftDay(today, -60)
  const trend = series.trend.filter((point) => point.date >= from)
  const goal = settings.weightGoal?.targetKg
  const now = series.trend.at(-1)?.value
  const change7 = changeOver(series.trend, 7)
  const change30 = changeOver(series.trend, 30)
  return (
    <Card icon={Scale} tone="body" title="Peso" action={detailsLink('/corpo', 'Gráficos')}>
      {latest ? (
        <>
          <Headline
            value={formatFixed(latest.weightKg)}
            unit="kg"
            note={`${relativeDay(latest.date, today)}${now !== undefined ? ` · tendência ${formatFixed(now)} kg` : ''}`}
          />
          <div className="mt-3">
            <Sparkline values={trend.map((point) => point.value)} color={toneColor('body')} label="Tendência do peso nos últimos 60 dias" />
          </div>
          <p className="mt-2 text-xs text-muted">
            {change7 !== undefined && `${formatSigned(change7)} kg em 7 dias`}
            {change30 !== undefined && ` · ${formatSigned(change30)} kg em 30 dias`}
            {goal !== undefined && now !== undefined && ` · faltam ${formatFixed(Math.abs(now - goal))} kg para a meta`}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">Nenhuma pesagem ainda.</p>
      )}
    </Card>
  )
}

/** `inRunning`: on the running screen itself, the link goes to the race's day in the calendar. */
export function RaceBig({ today, inRunning = false }: { today: DayKey; inRunning?: boolean }) {
  const race = useNextRace(today)
  const activities = useActivities()
  if (!race) return null
  const days = daysBetween(today, race.date)
  const km = eventKm(race.title)
  const weeks = activities ? weeklyVolume(activities, today, 4) : undefined
  return (
    <Card
      icon={Target}
      tone="analysis"
      title="Próxima prova"
      action={inRunning ? detailsLink(`/calendario?dia=${race.date}`, 'Calendário') : detailsLink('/corrida', 'Corrida')}
    >
      <Headline value={days === 0 ? 'Hoje!' : days === 1 ? 'Amanhã' : days} unit={days > 1 ? 'dias' : undefined} />
      <p className="mt-3 font-medium">{eventTitle(race.title)}</p>
      <p className="text-sm text-ink-2 first-letter:uppercase">
        {formatDay(race.date)}
        {race.time !== undefined && ` às ${formatTime(race.time)}`}
        {km !== undefined && ` · ${formatNumber(km, 1)} km`}
      </p>
      <RacePredictionLine race={race} today={today} />
      {weeks && (
        <p className="mt-3 text-xs text-muted">
          Corrida nas últimas 4 semanas: {weeks.map((week) => formatNumber(week.km, 1)).join(' · ')} km
        </p>
      )}
    </Card>
  )
}

export function RestingHrBig({ today }: { today: DayKey }) {
  const rows = useRecentHealth(today, 13)
  if (!rows) return <SkeletonCard lines={4} />
  const days = dayRange(shiftDay(today, -13), today)
  const values = perDay(rows, days, (row) => row.restingHr)
  const latestIndex = values.findLastIndex((value) => value !== undefined)
  if (latestIndex < 0) return null
  const mean = average(values.filter((value): value is number => value !== undefined))
  return (
    <Card icon={HeartPulse} tone="recovery" title="FC de repouso" action={detailsLink('/sono')}>
      <Headline value={values[latestIndex]} unit="bpm" note={`${relativeDay(days[latestIndex], today)}${mean ? ` · média de 14 dias ${Math.round(mean)}` : ''}`} />
      <div className="mt-3">
        <Sparkline values={values} color={toneColor('recovery')} label="FC de repouso nos últimos 14 dias" />
      </div>
      <p className="mt-1 text-xs text-muted">Últimos 14 dias. Mais baixa costuma indicar boa recuperação.</p>
    </Card>
  )
}

export function HrvBig({ today }: { today: DayKey }) {
  const rows = useRecentHealth(today, 13)
  if (!rows) return <SkeletonCard lines={4} />
  const days = dayRange(shiftDay(today, -13), today)
  const values = perDay(rows, days, (row) => row.hrv?.lastNight)
  const latestIndex = values.findLastIndex((value) => value !== undefined)
  if (latestIndex < 0) return null
  const latest = rows.find((row) => row.id === days[latestIndex])?.hrv
  const band =
    latest?.balancedLow !== undefined && latest.balancedHigh !== undefined
      ? { low: latest.balancedLow, high: latest.balancedHigh }
      : undefined
  return (
    <Card icon={Activity} tone="sleep" title="HRV" action={detailsLink('/sono')}>
      <Headline
        value={values[latestIndex]}
        unit="ms"
        note={[hrvStatus(latest?.status), latest?.weeklyAvg !== undefined ? `média da semana ${latest.weeklyAvg}` : undefined]
          .filter(Boolean)
          .join(' · ')}
      />
      <div className="mt-3">
        <Sparkline values={values} band={band} color={toneColor('sleep')} label="HRV nos últimos 14 dias" />
      </div>
      <p className="mt-1 text-xs text-muted">Últimos 14 dias{band ? `; a faixa é a equilibrada (${band.low}–${band.high} ms)` : ''}.</p>
    </Card>
  )
}

export function BatteryBig({ today }: { today: DayKey }) {
  const rows = useRecentHealth(today, 6)
  if (!rows) return <SkeletonCard lines={4} />
  const days = dayRange(shiftDay(today, -6), today)
  const ranges = perDay(rows, days, (row) =>
    row.bodyBattery?.high !== undefined && row.bodyBattery.low !== undefined
      ? { low: row.bodyBattery.low, high: row.bodyBattery.high }
      : undefined,
  )
  const latest = [...rows].reverse().find((row) => row.bodyBattery?.high !== undefined)?.bodyBattery
  if (!latest) return null
  return (
    <Card icon={BatteryMedium} tone="habits" title="Body Battery" action={detailsLink('/sono')}>
      <Headline
        value={latest.high}
        note={[
          latest.low !== undefined ? `mínima ${latest.low}` : undefined,
          latest.charged !== undefined ? `+${latest.charged} recarga` : undefined,
          latest.drained !== undefined ? `−${latest.drained} gasto` : undefined,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <div className="mt-3">
        <RangeBars ranges={ranges} color={toneColor('habits')} label="Body Battery dos últimos 7 dias, da mínima à máxima" />
        <DayLetters days={days} today={today} />
      </div>
    </Card>
  )
}

export function StepsBig({ today }: { today: DayKey }) {
  const rows = useRecentHealth(today, 6)
  if (!rows) return <SkeletonCard lines={4} />
  const days = dayRange(shiftDay(today, -6), today)
  const values = perDay(rows, days, (row) => row.steps)
  const latestIndex = values.findLastIndex((value) => value !== undefined)
  if (latestIndex < 0) return null
  const mean = average(values.slice(0, -1).filter((value): value is number => value !== undefined))
  return (
    <Card icon={Footprints} tone="today" title="Passos" action={detailsLink('/passos')}>
      <Headline
        value={formatNumber(values[latestIndex]!, 0)}
        note={`${days[latestIndex] === today ? 'hoje, até a última sincronização' : relativeDay(days[latestIndex], today)}${mean ? ` · média ${formatNumber(mean, 0)}` : ''}`}
      />
      <div className="mt-3">
        <MiniBars values={values.map((value) => value ?? 0)} marker={mean} color={toneColor('today')} label="Passos dos últimos 7 dias" />
        <DayLetters days={days} today={today} />
      </div>
    </Card>
  )
}

export function BurnBig({ today }: { today: DayKey }) {
  const rows = useRecentHealth(today, 6)
  if (!rows) return <SkeletonCard lines={4} />
  const days = dayRange(shiftDay(today, -6), today)
  const totals = perDay(rows, days, (row) => row.calories?.total)
  const latest = [...rows].reverse().find((row) => row.calories?.total)
  if (!latest?.calories?.total) return null
  const { total, active = 0 } = latest.calories
  return (
    <Card icon={Flame} tone="training" title="Calorias gastas" action={detailsLink('/calorias')}>
      <Headline
        value={formatNumber(total, 0)}
        unit="kcal"
        note={`${formatNumber(active, 0)} ativas · ${formatNumber(total - active, 0)} em repouso${latest.id !== today ? ` · ${relativeDay(latest.id, today)}` : ''}`}
      />
      <ActiveRestBar total={total} active={active} />
      <div className="mt-3">
        <MiniBars values={totals.map((value) => value ?? 0)} color={toneColor('training')} label="Calorias gastas nos últimos 7 dias" />
        <DayLetters days={days} today={today} />
      </div>
    </Card>
  )
}
