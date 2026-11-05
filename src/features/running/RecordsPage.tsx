import { useLiveQuery } from 'dexie-react-hooks'
import { Trophy } from 'lucide-react'
import { Link } from 'react-router'
import { Card, Empty, Page, SkeletonCard } from '../../components/ui'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { ActivityStream } from '../../db/types'
import { formatDay } from '../../lib/dates'
import { formatClock, formatNumber } from '../../lib/format'
import { effortsByDistance, formatPace, isOutdoorRun, longestRuns } from './running'

/** The runs and their samples, ranked: the best times of each distance and the longest runs. */
function useRanking() {
  return useLiveQuery(async () => {
    const runs = alive(await db.activities.toArray()).filter(isOutdoorRun)
    const streams = await db.activityStreams.bulkGet(runs.map((run) => run.id))
    const byId = new Map(streams.filter((stream): stream is ActivityStream => stream !== undefined).map((stream) => [stream.id, stream]))
    return { distances: effortsByDistance(runs, byId, 5), longest: longestRuns(runs, 5), runs: runs.length }
  })
}

const activityLink = (id: string) => `/treinos/atividades/${id}`

/** The personal records of the runs: each distance's five best times, and the longest runs. */
export default function RecordsPage() {
  const ranking = useRanking()
  return (
    <Page
      title="Recordes"
      icon={Trophy}
      tone="analysis"
      back={{ to: '/corrida', label: 'Corrida' }}
      subtitle="Os melhores trechos das suas corridas ao ar livre"
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
