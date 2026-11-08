import { Activity, BatteryMedium, Flame, Footprints, HeartPulse, Plus, Scale, Target, type LucideIcon } from 'lucide-react'
import { Children, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { IconTile, type Tone } from '../../components/tone'
import { cx, IconButton, Skeleton } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import type { DailyHealth } from '../../db/types'
import { daysBetween, formatTime, parseDay, relativeDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatFixed, formatNumber, formatSigned } from '../../lib/format'
import { changeOver } from '../../lib/stats'
import { metricSeries, useWeights } from '../body/body'
import { WeightModal } from '../body/WeightModal'
import { hrvStatus, useDailyHealth } from '../garmin/recovery'
import { distanceText } from '../races/race'
import { useNextRace } from '../races/races'
import { predicted, useRacePrediction } from '../running/RacePrediction'

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
/** "dom 8/11". */
export const shortDate = (date: DayKey) => `${WEEKDAYS[parseDay(date).getDay()]} ${Number(date.slice(8))}/${Number(date.slice(5, 7))}`

/** The smaller cards, two per row (three on wider screens). Cards with nothing to show are left out. */
export function QuickGrid({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="quick-title">
      <h2 id="quick-title" className="mb-2 text-base font-semibold">
        Visualização rápida
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:empty]:hidden">
        {Children.map(children, (child) => (
          <div className="min-w-0">{child}</div>
        ))}
      </div>
    </section>
  )
}

/**
 * A small card, all of the same size: the section's icon and name, a big number and a line or two.
 * The whole card opens `to`; `action` is a button in the corner, above that link.
 */
export function SmallCard({
  icon,
  tone,
  label,
  to,
  action,
  children,
}: {
  icon: LucideIcon
  tone: Tone
  label: string
  to?: string
  action?: ReactNode
  children: ReactNode
}) {
  const content = (
    <>
      <span className={cx('flex items-center gap-2', Boolean(action) && 'pr-8')}>
        <IconTile icon={icon} tone={tone} />
        <span className="min-w-0 truncate text-sm font-medium text-ink-2">{label}</span>
      </span>
      <span className="mt-2.5 block">{children}</span>
    </>
  )
  return (
    <section className="relative h-36 overflow-hidden rounded-2xl border border-line bg-surface p-3.5 transition hover:bg-surface-2/60">
      {to ? (
        <Link to={to} className="block after:absolute after:inset-0 after:rounded-2xl">
          {content}
        </Link>
      ) : (
        <div>{content}</div>
      )}
      {action && <div className="absolute top-2 right-2 z-10">{action}</div>}
    </section>
  )
}

export const TileSkeleton = () => <Skeleton className="h-36 rounded-2xl" />

export function Value({ value, unit }: { value: ReactNode; unit?: string }) {
  return (
    <span className="block truncate text-2xl leading-tight font-semibold tabular-nums">
      {value}
      {unit && <span className="ml-1 text-sm font-normal text-ink-2">{unit}</span>}
    </span>
  )
}

export const Note = ({ children, clamp = 1 }: { children: ReactNode; clamp?: 1 | 2 }) => (
  <span className={cx('mt-0.5 block text-xs text-muted', clamp === 1 ? 'truncate' : 'line-clamp-2')}>{children}</span>
)

/** A thin bar toward a goal, in a section's color. */
export function ThinBar({ value, max, color }: { value: number; max: number; color: string }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full" style={{ background: `color-mix(in oklab, ${color} 22%, var(--surface-2))` }}>
      <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: color }} />
    </span>
  )
}

export function WeightSmall({ today }: { today: DayKey }) {
  const weights = useWeights()
  const settings = useSettings()
  const [adding, setAdding] = useState(false)
  const series = useMemo(() => metricSeries(weights ?? [], (entry) => entry.weightKg), [weights])
  if (!weights) return <TileSkeleton />
  const latest = weights.at(-1)
  const change7 = changeOver(series.trend, 7)
  const goal = settings.weightGoal?.targetKg
  const weighedToday = weights.some((entry) => entry.date === today)
  return (
    <>
      <SmallCard
        icon={Scale}
        tone="body"
        label="Peso"
        to="/corpo"
        action={
          !weighedToday && (
            <IconButton label="Registrar o peso de hoje" className="size-8" onClick={() => setAdding(true)}>
              <Plus size={18} />
            </IconButton>
          )
        }
      >
        {latest ? (
          <>
            <Value value={formatFixed(latest.weightKg)} unit="kg" />
            <Note>
              {relativeDay(latest.date, today)}
              {goal !== undefined && ` · meta ${formatFixed(goal)}`}
            </Note>
            {change7 !== undefined && <Note>{formatSigned(change7)} kg em 7 dias</Note>}
          </>
        ) : (
          <Note>Nenhuma pesagem ainda.</Note>
        )}
      </SmallCard>
      {adding && <WeightModal entry={null} onClose={() => setAdding(false)} />}
    </>
  )
}

/** The next race (the app's list, or the Garmin calendar), counting down like SisRUN's "Próximo objetivo". */
export function RaceSmall({ today }: { today: DayKey }) {
  const race = useNextRace(today)
  const prediction = useRacePrediction(race?.distance, today)
  if (race === undefined) return <TileSkeleton />
  if (!race) return null
  const days = daysBetween(today, race.date)
  const distance = distanceText(race.distance)
  return (
    <SmallCard icon={Target} tone="analysis" label="Prova" to="/corrida/provas">
      <Value value={days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `${days} dias`} />
      <span className="mt-0.5 block truncate text-xs text-ink-2">{race.name}</span>
      {prediction ? (
        // No room for one more line: the prediction takes the date's place, which the countdown already tells.
        <Note>
          Previsão {predicted(prediction.seconds)}
          {race.time !== undefined && ` · ${formatTime(race.time)}`}
        </Note>
      ) : (
        <Note>
          {shortDate(race.date)}
          {race.time !== undefined && ` · ${formatTime(race.time)}`}
          {distance && ` · ${distance}`}
        </Note>
      )}
    </SmallCard>
  )
}

/** The watch's daily data of the last `days` days, newest last; undefined while loading. */
export function useRecentHealth(today: DayKey, days = 7): DailyHealth[] | undefined {
  return useDailyHealth(shiftDay(today, -days), today)
}

export const average = (values: number[]) =>
  values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined

export function RestingHrSmall({ today }: { today: DayKey }) {
  const days = useRecentHealth(today)
  if (!days) return <TileSkeleton />
  const withHr = days.filter((day) => day.restingHr !== undefined)
  const latest = withHr.at(-1)
  if (!latest) return null
  const before = average(withHr.slice(0, -1).map((day) => day.restingHr!))
  return (
    <SmallCard icon={HeartPulse} tone="recovery" label="FC de repouso" to="/sono">
      <Value value={latest.restingHr} unit="bpm" />
      <Note>
        {relativeDay(latest.id, today)}
        {before !== undefined && ` · média ${Math.round(before)}`}
      </Note>
    </SmallCard>
  )
}

export function HrvSmall({ today }: { today: DayKey }) {
  const days = useRecentHealth(today)
  if (!days) return <TileSkeleton />
  const latest = days.filter((day) => day.hrv?.lastNight !== undefined).at(-1)
  if (!latest?.hrv) return null
  const { lastNight, status, weeklyAvg } = latest.hrv
  return (
    <SmallCard icon={Activity} tone="sleep" label="HRV" to="/sono">
      <Value value={lastNight} unit="ms" />
      <Note>{hrvStatus(status) ?? relativeDay(latest.id, today)}</Note>
      {weeklyAvg !== undefined && <Note>média da semana {weeklyAvg}</Note>}
    </SmallCard>
  )
}

export function BatterySmall({ today }: { today: DayKey }) {
  const days = useRecentHealth(today)
  if (!days) return <TileSkeleton />
  const latest = days.filter((day) => day.bodyBattery?.high !== undefined).at(-1)
  if (!latest?.bodyBattery) return null
  const { high, low } = latest.bodyBattery
  return (
    <SmallCard icon={BatteryMedium} tone="habits" label="Body Battery" to="/sono">
      <Value value={high} />
      <Note>máxima {latest.id === today ? 'de hoje' : relativeDay(latest.id, today)}</Note>
      {low !== undefined && <Note>mínima {low}</Note>}
    </SmallCard>
  )
}

export function StepsSmall({ today }: { today: DayKey }) {
  const days = useRecentHealth(today)
  if (!days) return <TileSkeleton />
  const latest = days.filter((day) => day.steps !== undefined).at(-1)
  if (!latest) return null
  const before = average(days.filter((day) => day.steps !== undefined && day.id !== latest.id).map((day) => day.steps!))
  return (
    <SmallCard icon={Footprints} tone="today" label="Passos" to="/passos">
      <Value value={formatNumber(latest.steps!, 0)} />
      <Note>{latest.id === today ? 'hoje, até a sincronização' : relativeDay(latest.id, today)}</Note>
      {before !== undefined && <Note>média {formatNumber(before, 0)} por dia</Note>}
    </SmallCard>
  )
}

/** The day's energy from the watch, active against at rest (like Garmin's "Calorias queimadas"). */
export function BurnSmall({ today }: { today: DayKey }) {
  const days = useRecentHealth(today)
  if (!days) return <TileSkeleton />
  const latest = days.filter((day) => day.calories?.total !== undefined).at(-1)
  if (!latest?.calories?.total) return null
  const { total, active = 0 } = latest.calories
  return (
    <SmallCard icon={Flame} tone="training" label="Calorias gastas" to="/calorias">
      <Value value={formatNumber(total, 0)} unit="kcal" />
      <ActiveRestBar total={total} active={active} />
      <Note>
        {formatNumber(active, 0)} ativas · {formatNumber(total - active, 0)} repouso
      </Note>
    </SmallCard>
  )
}

/** Active calories (red) against the ones at rest (blue), like Garmin's bar. */
export function ActiveRestBar({ total, active }: { total: number; active: number }) {
  const share = Math.min(1, Math.max(0, active / total))
  return (
    <span aria-hidden className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-series-1">
      <span className="h-full bg-(--tone-recovery)" style={{ width: `${share * 100}%` }} />
    </span>
  )
}
