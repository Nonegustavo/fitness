import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMemo } from 'react'
import {
  axisStyle,
  baseOption,
  Chart,
  Legend,
  tooltipRow,
  useChartTokens,
  type ChartOption,
  type ChartTokens,
} from './Chart'
import { parseDay } from '../lib/dates'
import { formatFixed, formatNumber } from '../lib/format'
import type { DayValue } from '../lib/stats'

interface AxisParam {
  seriesIndex: number
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
    axisPointer: { type: 'line', lineStyle: { color: t.baseline, width: 1 } },
    formatter: (params: unknown) => {
      const items = params as AxisParam[]
      if (items.length === 0) return ''
      const day = format(items[0].value[0], "EEE, d 'de' MMM", { locale: ptBR })
      return `<div style="opacity:.7;margin-bottom:4px">${day}</div>${rows(items)}`
    },
  }
}

/** Daily readings as muted dots, the smoothed trend as the one emphasized line. */
export function TrendChart({
  readings,
  trend,
  unit,
  digits,
  label,
}: {
  readings: DayValue[]
  trend: DayValue[]
  unit: string
  digits: number
  label: string
}) {
  const t = useChartTokens()
  const option = useMemo<ChartOption>(
    () => ({
      ...baseOption(t),
      tooltip: crosshairTooltip(t, (items) =>
        items
          .map((item) =>
            item.seriesIndex === 0
              ? tooltipRow(t.muted, withUnit(item.value[1], digits, unit), 'registro', 'dot')
              : tooltipRow(t.series1, withUnit(item.value[1], digits, unit), 'tendência'),
          )
          .join(''),
      ),
      xAxis: timeAxis(t),
      yAxis: {
        type: 'value',
        scale: true,
        ...axisStyle(t),
        axisLabel: { color: t.muted, fontSize: 11, formatter: (value: number) => formatNumber(value, digits) },
      },
      series: [
        {
          // A line series with the line hidden behaves like a scatter but keeps the axis tooltip.
          type: 'line',
          data: readings.map(toPoint),
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { opacity: 0 },
          itemStyle: { color: t.muted, borderColor: t.surface, borderWidth: 2 },
          emphasis: { disabled: true },
          z: 2,
        },
        {
          type: 'line',
          data: trend.map(toPoint),
          showSymbol: false,
          smooth: false,
          lineStyle: { color: t.series1, width: 2, cap: 'round', join: 'round' },
          itemStyle: { color: t.series1 },
          emphasis: { disabled: true },
          z: 3,
        },
      ],
    }),
    [t, readings, trend, unit, digits],
  )

  return (
    <>
      <Legend
        items={[
          { label: 'Registros', color: t.muted, kind: 'dot' },
          { label: 'Tendência', color: t.series1, kind: 'line' },
        ]}
      />
      <Chart option={option} height={220} label={label} />
    </>
  )
}

/** A single series over time (one measurement site, one exercise's best set). */
export function LineOverTime({
  points,
  unit,
  label,
  digits = 1,
}: {
  points: DayValue[]
  unit: string
  label: string
  digits?: number
}) {
  const t = useChartTokens()
  const option = useMemo<ChartOption>(
    () => ({
      ...baseOption(t),
      tooltip: crosshairTooltip(t, (items) =>
        items.map((item) => tooltipRow(t.series1, withUnit(item.value[1], digits, unit), label)).join(''),
      ),
      xAxis: timeAxis(t),
      yAxis: {
        type: 'value',
        scale: true,
        ...axisStyle(t),
        axisLabel: { color: t.muted, fontSize: 11, formatter: (value: number) => formatNumber(value, digits) },
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
    [t, points, unit, label, digits],
  )
  return <Chart option={option} height={200} label={`${label} ao longo do tempo`} />
}
