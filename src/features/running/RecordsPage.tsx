import { Trophy } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { Card, Empty, Page, SkeletonCard } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { formatDay, type DayKey } from '../../lib/dates'
import { formatClock, formatNumber } from '../../lib/format'
import { shiftPeriod } from '../../lib/periods'
import { useActivities } from '../activities/activities'
import { useRunEfforts } from './efforts'
import { PredictionsCard, VdotCard } from './FitnessCards'
import { fitnessOf, monthlyVdot, runEfforts } from './predict'
import { effortsByDistance, formatPace, isOutdoorRun, longestRuns } from './running'

/**
 * The runs ranked by their best stretches (from the cache, no samples read): the best times of each
 * distance and the longest runs; and from the last 12 months, the race predictions and the VDOT.
 */
function useRanking(today: DayKey) {
  const activities = useActivities()
  const cached = useRunEfforts()
  return useMemo(() => {
    if (!activities || !cached) return undefined
    const runs = activities.filter(isOutdoorRun)
    const since = shiftPeriod('month', today, -11)
    const efforts = runEfforts(runs.filter((run) => run.date >= since), cached.lookup)
    return {
      distances: effortsByDistance(runs, cached.lookup, 5),
      longest: longestRuns(runs, 5),
      runs: runs.length,
      fitness: fitnessOf(efforts, today),
      months: monthlyVdot(efforts, today, 12),
    }
  }, [activities, cached, today])
}

const activityLink = (id: string) => `/treinos/atividades/${id}`

/** The race predictions and the VDOT, then the personal records: each distance's five best times, and the longest runs. */
export default function RecordsPage() {
  const today = useToday()
  const ranking = useRanking(today)
  return (
    <Page
      title="Recordes"
      icon={Trophy}
      tone="analysis"
      back={{ to: '/corrida', label: 'Corrida' }}
      subtitle="Previsões e os melhores trechos das suas corridas ao ar livre"
    >
      {!ranking ? (
        <>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </>
      ) : ranking.distances.length === 0 && ranking.longest.length === 0 ? (
        <Card>
          <Empty>Nenhuma corrida ao ar livre com os dados do relógio ainda.</Empty>
        </Card>
      ) : (
        <>
          <PredictionsCard fitness={ranking.fitness} />
          <VdotCard fitness={ranking.fitness} months={ranking.months} />

          {ranking.distances.map(({ meters, label, efforts: [best, ...others] }) => (
            <Card key={label} icon={Trophy} tone="analysis" title={label}>
              <Link to={activityLink(best.activityId)} className="block hover:text-accent-ink">
                <p className="text-4xl leading-none font-semibold tabular-nums">{formatClock(best.seconds)}</p>
                <p className="mt-1 text-sm text-ink-2">
                  {formatPace(best.seconds / (meters / 1000))}/km · {formatDay(best.date, "d 'de' MMMM 'de' yyyy")}
                </p>
              </Link>
              {others.length > 0 && (
                <ol start={2} className="mt-3 divide-y divide-line border-t border-line">
                  {others.map((effort, i) => (
                    <li key={effort.activityId}>
                      <Link to={activityLink(effort.activityId)} className="flex items-baseline gap-3 py-1.5 text-sm hover:text-accent-ink">
                        <span className="w-5 text-muted tabular-nums">{i + 2}º</span>
                        <span className="flex-1 font-medium tabular-nums">{formatClock(effort.seconds)}</span>
                        <span className="text-xs text-muted tabular-nums">
                          {formatPace(effort.seconds / (meters / 1000))}/km · {formatDay(effort.date, 'd/MM/yy')}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ))}

          {ranking.longest.length > 0 && (
            <Card icon={Trophy} tone="analysis" title="Corridas mais longas">
              <ol className="divide-y divide-line">
                {ranking.longest.map((run, i) => (
                  <li key={run.activityId}>
                    <Link to={activityLink(run.activityId)} className="flex items-baseline gap-3 py-1.5 text-sm hover:text-accent-ink">
                      <span className="w-5 text-muted tabular-nums">{i + 1}º</span>
                      <span className="flex-1 font-medium tabular-nums">{formatNumber(run.km, 1)} km</span>
                      <span className="text-xs text-muted tabular-nums">
                        {formatClock(run.seconds)} · {formatDay(run.date, 'd/MM/yy')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <p className="text-xs text-muted">
            Calculados dos dados de distância e tempo que o relógio grava em {ranking.runs}{' '}
            {ranking.runs === 1 ? 'corrida' : 'corridas'} ao ar livre (a API pessoal do Garmin não traz os recordes). Podem
            diferir alguns segundos dos que o relógio mostra. Esteira e corrida indoor ficam de fora.
          </p>
        </>
      )}
    </Page>
  )
}
