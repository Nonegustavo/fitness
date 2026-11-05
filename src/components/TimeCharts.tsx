import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMemo } from 'react'
import {
  axisStyle,
  baseOption,
  categoryAxis,
  Chart,
  Legend,
  NoData,
  tooltipNote,
  tooltipRow,
  tooltipTitle,
  useChartTokens,
  type ChartOption,
  type ChartTokens,
} from './Chart'
import { parseDay } from '../lib/dates'
import { formatFixed, formatNumber } from '../lib/format'
import { aggregate, aggregateNote, axisLabel, chartLabel, periodTitle, type BucketValue, type PeriodWindow } from '../lib/periods'
import type { DayValue } from '../lib/stats'

interface AxisParam {
  value: [number, number]
}

const toPoint = (point: DayValue): [number, number] => [parseDay(point.date).getTime(), point.value]

/** "82,4 kg", but "18,5%". */
const withUnit = (value: number, digits: number, unit: string): string =>
  unit === '%' ? `${formatFixed(value, digits)}%` : `${formatFixed(value, digits)} ${unit}`

function timeAxis(t: ChartTokens) {
  return {
    type: 'time',
    ...axisStyle(t),
    splitLine: { show: false },
    axisLine: { show: true, lineStyle: { color: t.baseline } },
    axisLabel: {
      color: t.muted,
      fontSize: 11,
      hideOverlap: true,
      formatter: (value: number) => format(value, 'd MMM', { locale: ptBR }),
    },
  }
}

function crosshairTooltip(t: ChartTokens, rows: (items: AxisParam[]) => string): object {
  return {
    ...(baseOption(t).tooltip as object),
    trigger: 'axis',
    // Near the edges of a phone screen, the tooltip would otherwise be cut off.
    confine: true,
    axisPointer: { type: 'line', lineStyle: { color: t.baseline, width: 1 } },
    formatter: (params: unknown) => {
      const items = params as AxisParam[]
      if (items.length === 0) return ''
      const day = format(items[0].value[0], "EEE, d 'de' MMM", { locale: ptBR })
      return `<div style="opacity:.7;margin-bottom:4px">${day}</div>${rows(items)}`
    },
  }
}

/** A series' data, with a gap for each period without a value. */
const seriesData = (points: BucketValue[]) => points.map((point) => point.value ?? null)

/**
 * A reading over time, one point per period: the day's reading, or the period's average (or best). In the day
 * view a `trend` (the weight's smoothed one) is the emphasized line, over the readings as muted dots.
 */
export function PeriodLine({
  periods,
  values: readings,
  how,
  trend,
  unit,
  digits,
  format: show,
  label,
  noun,
  goal,
  height = 200,
}: {
  periods: PeriodWindow
  /** Readings by day. */
  values: readonly DayValue[]
  /** What a longer period's point is: the average of its readings, or the best one. */
  how: 'mean' | 'max'
  /** A smoothed trend over the whole history, drawn in the day view. */
  trend?: readonly DayValue[]
  unit: string
  digits: number
  /** Replaces number + unit, for values like durations. */
  format?: (value: number) => string
  /** The reading's name ("Peso", "HRV"). */
  label: string
  /** How the readings behind a period are counted ("pesagem", "pesagens"); days by default. */
  noun?: readonly [string, string]
  /** A target drawn as a dashed line (the weight goal). */
  goal?: number
  height?: number
}) {
  const t = useChartTokens()
  const { grain, today } = periods
  const points = useMemo(() => aggregate(periods, readings, how), [periods, readings, how])
  // The trend reads day by day; a week's or a month's average is already a smoothing of its own.
  const smooth = useMemo(
    () => (trend && grain === 'day' ? aggregate(periods, trend, 'mean') : undefined),
    [periods, trend, grain],
  )
  const notes = useMemo(() => points.map((point) => aggregateNote(how, grain, point, noun)), [points, how, grain, noun])

  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t)
    const text = (value: number) => (show ? show(value) : withUnit(value, digits, unit))
    // Every reading keeps its dot, smaller as they crowd (ECharts would otherwise drop some at random). Past 100,
    // a lone line reads better, except for the readings under a trend, which are only dots.
    const readingsShown = points.filter((point) => point.value !== undefined).length
    const symbolSize = readingsShown > 100 ? 0 : readingsShown > 40 ? 4 : readingsShown > 20 ? 6 : 8
    const dotSize = readingsShown > 120 ? 3 : readingsShown > 45 ? 5 : 8
    const goalLine = goal !== undefined && {
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: t.ink2, type: 'dashed', width: 1 },
        label: { color: t.ink2, fontSize: 11, position: 'insideStartTop', formatter: `meta ${formatNumber(goal, digits)}` },
        data: [{ yAxis: goal }],
      },
    }
    return {
      ...base,
      tooltip: {
        ...(base.tooltip as object),
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'line', lineStyle: { color: t.baseline, width: 1 } },
        formatter: (params: unknown) => {
          const index = (params as { dataIndex: number }[])[0]?.dataIndex
          if (index === undefined) return ''
          const { start, value } = points[index]
          const trendValue = smooth?.[index].value
          const rows = smooth
            ? (value !== undefined ? tooltipRow(t.muted, text(value), 'registro', 'dot') : '') +
              (trendValue !== undefined ? tooltipRow(t.series1, text(trendValue), 'tendência') : '')
            : value !== undefined
              ? tooltipRow(t.series1, text(value), notes[index] || label)
              : ''
          return tooltipTitle(periodTitle(grain, start, today)) + (rows || tooltipNote('sem registro'))
        },
      },
      xAxis: categoryAxis(
        t,
        points.map((point) => axisLabel(periods, point.start)),
      ),
      yAxis: {
        type: 'value',
        scale: true,
        // Whole-number series (bpm, ms) get whole-number ticks, so no label repeats.
        minInterval: digits === 0 ? 1 : undefined,
        ...axisStyle(t),
        axisLabel: { color: t.muted, fontSize: 11, formatter: (value: number) => (show ? show(value) : formatNumber(value, digits)) },
        // Keep the goal in view even when it's far from the readings.
        ...(goal !== undefined && {
          min: (extent: { min: number }) => Math.floor(Math.min(extent.min, goal) - 0.5),
          max: (extent: { max: number }) => Math.ceil(Math.max(extent.max, goal) + 0.5),
        }),
      },
      series: smooth
        ? [
            {
              // A line series with the line hidden behaves like a scatter but keeps the axis tooltip.
              type: 'line',
              data: seriesData(points),
              symbol: 'circle',
              symbolSize: dotSize,
              showAllSymbol: true,
              lineStyle: { opacity: 0 },
              itemStyle: { color: t.muted, borderColor: t.surface, borderWidth: 2 },
              emphasis: { disabled: true },
              z: 2,
            },
            {
              type: 'line',
              data: seriesData(smooth),
              connectNulls: true,
              showSymbol: false,
              lineStyle: { color: t.series1, width: 2, cap: 'round', join: 'round' },
              itemStyle: { color: t.series1 },
              emphasis: { disabled: true },
              z: 3,
              ...goalLine,
            },
          ]
        : [
            {
              type: 'line',
              data: seriesData(points),
              // Periods without a reading don't break the line (measurements come weeks apart).
              connectNulls: true,
              symbol: 'circle',
              symbolSize,
              showSymbol: symbolSize > 0,
              showAllSymbol: true,
              lineStyle: { color: t.series1, width: 2, cap: 'round', join: 'round' },
              itemStyle: { color: t.series1, borderColor: t.surface, borderWidth: 2 },
              emphasis: { disabled: true },
              ...goalLine,
            },
          ],
    }
  }, [t, periods, grain, today, points, smooth, notes, show, digits, unit, label, goal])

  if (!points.some((point) => point.value !== undefined)) return <NoData height={height} />
  const legend = [
    ...(smooth
      ? [
          { label: 'Registros', color: t.muted, kind: 'dot' as const },
          { label: 'Tendência', color: t.series1, kind: 'line' as const },
        ]
      : goal !== undefined
        ? [{ label: how === 'max' ? 'Melhor' : 'Média', color: t.series1, kind: 'line' as const }]
        : []),
    ...(goal !== undefined ? [{ label: 'Meta', color: t.ink2, kind: 'line' as const }] : []),
  ]
  return (
    <>
      {legend.length > 0 && <Legend items={legend} />}
      <Chart option={option} height={height} label={chartLabel(label, periods)} />
    </>
  )
}

/** A single series over time, every reading on its day (the correlations page). */
export function LineOverTime({
  points,
  unit,
  label,
  digits = 1,
  format,
  axis,
}: {
  points: DayValue[]
  unit: string
  label: string
  digits?: number
  /** Replaces number + unit, for values like durations or times of day. */
  format?: (value: number) => string
  /** Fixed ticks, such as every half hour for times of day. */
  axis?: { min?: number; max?: number; interval?: number }
}) {
  const t = useChartTokens()
  const option = useMemo<ChartOption>(
    () => ({
      ...baseOption(t),
      tooltip: crosshairTooltip(t, (items) =>
        items
          .map((item) => tooltipRow(t.series1, format ? format(item.value[1]) : withUnit(item.value[1], digits, unit), label))
          .join(''),
      ),
      xAxis: timeAxis(t),
      yAxis: {
        type: 'value',
        scale: true,
        // Whole-number series (bpm, ms) get whole-number ticks, so no label repeats.
        minInterval: digits === 0 ? 1 : undefined,
        ...axis,
        ...axisStyle(t),
        axisLabel: { color: t.muted, fontSize: 11, formatter: (value: number) => (format ? format(value) : formatNumber(value, digits)) },
      },
      series: [
        {
          type: 'line',
          data: points.map(toPoint),
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { color: t.series1, width: 2, cap: 'round', join: 'round' },
          itemStyle: { color: t.series1, borderColor: t.surface, borderWidth: 2 },
          emphasis: { disabled: true },
        },
      ],
    }),
    [t, points, unit, label, digits, format, axis],
  )
  return <Chart option={option} height={200} label={`${label} ao longo do tempo`} />
}
