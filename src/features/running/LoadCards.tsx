import { useLiveQuery } from 'dexie-react-hooks'
import { ChartSpline, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { MiniBars } from '../../components/MiniCharts'
import { toneColor } from '../../components/tone'
import { Card, SkeletonCard } from '../../components/ui'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { ActivityStream } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { formatFixed, formatNumber, formatSigned } from '../../lib/format'
import { Note, SmallCard, TileSkeleton, Value } from '../today/tiles'
import {
  ACWR_FLAGS,
  ACWR_SHORT,
  dailyLoads,
  FORM_ZONES,
  loadSeries,
  loadStatus,
  needsSamples,
  weekBlocks,
  type LoadDay,
  type LoadStatus,
} from './load'

const RUN = toneColor('today')

/** Each day's training load, from every activity with a heart rate; undefined while loading. */
export function useDailyLoads(): Map<DayKey, number> | undefined {
  return useLiveQuery(async () => {
    const activities = alive(await db.activities.toArray())
    // Only the few activities without the watch's zones need their samples.
    const missing = activities.filter(needsSamples)
    const streams = missing.length > 0 ? await db.activityStreams.bulkGet(missing.map((activity) => activity.id)) : []
    const byId = new Map(
      streams.filter((stream): stream is ActivityStream => !!stream && !stream.deleted).map((stream) => [stream.id, stream]),
    )
    return dailyLoads(activities, byId)
  })
}

export interface TrainingLoad {
  /** Every day from the first with a load up to today. */
  series: LoadDay[]
  /** Today's numbers; undefined before any load. */
  status?: LoadStatus
}

/** The load series up to today and today's numbers; undefined while loading. */
export function useTrainingLoad(today: DayKey): TrainingLoad | undefined {
  const loads = useDailyLoads()
  return useMemo(() => {
    if (!loads) return undefined
    const series = loadSeries(loads, today)
    return { series, status: loadStatus(series) }
  }, [loads, today])
}

/** A whole number for the loads and the averages. */
export const loadNumber = (value: number) => formatNumber(value, 0)

/** "−12", "+4": the form, rounded. */
export const formNumber = (value: number) => formatSigned(Math.round(value), 0)

/** The text with its first letter up, to open a sentence. */
export const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Why there's no ratio yet: under 4 weeks of history, or no load in them. */
const noRatio = (series: LoadDay[]) => (series.length < 28 ? 'histórico curto para o ACWR' : 'sem carga nas últimas 4 semanas')

const blocksLabel = 'Carga de cada uma das últimas 8 semanas (blocos de 7 dias até hoje); a linha é a média semanal das últimas 4'

export function TrainingLoadBig({ today }: { today: DayKey }) {
  const load = useTrainingLoad(today)
  if (!load) return <SkeletonCard lines={4} />
  const { series, status } = load
  if (!status) return null
  return (
    <Card
      icon={ChartSpline}
      tone="today"
      title="Carga de treino"
      action={
        <Link to="/corrida" className="text-sm font-medium text-accent-ink">
          Corrida
        </Link>
      }
    >
      {status.acwr !== undefined && status.flag ? (
        <>
          <p className="text-4xl leading-none font-semibold tabular-nums">
            {formatFixed(status.acwr, 2)}
            <span className="ml-1.5 text-base font-normal text-ink-2">ACWR</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-2">
            {status.flag === 'spike' && <TriangleAlert size={15} aria-hidden className="shrink-0 text-critical" />}
            {sentence(ACWR_FLAGS[status.flag])}
          </p>
        </>
      ) : (
        <>
          <p className="text-4xl leading-none font-semibold tabular-nums">
            {loadNumber(status.acute)}
            <span className="ml-1.5 text-base font-normal text-ink-2">de carga em 7 dias</span>
          </p>
          <p className="mt-1 text-sm text-ink-2">{sentence(noRatio(series))}</p>
        </>
      )}
      <div className="mt-3">
        <MiniBars values={weekBlocks(series, 8)} marker={status.chronic} color={RUN} label={blocksLabel} />
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>8 semanas atrás</span>
          <span>últimos 7 dias</span>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        Condicionamento {loadNumber(status.ctl)} · fadiga {loadNumber(status.atl)} · forma {formNumber(status.tsb)}
        {status.zone && ` (${FORM_ZONES[status.zone].label.toLowerCase()})`}
      </p>
    </Card>
  )
}

export function TrainingLoadSmall({ today }: { today: DayKey }) {
  const load = useTrainingLoad(today)
  if (!load) return <TileSkeleton />
  const { series, status } = load
  if (!status) return null
  return (
    <SmallCard icon={ChartSpline} tone="today" label="Carga de treino" to="/corrida">
      {status.acwr !== undefined && status.flag ? (
        <>
          <Value value={formatFixed(status.acwr, 2)} unit="ACWR" />
          <Note>{ACWR_SHORT[status.flag]}</Note>
        </>
      ) : (
        <>
          <Value value={loadNumber(status.acute)} unit="em 7 dias" />
          <Note>{noRatio(series)}</Note>
        </>
      )}
      <MiniBars values={weekBlocks(series, 8)} marker={status.chronic} color={RUN} label={blocksLabel} className="mt-1.5 h-5" />
    </SmallCard>
  )
}
