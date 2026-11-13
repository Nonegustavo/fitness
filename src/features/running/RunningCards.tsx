import { CalendarCheck, Gauge, SportShoe, Trophy } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { MiniBars, Sparkline } from '../../components/MiniCharts'
import { toneColor } from '../../components/tone'
import { Card, cx, SkeletonCard } from '../../components/ui'
import { formatDay, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { formatClock, formatNumber } from '../../lib/format'
import { useActivities } from '../activities/activities'
import { weekSummary } from '../calendar/agenda'
import { useAgenda } from '../calendar/plans'
import { Note, SmallCard, TileSkeleton, Value } from '../today/tiles'
import { useSessions } from '../training/training'
import { useRunEfforts } from './efforts'
import {
  consistency,
  formatPace,
  heatmap,
  isOutdoorRun,
  personalRecords,
  pooledPace,
  trainingDays,
  weeklyVolume,
  weekPace,
  type HeatDay,
  type Records,
} from './running'

const RUN = toneColor('today')

const percent = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : undefined)
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value)}`

/**
 * The running of the last `weeks` weeks, and the km planned for this one (from the SisRUN names);
 * undefined until both are read, so the plan doesn't come in after the card.
 */
function useVolume(today: DayKey, weeks: number) {
  const activities = useActivities()
  const from = weekStart(today)
  const agenda = useAgenda(from, shiftDay(from, 6), today)
  return useMemo(
    () =>
      activities &&
      agenda && {
        weeks: weeklyVolume(activities, today, weeks),
        planned: weekSummary(agenda).plannedRunKm,
      },
    [activities, agenda, today, weeks],
  )
}

export function RunVolumeBig({ today }: { today: DayKey }) {
  const volume = useVolume(today, 12)
  if (!volume) return <SkeletonCard lines={4} />
  const { weeks, planned } = volume
  const current = weeks.at(-1)!
  const last = weeks.at(-2)!
  const ran = weeks.slice(0, -1).filter((week) => week.km > 0)
  const mean = ran.length > 0 ? ran.reduce((total, week) => total + week.km, 0) / ran.length : undefined
  const change = percent(current.km, last.km)
  return (
    <Card
      icon={SportShoe}
      tone="today"
      title="Volume de corrida"
      action={
        <Link to="/corrida" className="text-sm font-medium text-accent-ink">
          Corrida
        </Link>
      }
    >
      <p className="text-4xl leading-none font-semibold tabular-nums">
        {formatNumber(current.km, 1)}
        <span className="ml-1.5 text-base font-normal text-ink-2">
          km esta semana{planned ? ` de ${formatNumber(planned, 1)} previstos` : ''}
        </span>
      </p>
      <p className="mt-1 text-sm text-ink-2">
        Semana passada {formatNumber(last.km, 1)} km
        {change !== undefined && last.km > 0 && ` (${signed(change)}% até agora)`}
      </p>
      <div className="mt-3">
        <MiniBars values={weeks.map((week) => week.km)} marker={mean} color={RUN} label="Quilômetros de corrida por semana nas últimas 12 semanas" />
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>{formatDay(weeks[0].week, 'd/MM')}</span>
          <span>esta semana</span>
        </div>
      </div>
      {mean !== undefined && (
        <p className="mt-1 text-xs text-muted">Média de {formatNumber(mean, 1)} km por semana nas semanas com corrida.</p>
      )}
    </Card>
  )
}

export function RunVolumeSmall({ today }: { today: DayKey }) {
  const volume = useVolume(today, 8)
  if (!volume) return <TileSkeleton />
  const { weeks, planned } = volume
  const current = weeks.at(-1)!
  return (
    <SmallCard icon={SportShoe} tone="today" label="Corrida na semana" to="/corrida">
      <Value value={formatNumber(current.km, 1)} unit={planned ? `de ${formatNumber(planned, 1)} km` : 'km'} />
      <Note>semana passada {formatNumber(weeks.at(-2)!.km, 1)} km</Note>
      <MiniBars values={weeks.map((week) => week.km)} color={RUN} label="Quilômetros por semana nas últimas 8 semanas" className="mt-1.5 h-5" />
    </SmallCard>
  )
}

/** Weeks in a row, the record of days in a row and the map of the last `weeks` weeks. */
export function useConsistency(today: DayKey, weeks = 16) {
  const activities = useActivities()
  const sessions = useSessions()
  return useMemo(() => {
    if (!activities || !sessions) return undefined
    const days = trainingDays(activities, sessions)
    return { stats: consistency(days, today, weeks), map: heatmap(activities, days, today, weeks) }
  }, [activities, sessions, today, weeks])
}

/** The days of the last weeks as squares, a column per week (Sunday on top): runs by distance, other workouts. */
export function ConsistencyMap({ map, rowHeight = 11 }: { map: HeatDay[][]; rowHeight?: number }) {
  return (
    <>
      <div
        role="img"
        aria-label={`Dias com treino nas últimas ${map.length} semanas, de domingo a sábado`}
        className="grid grid-flow-col gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${map.length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(7, ${rowHeight}px)` }}
      >
        {map.flat().map((day) => (
          <span
            key={day.date}
            title={`${formatDay(day.date, 'd/MM')}${day.km > 0 ? `: ${formatNumber(day.km, 1)} km` : day.trained ? ': treino' : ''}`}
            className={cx('rounded-[3px]', day.future ? 'border border-dashed border-line' : !day.trained && 'bg-surface-2')}
            style={
              day.km > 0
                ? { background: RUN, opacity: day.km >= 15 ? 1 : day.km >= 8 ? 0.8 : day.km >= 4 ? 0.6 : 0.4 }
                : day.trained
                  ? { background: toneColor('training'), opacity: 0.55 }
                  : undefined
            }
          />
        ))}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-[2px]" style={{ background: RUN }} /> corrida (mais forte, mais km)
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-[2px] opacity-60" style={{ background: toneColor('training') }} /> outro treino
        </span>
      </p>
    </>
  )
}

export function StreakBig({ today }: { today: DayKey }) {
  const data = useConsistency(today)
  if (!data) return <SkeletonCard lines={5} />
  const { stats, map } = data
  return (
    <Card
      icon={CalendarCheck}
      tone="today"
      title="Constância"
      action={
        <Link to="/corrida" className="text-sm font-medium text-accent-ink">
          Corrida
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { value: stats.weeksInRow, label: stats.weeksInRow === 1 ? 'semana seguida' : 'semanas seguidas' },
          { value: stats.daysTrained, label: 'dias treinados em 16 semanas' },
          { value: stats.bestDayStreak, label: 'dias seguidos (recorde)' },
        ].map(({ value, label }) => (
          <div key={label} className="rounded-xl bg-surface-2 px-1 py-2">
            <p className="text-2xl leading-none font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-[11px] leading-tight text-muted">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <ConsistencyMap map={map} />
      </div>
    </Card>
  )
}

export function StreakSmall({ today }: { today: DayKey }) {
  const data = useConsistency(today)
  if (!data) return <TileSkeleton />
  const { stats } = data
  return (
    <SmallCard icon={CalendarCheck} tone="today" label="Constância" to="/corrida">
      <Value value={stats.weeksInRow} unit={stats.weeksInRow === 1 ? 'semana' : 'semanas'} />
      <Note>seguidas treinando</Note>
      <Note>{stats.daysTrained} dias em 16 semanas</Note>
    </SmallCard>
  )
}

/** The best times, from the cache of the runs' best stretches (no samples read); undefined while loading. */
function useRecords(): Records | undefined {
  const activities = useActivities()
  const efforts = useRunEfforts()
  return useMemo(
    () => (activities && efforts ? personalRecords(activities.filter(isOutdoorRun), efforts.lookup) : undefined),
    [activities, efforts],
  )
}

export function RecordsBig() {
  const records = useRecords()
  if (!records) return <SkeletonCard lines={5} />
  if (records.efforts.length === 0 && !records.longest) return null
  return (
    <Card
      icon={Trophy}
      tone="analysis"
      title="Recordes pessoais"
      action={
        <Link to="/corrida/recordes" className="text-sm font-medium text-accent-ink">
          Ver todos
        </Link>
      }
    >
      <ul className="divide-y divide-line">
        {records.efforts.map((record) => (
          <li key={record.label}>
            <Link to={`/treinos/atividades/${record.activityId}`} className="flex items-baseline gap-3 py-1.5 hover:text-accent-ink">
              <span className="w-28 shrink-0 text-sm text-ink-2">{record.label}</span>
              <span className="flex-1 text-lg font-semibold tabular-nums">{formatClock(record.seconds)}</span>
              <span className="text-xs text-muted tabular-nums">
                {formatPace(record.seconds / (record.meters / 1000))}/km · {formatDay(record.date, 'd/MM/yy')}
              </span>
            </Link>
          </li>
        ))}
        {records.longest && (
          <li>
            <Link to={`/treinos/atividades/${records.longest.activityId}`} className="flex items-baseline gap-3 py-1.5 hover:text-accent-ink">
              <span className="w-28 shrink-0 text-sm text-ink-2">Mais longa</span>
              <span className="flex-1 text-lg font-semibold tabular-nums">{formatNumber(records.longest.km, 1)} km</span>
              <span className="text-xs text-muted tabular-nums">{formatDay(records.longest.date, 'd/MM/yy')}</span>
            </Link>
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-muted">Melhores trechos das suas corridas ao ar livre, pelos dados do relógio.</p>
    </Card>
  )
}

export function RecordsSmall() {
  const records = useRecords()
  if (!records) return <TileSkeleton />
  const [first, ...rest] = [...records.efforts].reverse().filter((record) => record.meters <= 10000)
  if (!first) return null
  return (
    <SmallCard icon={Trophy} tone="analysis" label="Recordes" to="/corrida/recordes">
      <Value value={formatClock(first.seconds)} unit={first.short} />
      {rest.slice(0, 2).map((record) => (
        <Note key={record.label}>
          {record.short}: {formatClock(record.seconds)}
        </Note>
      ))}
    </SmallCard>
  )
}

/** The pace of the last 4 weeks against the 4 before, and week by week. */
function usePace(today: DayKey) {
  const activities = useActivities()
  return useMemo(() => {
    if (!activities) return undefined
    const weeks = weeklyVolume(activities, today, 12)
    const now = pooledPace(weeks.slice(-4))
    const before = pooledPace(weeks.slice(-8, -4))
    return { weeks, now, change: now !== undefined && before !== undefined ? now - before : undefined }
  }, [activities, today])
}

const paceChange = (seconds: number) => `${seconds < 0 ? '−' : '+'}${formatPace(Math.abs(seconds))}`

export function PaceBig({ today }: { today: DayKey }) {
  const pace = usePace(today)
  if (!pace) return <SkeletonCard lines={4} />
  if (pace.now === undefined) return null
  return (
    <Card
      icon={Gauge}
      tone="today"
      title="Ritmo médio"
      action={
        <Link to="/corrida" className="text-sm font-medium text-accent-ink">
          Corrida
        </Link>
      }
    >
      <p className="text-4xl leading-none font-semibold tabular-nums">
        {formatPace(pace.now)}
        <span className="ml-1.5 text-base font-normal text-ink-2">/km nas últimas 4 semanas</span>
      </p>
      {pace.change !== undefined && (
        <p className="mt-1 text-sm text-ink-2">
          {paceChange(pace.change)} por km que as 4 semanas antes ({pace.change < 0 ? 'mais rápido' : 'mais lento'})
        </p>
      )}
      <div className="mt-3">
        <Sparkline values={pace.weeks.map(weekPace)} invert color={RUN} label="Ritmo médio por semana nas últimas 12 semanas; mais alto, mais rápido" />
      </div>
      <p className="mt-1 text-xs text-muted">Por semana, todas as corridas juntas; mais alto no gráfico é mais rápido.</p>
    </Card>
  )
}

export function PaceSmall({ today }: { today: DayKey }) {
  const pace = usePace(today)
  if (!pace) return <TileSkeleton />
  if (pace.now === undefined) return null
  return (
    <SmallCard icon={Gauge} tone="today" label="Ritmo médio" to="/corrida">
      <Value value={formatPace(pace.now)} unit="/km" />
      <Note>últimas 4 semanas</Note>
      {pace.change !== undefined && <Note>{paceChange(pace.change)} vs as 4 antes</Note>}
    </SmallCard>
  )
}
