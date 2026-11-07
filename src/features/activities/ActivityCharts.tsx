import { useCallback, useMemo, useState } from 'react'
import { axisStyle, baseOption, Chart, tooltipRow, useChartTokens, type ChartOption } from '../../components/Chart'
import { Segmented } from '../../components/ui'
import type { Activity, ActivityLap, ActivityStream } from '../../db/types'
import { formatClock, formatFixed, formatNumber } from '../../lib/format'
import { formatDistance, formatSpeed, paceSeconds, speedKind } from './activities'

type XAxis = 'time' | 'distance'

interface Series {
  key: string
  label: string
  values: (number | null)[]
  format: (value: number) => string
  /** Summary shown next to the title, from the watch's own totals. */
  summary?: string
  /** Pace: smaller is faster, so the axis runs upside down. */
  inverse?: boolean
  /** Trim GPS spikes and stops from the axis range. */
  robust?: boolean
}

/** The 2nd and 98th percentiles, so a few spikes don't flatten the line. */
function robustRange(values: (number | null)[]): [number, number] | undefined {
  const sorted = values.filter((v): v is number => v !== null).sort((a, b) => a - b)
  if (sorted.length < 10) return undefined
  const low = sorted[Math.floor(sorted.length * 0.02)]
  const high = sorted[Math.ceil(sorted.length * 0.98) - 1]
  const pad = (high - low) * 0.08 || 1
  return [low - pad, high + pad]
}

export function StreamCharts({ activity, stream }: { activity: Activity; stream: ActivityStream }) {
  const t = useChartTokens()
  const hasDistance = (activity.distanceM ?? 0) > 0 && stream.distance !== undefined
  const [axis, setAxis] = useState<XAxis>('time')
  const kind = speedKind(activity)
  const foot = kind === 'pace'

  const series = useMemo(() => {
    const list: Series[] = []
    if (stream.hr) {
      list.push({
        key: 'hr',
        label: 'Frequência cardíaca',
        values: stream.hr,
        format: (v) => `${Math.round(v)} bpm`,
        summary: activity.avgHr !== undefined ? `média ${activity.avgHr} · máx ${activity.maxHr ?? '—'} bpm` : undefined,
      })
    }
    if (stream.speed && hasDistance) {
      const avg = activity.avgSpeed ? formatSpeed(activity.avgSpeed, kind) : undefined
      list.push(
        kind === 'speed'
          ? {
              key: 'speed',
              label: 'Velocidade',
              values: stream.speed.map((v) => (v === null ? null : v * 3.6)),
              format: (v) => `${formatFixed(v, 1)} km/h`,
              summary: avg && `média ${avg}`,
              robust: true,
            }
          : {
              key: 'pace',
              label: 'Ritmo',
              values: stream.speed.map((v) => (v === null ? null : paceSeconds(v, kind))),
              format: (v) => `${formatClock(v)} ${kind === 'swim' ? '/100 m' : '/km'}`,
              summary: avg && `média ${avg}`,
              inverse: true,
              robust: true,
            },
      )
    }
    if (stream.altitude) {
      list.push({
        key: 'altitude',
        label: 'Altitude',
        values: stream.altitude,
        format: (v) => `${formatNumber(v, 0)} m`,
        summary: activity.ascentM !== undefined ? `subida ${activity.ascentM} m` : undefined,
      })
    }
    if (stream.cadence) {
      list.push({
        key: 'cadence',
        label: 'Cadência',
        values: stream.cadence,
        format: (v) => `${Math.round(v)} ${foot ? 'passos/min' : 'rpm'}`,
        summary: activity.avgCadence !== undefined ? `média ${activity.avgCadence}` : undefined,
        robust: true,
      })
    }
    if (stream.power) {
      list.push({
        key: 'power',
        label: 'Potência',
        values: stream.power,
        format: (v) => `${Math.round(v)} W`,
        summary: activity.avgPower !== undefined ? `média ${activity.avgPower} W` : undefined,
      })
    }
    return list
  }, [activity, stream, kind, foot, hasDistance])

  // x per sample: seconds from the start, or meters covered.
  const xs = useMemo(
    () => (axis === 'distance' && stream.distance ? stream.distance : (stream.hr ?? stream.speed ?? stream.altitude ?? []).map((_, i) => i * stream.step)),
    [axis, stream],
  )
  const formatX = useCallback((x: number) => (axis === 'distance' ? formatDistance(x) : formatClock(x)), [axis])
  const axisLabel = useCallback(
    (x: number) => (axis === 'distance' ? `${formatNumber(x / 1000, 1)} km` : formatClock(x)),
    [axis],
  )
  const xMax = xs.reduce<number>((max, x) => (x !== null && x > max ? x : max), 0)

  if (series.length === 0) return <p className="text-sm text-muted">Este arquivo não tem dados de sensores.</p>

  return (
    <div className="space-y-4">
      {hasDistance && (
        <Segmented
          label="Eixo dos gráficos"
          value={axis}
          options={[
            { value: 'time', label: 'Tempo' },
            { value: 'distance', label: 'Distância' },
          ]}
          onChange={setAxis}
        />
      )}
      {series.map((s) => (
        <SeriesChart
          key={`${s.key}-${axis}`}
          series={s}
          xs={xs}
          xMax={xMax}
          formatX={formatX}
          axisLabel={axisLabel}
          color={t.series1}
        />
      ))}
    </div>
  )
}

function SeriesChart({
  series,
  xs,
  xMax,
  formatX,
  axisLabel,
  color,
}: {
  series: Series
  xs: (number | null)[]
  xMax: number
  /** x in the tooltip ("5,23 km", "12:40"). */
  formatX: (x: number) => string
  /** x under the axis, shorter ("5 km"). */
  axisLabel: (x: number) => string
  color: string
}) {
  const t = useChartTokens()
  const option = useMemo<ChartOption>(() => {
    const data: [number, number | null][] = []
    series.values.forEach((value, i) => {
      const x = xs[i]
      if (x !== null && x !== undefined) data.push([x, value])
    })
    const range = series.robust ? robustRange(series.values) : undefined
    return {
      ...baseOption(t),
      grid: { left: 4, right: 12, top: 8, bottom: 4, containLabel: true },
      tooltip: {
        ...(baseOption(t).tooltip as object),
        trigger: 'axis',
        // The charts move together, so every one shows a tooltip at once: keep each inside its chart.
        confine: true,
        axisPointer: { type: 'line', lineStyle: { color: t.baseline, width: 1 } },
        formatter: (params: unknown) => {
          const [item] = params as { value: [number, number | null] }[]
          if (!item || item.value[1] === null) return ''
          return `<div style="opacity:.7;margin-bottom:4px">${formatX(item.value[0])}</div>${tooltipRow(color, series.format(item.value[1]), series.label)}`
        },
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: xMax,
        ...axisStyle(t),
        splitLine: { show: false },
        axisLine: { show: true, lineStyle: { color: t.baseline } },
        axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true, formatter: axisLabel },
      },
      yAxis: {
        type: 'value',
        scale: true,
        inverse: series.inverse,
        min: range?.[0],
        max: range?.[1],
        splitNumber: 3,
        ...axisStyle(t),
        axisLabel: {
          color: t.muted,
          fontSize: 11,
          formatter: (v: number) => (series.inverse ? formatClock(v) : formatNumber(v, 0)),
        },
      },
      series: [
        {
          type: 'line',
          data,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { color, width: 1.5, join: 'round' },
          itemStyle: { color },
          emphasis: { disabled: true },
        },
      ],
    }
  }, [t, series, xs, xMax, formatX, axisLabel, color])

  return (
    <div>
      <p className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="font-medium">{series.label}</span>
        {series.summary && <span className="text-xs text-ink-2">{series.summary}</span>}
      </p>
      <Chart option={option} height={140} label={`${series.label} ao longo da atividade`} group="activity" />
    </div>
  )
}

/** Time in each heart rate zone, as a bar list with the time and share at each bar's tip. */
export function HeartRateZones({ zones }: { zones: { seconds: number[]; limits: number[] } }) {
  const total = zones.seconds.reduce((sum, s) => sum + s, 0)
  if (total === 0) return <p className="text-sm text-muted">Sem frequência cardíaca nesta atividade.</p>
  const rows = [5, 4, 3, 2, 1].map((zone) => ({
    label: `Zona ${zone}`,
    range: `${zones.limits[zone - 1] + 1}–${zones.limits[zone]} bpm`,
    seconds: zones.seconds[zone] ?? 0,
  }))
  if (zones.seconds[0] > 0) rows.push({ label: 'Abaixo', range: `até ${zones.limits[0]} bpm`, seconds: zones.seconds[0] })
  const max = Math.max(...rows.map((row) => row.seconds))
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-sm">
          <span className="min-w-0">
            <span className="block">{row.label}</span>
            <span className="block text-xs text-muted">{row.range}</span>
          </span>
          <span className="flex items-center gap-2">
            {row.seconds > 0 && (
              <span
                className="block h-3 rounded-r-[4px] bg-series-1"
                style={{ width: `calc((100% - 7.5rem) * ${row.seconds / max})` }}
              />
            )}
            <span className="whitespace-nowrap tabular-nums">
              {formatClock(row.seconds)} <span className="text-muted">· {Math.round((row.seconds / total) * 100)}%</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function LapsTable({ activity }: { activity: Activity }) {
  const kind = speedKind(activity)
  const hasDistance = activity.laps.some((lap) => (lap.distanceM ?? 0) > 0)
  const hasHr = activity.laps.some((lap) => lap.avgHr !== undefined)
  const speed = (lap: ActivityLap) =>
    lap.avgSpeed && (lap.distanceM ?? 0) > 0 ? formatSpeed(lap.avgSpeed, kind) : '—'
  return (
    <div className="scroll-fade-x relative -mx-4 overflow-x-auto px-4">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs whitespace-nowrap text-muted">
            <th className="py-1 pr-3 font-normal">Volta</th>
            <th className="py-1 pr-3 font-normal">Tempo</th>
            {hasDistance && <th className="py-1 pr-3 font-normal">Distância</th>}
            {hasDistance && <th className="py-1 pr-3 font-normal">{kind === 'speed' ? 'Velocidade' : 'Ritmo'}</th>}
            {hasHr && <th className="py-1 pr-3 font-normal">FC méd.</th>}
            {hasHr && <th className="py-1 font-normal">FC máx.</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {activity.laps.map((lap, i) => (
            <tr key={lap.startTime}>
              <td className="py-1.5 pr-3">{i + 1}</td>
              <td className="py-1.5 pr-3">{formatClock(lap.timerSec)}</td>
              {hasDistance && <td className="py-1.5 pr-3 whitespace-nowrap">{lap.distanceM ? formatDistance(lap.distanceM) : '—'}</td>}
              {hasDistance && <td className="py-1.5 pr-3 whitespace-nowrap">{speed(lap)}</td>}
              {hasHr && <td className="py-1.5 pr-3">{lap.avgHr ?? '—'}</td>}
              {hasHr && <td className="py-1.5">{lap.maxHr ?? '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
