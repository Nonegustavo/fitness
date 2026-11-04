import { Activity, BatteryMedium, Flame, Footprints, HeartPulse, Plus, Scale, Target, type LucideIcon } from 'lucide-react'
import { Children, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { IconTile, type Tone } from '../../components/tone'
import { cx, IconButton, Skeleton } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import type { DailyHealth } from '../../db/types'
import { daysBetween, formatDay, formatTime, relativeDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatFixed, formatNumber, formatSigned } from '../../lib/format'
import { changeOver } from '../../lib/stats'
import { metricSeries, useWeights } from '../body/body'
import { WeightModal } from '../body/WeightModal'
import { eventKm, eventTitle, nextRace } from '../calendar/agenda'
import { hrvStatus, useDailyHealth } from '../garmin/recovery'
import { usePlannedEvents } from '../garmin/sync'

/** The smaller cards under "Em foco", two per row (three on wider screens). Tiles with nothing to show are left out. */
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

/** A small card: the section's icon and name, a big number and a line or two. The whole card opens `to`. */
function QuickTile({
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
  to: string
  /** A button in the corner, above the link (like "+" on the weight). */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="relative h-full rounded-2xl border border-line bg-surface p-3.5 transition hover:bg-surface-2/60">
      <Link to={to} className="block after:absolute after:inset-0 after:rounded-2xl">
        <span className={cx('flex items-center gap-2', Boolean(action) && 'pr-8')}>
          <IconTile icon={icon} tone={tone} />
          <span className="min-w-0 truncate text-sm font-medium text-ink-2">{label}</span>
        </span>
        <span className="mt-3 block">{children}</span>
      </Link>
      {action && <div className="absolute top-2 right-2 z-10">{action}</div>}
    </section>
  )
}

const TileSkeleton = () => <Skeleton className="h-28 rounded-2xl" />

function Value({ value, unit }: { value: ReactNode; unit?: string }) {
  return (
    <span className="block text-2xl leading-tight font-semibold tabular-nums">
      {value}
      {unit && <span className="ml-1 text-sm font-normal text-ink-2">{unit}</span>}
    </span>
  )
}

const Note = ({ children }: { children: ReactNode }) => <span className="mt-0.5 block text-xs text-muted">{children}</span>

export function WeightTile({ today }: { today: DayKey }) {
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
      <QuickTile
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
      </QuickTile>
      {adding && <WeightModal entry={null} onClose={() => setAdding(false)} />}
    </>
  )
}

/** The next race in the Garmin calendar, counting down (like SisRUN's "Próximo objetivo"). */
export function RaceTile({ today }: { today: DayKey }) {
  const events = usePlannedEvents()
  const race = events ? nextRace(events, today) : undefined
  if (!race) return null
  const days = daysBetween(today, race.date)
  const km = eventKm(race.title)
  return (
    <QuickTile icon={Target} tone="analysis" label="Prova" to={`/calendario?dia=${race.date}`}>
      <Value value={days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `${days} dias`} />
      <span className="mt-0.5 line-clamp-2 block text-xs text-ink-2">{eventTitle(race.title)}</span>
      <Note>
        {formatDay(race.date, 'EEE, d/MM')}
        {race.time !== undefined && ` às ${formatTime(race.time)}`}
        {km !== undefined && ` · ${formatNumber(km, 1)} km`}
      </Note>
    </QuickTile>
  )
}

/** The last week of the watch's daily data, newest last; undefined while loading. */
function useRecentHealth(today: DayKey): DailyHealth[] | undefined {
  return useDailyHealth(shiftDay(today, -7), today)
}

const average = (values: number[]) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined)

export function RestingHrTile({ today }: { today: DayKey }) {
  const days = useRecentHealth(today)
  if (!days) return <TileSkeleton />
  const withHr = days.filter((day) => day.restingHr !== undefined)
  const latest = withHr.at(-1)
  if (!latest) return null
  const before = average(withHr.slice(0, -1).map((day) => day.restingHr!))
  return (
    <QuickTile icon={HeartPulse} tone="recovery" label="FC de repouso" to="/sono">
      <Value value={latest.restingHr} unit="bpm" />
      <Note>
        {relativeDay(latest.id, today)}
        {before !== undefined && ` · média ${Math.round(before)}`}
      </Note>
    </QuickTile>
  )
}

export function HrvTile({ today }: { today: DayKey }) {
  const days = useRecentHealth(today)
  if (!days) return <TileSkeleton />
  const latest = days.filter((day) => day.hrv?.lastNight !== undefined).at(-1)
  if (!latest?.hrv) return null
  const { lastNight, status, weeklyAvg } = latest.hrv
  return (
    <QuickTile icon={Activity} tone="sleep" label="HRV" to="/sono">
      <Value value={lastNight} unit="ms" />
      <Note>
        {hrvStatus(status) ?? relativeDay(latest.id, today)}
        {weeklyAvg !== undefined && ` · semana ${weeklyAvg}`}
      </Note>
    </QuickTile>
  )
}

export function BatteryTile({ today }: { today: DayKey }) {
  const days = useRecentHealth(today)
  if (!days) return <TileSkeleton />
  const latest = days.filter((day) => day.bodyBattery?.high !== undefined).at(-1)
  if (!latest?.bodyBattery) return null
  const { high, low } = latest.bodyBattery
  return (
    <QuickTile icon={BatteryMedium} tone="habits" label="Body Battery" to="/sono">
      <Value value={high} />
      <Note>
        máxima {latest.id === today ? 'de hoje' : relativeDay(latest.id, today)}
        {low !== undefined && ` · mínima ${low}`}
      </Note>
    </QuickTile>
  )
}

export function StepsTile({ today }: { today: DayKey }) {
  const days = useRecentHealth(today)
  if (!days) return <TileSkeleton />
  const latest = days.filter((day) => day.steps !== undefined).at(-1)
  if (!latest) return null
  return (
    <QuickTile icon={Footprints} tone="today" label="Passos" to="/sono">
      <Value value={formatNumber(latest.steps!, 0)} />
      <Note>{relativeDay(latest.id, today)}, até a última sincronização</Note>
    </QuickTile>
  )
}

/** The day's energy from the watch, active against at rest (like Garmin's "Calorias queimadas"). */
export function BurnTile({ today }: { today: DayKey }) {
  const days = useRecentHealth(today)
  if (!days) return <TileSkeleton />
  const latest = days.filter((day) => day.calories?.total !== undefined).at(-1)
  if (!latest?.calories?.total) return null
  const { total, active = 0 } = latest.calories
  const activeShare = Math.min(1, Math.max(0, active / total))
  return (
    <QuickTile icon={Flame} tone="training" label="Calorias gastas" to="/alimentacao">
      <Value value={formatNumber(total, 0)} unit="kcal" />
      <span aria-hidden className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-series-1">
        <span className="h-full bg-(--tone-recovery)" style={{ width: `${activeShare * 100}%` }} />
      </span>
      <Note>
        {formatNumber(active, 0)} ativas · {formatNumber(total - active, 0)} em repouso
        {latest.id !== today && ` · ${relativeDay(latest.id, today)}`}
      </Note>
    </QuickTile>
  )
}
