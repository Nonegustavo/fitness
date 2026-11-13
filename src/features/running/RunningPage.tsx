import { CalendarCheck, CalendarDays, Gauge, SportShoe, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { PeriodControl, usePeriod } from '../../components/PeriodControl'
import { Card, Columns, Empty, Page, SkeletonCard, Stack, Stat } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { shiftDay, weekStart } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
import { useActivities } from '../activities/activities'
import { ActivityRow } from '../activities/components'
import { CoachReportButton } from '../activities/CoachReport'
import { GearLink, GearWarnings } from '../gear/GearWarning'
import { weekSummary } from '../calendar/agenda'
import { AgendaItems } from '../calendar/components'
import { useAgenda } from '../calendar/plans'
import { RaceBig } from '../today/bigCards'
import { LoadFormCard } from './LoadChart'
import { ConsistencyMap, RecordsBig, useConsistency } from './RunningCards'
import { RunPaceChart, runsByPeriod, RunVolumeChart } from './RunningCharts'
import { formatPace, isRun, pooledPace, weeklyVolume } from './running'

/** Running in detail: this week, volume and pace week by week, consistency, records, the next race and the latest runs. */
export default function RunningPage() {
  const today = useToday()
  const activities = useActivities()
  const from = weekStart(today)
  const agenda = useAgenda(from, shiftDay(from, 6), today)
  const consistency = useConsistency(today, 26)
  // This week and the pace of the last 4 weeks against the 4 before; the charts follow the period picked.
  const weeks = useMemo(() => activities && weeklyVolume(activities, today, 8), [activities, today])
  const firstRun = useMemo(() => activities?.findLast(isRun)?.date, [activities])
  const period = usePeriod('corrida', { grain: 'week', earliest: firstRun })
  const runPeriods = useMemo(() => runsByPeriod(period.window, activities ?? []), [period.window, activities])

  if (!activities || !weeks || !agenda || !consistency) {
    return (
      <Page title="Corrida" icon={SportShoe} tone="today" wide>
        <Columns>
          <Stack>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={6} />
          </Stack>
          {/* The right column's place on a wide screen; the phone shows the two cards above, as before. */}
          <Stack className="max-xl:hidden">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </Stack>
        </Columns>
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
    <Page title="Corrida" icon={SportShoe} tone="today" subtitle="Volume, ritmo, constância e recordes" wide>
      <Columns>
        <Stack>
          <Card icon={CalendarDays} tone="today" title="Esta semana" action={<GearLink />}>
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
            <GearWarnings />
            <CoachReportButton today={today} />
          </Card>

          {/* The period picked in Volume drives the pace chart too: the two stay in the same column. */}
          <Card icon={TrendingUp} tone="today" title="Volume">
            <PeriodControl period={period} />
            <RunVolumeChart periods={period.window} runs={runPeriods} />
          </Card>

          <Card icon={Gauge} tone="today" title="Ritmo médio">
            {recentPace !== undefined && (
              <p className="mb-2 text-sm text-ink-2">
                <span className="text-lg font-semibold text-ink tabular-nums">{formatPace(recentPace)}/km</span> nas últimas 4 semanas
                {beforePace !== undefined &&
                  ` · ${recentPace < beforePace ? 'mais rápido' : 'mais lento'} que as 4 antes (${formatPace(beforePace)}/km)`}
              </p>
            )}
            <RunPaceChart periods={period.window} runs={runPeriods} />
          </Card>

          <LoadFormCard today={today} />
        </Stack>

        <Stack>
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
            icon={SportShoe}
            tone="today"
            title="Corridas recentes"
            action={
              <Link to="/treinos/atividades" className="text-sm font-medium text-accent-ink">
                Todas as atividades
              </Link>
            }
          >
            {runs.length === 0 ? (
              <>
                <Empty>Nenhuma corrida ainda.</Empty>
                <p className="text-sm text-ink-2">
                  Elas chegam com a sincronização do Garmin.{' '}
                  <Link to="/ajustes?secao=garmin" className="font-medium text-accent-ink underline underline-offset-2">
                    Ligar em Ajustes
                  </Link>
                </p>
              </>
            ) : (
              <ul className="divide-y divide-line">
                {runs.slice(0, 8).map((run) => (
                  <ActivityRow key={run.id} activity={run} today={today} />
                ))}
              </ul>
            )}
          </Card>
        </Stack>
      </Columns>
    </Page>
  )
}
