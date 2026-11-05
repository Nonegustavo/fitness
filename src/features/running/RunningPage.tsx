import { CalendarCheck, CalendarDays, Footprints, Gauge, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Card, Empty, Page, Segmented, SkeletonCard, Stat } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { shiftDay, weekStart } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
import { useActivities } from '../activities/activities'
import { ActivityRow } from '../activities/components'
import { weekSummary } from '../calendar/agenda'
import { AgendaItems } from '../calendar/components'
import { useAgenda } from '../calendar/plans'
import { RaceBig } from '../today/bigCards'
import { ConsistencyMap, RecordsBig, useConsistency } from './RunningCards'
import { WeeklyKmChart, WeeklyPaceChart } from './RunningCharts'
import { formatPace, isRun, pooledPace, weeklyVolume } from './running'

type Span = '12' | '26' | '52'

const SPANS: { value: Span; label: string }[] = [
  { value: '12', label: '12 semanas' },
  { value: '26', label: '26 semanas' },
  { value: '52', label: '1 ano' },
]

/** Running in detail: this week, volume and pace week by week, consistency, records, the next race and the latest runs. */
export default function RunningPage() {
  const today = useToday()
  const activities = useActivities()
  const [span, setSpan] = useState<Span>('12')
  const from = weekStart(today)
  const agenda = useAgenda(from, shiftDay(from, 6), today)
  const consistency = useConsistency(today, 26)
  const weeks = useMemo(() => activities && weeklyVolume(activities, today, Number(span)), [activities, today, span])

  if (!activities || !weeks || !agenda || !consistency) {
    return (
      <Page title="Corrida" icon={Footprints} tone="today">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={6} />
      </Page>
    )
  }

  const runs = activities.filter(isRun)
  const summary = weekSummary(agenda)
  // Only the runs: walks are workouts of their own, never mixed into the running.
  const thisWeek = agenda.filter((item) => item.kind === 'run')
  const current = weeks.at(-1)!
  const recentPace = pooledPace(weeks.slice(-4))
  const beforePace = pooledPace(weeks.slice(-8, -4))

  return (
    <Page title="Corrida" icon={Footprints} tone="today" subtitle="Volume, ritmo, constância e recordes">
      <Card icon={CalendarDays} tone="today" title="Esta semana">
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="Corrida"
            value={`${formatNumber(summary.runKm, 1)} km`}
            note={summary.plannedRunKm ? `de ${formatNumber(summary.plannedRunKm, 1)} previstos` : undefined}
          />
          <Stat label="Corridas" value={current.runs} />
          <Stat label="Tempo" value={current.seconds > 0 ? formatDuration(current.seconds * 1000) : '0 min'} />
        </div>
        {thisWeek.length > 0 && (
          <div className="mt-2 border-t border-line">
            <AgendaItems items={thisWeek} today={today} />
          </div>
        )}
      </Card>

      <Card icon={TrendingUp} tone="today" title="Volume por semana">
        <div className="mb-2">
          <Segmented label="Período" value={span} onChange={setSpan} options={SPANS} />
        </div>
        <WeeklyKmChart weeks={weeks} />
      </Card>

      <Card icon={Gauge} tone="today" title="Ritmo médio por semana">
        {recentPace !== undefined && (
          <p className="mb-2 text-sm text-ink-2">
            <span className="text-lg font-semibold text-ink tabular-nums">{formatPace(recentPace)}/km</span> nas últimas 4 semanas
            {beforePace !== undefined &&
              ` · ${recentPace < beforePace ? 'mais rápido' : 'mais lento'} que as 4 antes (${formatPace(beforePace)}/km)`}
          </p>
        )}
        <WeeklyPaceChart weeks={weeks} />
      </Card>

      <Card icon={CalendarCheck} tone="today" title="Constância">
        <div className="mb-3 grid grid-cols-3 gap-3">
          <Stat label="Semanas seguidas" value={consistency.stats.weeksInRow} note="treinando" />
          <Stat label="Dias treinados" value={consistency.stats.daysTrained} note="em 26 semanas" />
          <Stat label="Recorde" value={consistency.stats.bestDayStreak} note="dias seguidos" />
        </div>
        <ConsistencyMap map={consistency.map} rowHeight={12} />
      </Card>

      <RecordsBig />
      <RaceBig today={today} inRunning />

      <Card
        icon={Footprints}
        tone="today"
        title="Corridas recentes"
        action={
          <Link to="/treinos/atividades" className="text-sm font-medium text-accent-ink">
            Todas as atividades
          </Link>
        }
      >
        {runs.length === 0 ? (
          <Empty>Nenhuma corrida ainda. Elas chegam com a sincronização do Garmin.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {runs.slice(0, 8).map((run) => (
              <ActivityRow key={run.id} activity={run} today={today} />
            ))}
          </ul>
        )}
      </Card>
    </Page>
  )
}
