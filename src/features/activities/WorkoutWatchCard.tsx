import { format } from 'date-fns'
import { ChevronRight, Watch } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { axisStyle, baseOption, Chart, Legend, tooltipRow, useChartTokens, type ChartOption } from '../../components/Chart'
import { Card, Stat } from '../../components/ui'
import type { Activity, ActivityStream, Exercise, WorkoutSession } from '../../db/types'
import { formatDuration } from '../../lib/format'
import { heartRateAt } from './activities'

interface SetMarker {
  time: number
  hr: number
  label: string
}

/** What the watch recorded during a finished workout: totals and heart rate with each set's end marked. */
export function WorkoutWatchCard({
  session,
  activity,
  stream,
  exercises,
}: {
  session: WorkoutSession
  activity: Activity
  stream: ActivityStream | null | undefined
  exercises: Map<string, Exercise>
}) {
  const t = useChartTokens()

  const markers = useMemo(() => {
    const list: SetMarker[] = []
    if (!stream) return list
    for (const exercise of session.exercises) {
      const name = exercises.get(exercise.exerciseId)?.name ?? 'Exercício'
      let normal = 0
      for (const set of exercise.sets) {
        const label = set.kind === 'warmup' ? 'aquecimento' : `série ${++normal}`
        if (!set.done || set.completedAt === undefined) continue
        const hr = heartRateAt(activity, stream, set.completedAt)
        if (hr !== null) list.push({ time: set.completedAt, hr, label: `${name} · ${label}` })
      }
    }
    return list
  }, [session, activity, stream, exercises])

  const option = useMemo<ChartOption | undefined>(() => {
    if (!stream?.hr) return undefined
    const line = stream.hr.map((value, i): [number, number | null] => [activity.startTime + i * stream.step * 1000, value])
    return {
      ...baseOption(t),
      tooltip: {
        ...(baseOption(t).tooltip as object),
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'line', lineStyle: { color: t.baseline, width: 1 } },
        formatter: (params: unknown) => {
          const item = (params as { seriesIndex: number; value: [number, number | null] }[]).find((p) => p.seriesIndex === 0)
          if (!item || item.value[1] === null) return ''
          const near = markers.find((marker) => Math.abs(marker.time - item.value[0]) <= 20_000)
          return (
            `<div style="opacity:.7;margin-bottom:4px">${format(item.value[0], 'HH:mm:ss')}</div>` +
            tooltipRow(t.series1, `${item.value[1]} bpm`, 'frequência cardíaca') +
            (near ? tooltipRow(t.series2, near.label, 'fim da série', 'dot') : '')
          )
        },
      },
      xAxis: {
        type: 'time',
        ...axisStyle(t),
        splitLine: { show: false },
        axisLine: { show: true, lineStyle: { color: t.baseline } },
        axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true, formatter: (value: number) => format(value, 'HH:mm') },
      },
      yAxis: { type: 'value', scale: true, splitNumber: 3, ...axisStyle(t) },
      series: [
        {
          type: 'line',
          data: line,
          showSymbol: false,
          lineStyle: { color: t.series1, width: 1.5, join: 'round' },
          itemStyle: { color: t.series1 },
          emphasis: { disabled: true },
          z: 2,
        },
        {
          type: 'scatter',
          data: markers.map((marker) => [marker.time, marker.hr]),
          symbolSize: 8,
          itemStyle: { color: t.series2, borderColor: t.surface, borderWidth: 2 },
          emphasis: { disabled: true },
          z: 3,
        },
      ],
    }
  }, [t, activity, stream, markers])

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Watch size={16} /> Relógio
        </span>
      }
      action={
        <Link to={`/treinos/atividades/${activity.id}`} className="flex items-center text-sm font-medium text-accent-ink">
          Atividade <ChevronRight size={16} />
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Tempo no relógio" value={formatDuration(activity.elapsedSec * 1000)} />
        <Stat label="FC média" value={activity.avgHr !== undefined ? `${activity.avgHr} bpm` : '—'} />
        <Stat label="FC máxima" value={activity.maxHr !== undefined ? `${activity.maxHr} bpm` : '—'} />
        <Stat label="Calorias" value={activity.calories !== undefined ? `${activity.calories} kcal` : '—'} />
      </div>
      {option && (
        <div className="mt-4">
          <Legend
            items={[
              { label: 'Frequência cardíaca', color: t.series1, kind: 'line' },
              { label: 'Fim de cada série', color: t.series2, kind: 'dot' },
            ]}
          />
          <Chart option={option} height={180} label="Frequência cardíaca durante o treino, com o fim de cada série marcado" />
        </div>
      )}
    </Card>
  )
}
