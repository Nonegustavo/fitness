import { useMemo } from 'react'
import { axisStyle, baseOption, Chart, escapeHtml, useChartTokens, type ChartOption } from '../../components/Chart'
import { formatDay } from '../../lib/dates'
import type { Point } from './analysis'
import { formatMetric, metricAxis, type Metric } from './metrics'
import { linearFit, mean } from './stats'

/** A fixed sideways offset per day, so the dots of a group spread out and stay put between renders. */
function jitter(day: string): number {
  let hash = 0
  for (const char of day) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return ((Math.abs(hash) % 1000) / 1000 - 0.5) * 0.5
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function tooltip(t: ReturnType<typeof useChartTokens>, lines: (params: { value: [number, number, string] }) => string[]) {
  return {
    ...(baseOption(t).tooltip as object),
    trigger: 'item',
    confine: true,
    formatter: (params: unknown) => {
      const item = params as { value: [number, number, string] }
      if (!item.value?.[2]) return ''
      return lines(item)
        .map((line, i) => `<div${i === 0 ? ' style="opacity:.7;margin-bottom:4px"' : ''}>${escapeHtml(line)}</div>`)
        .join('')
    },
  }
}

/** Days with and without something, one dot per day, with each group's average as a bar. */
export function GroupsChart({ x, y, points }: { x: Metric; y: Metric; points: Point[] }) {
  const t = useChartTokens()
  const option = useMemo<ChartOption>(() => {
    const data = points.map((point) => [(point.x > 0 ? 1 : 0) + jitter(point.day), point.y, point.day])
    const groupMean = (group: 0 | 1) => {
      const values = points.filter((point) => (point.x > 0 ? 1 : 0) === group).map((point) => point.y)
      return values.length ? mean(values) : undefined
    }
    const meanBar = (group: 0 | 1) => {
      const value = groupMean(group)
      return {
        type: 'line',
        data: value === undefined ? [] : [[group - 0.32, value], [group + 0.32, value]],
        showSymbol: false,
        silent: true,
        lineStyle: { color: t.ink, width: 2.5 },
        z: 3,
      }
    }
    return {
      ...baseOption(t),
      grid: { left: 4, right: 12, top: 12, bottom: 4, containLabel: true },
      tooltip: tooltip(t, ({ value }) => [formatDay(value[2], "EEE, d 'de' MMM"), `${y.label}: ${formatMetric(y, value[1])}`]),
      xAxis: {
        type: 'value',
        min: -0.5,
        max: 1.5,
        ...axisStyle(t),
        splitLine: { show: false },
        axisLine: { show: true, lineStyle: { color: t.baseline } },
        axisTick: { show: false },
        axisLabel: {
          color: t.ink2,
          fontSize: 12,
          customValues: [0, 1],
          formatter: (value: number) => (value === 0 ? 'Outros dias' : capitalize(x.phrase ?? x.label)),
        },
      },
      yAxis: {
        type: 'value',
        scale: true,
        ...metricAxis(y, points.map((point) => point.y)),
        ...axisStyle(t),
        axisLabel: { color: t.muted, fontSize: 11, formatter: (value: number) => formatMetric(y, value) },
      },
      series: [
        {
          type: 'scatter',
          data,
          symbolSize: 8,
          itemStyle: { color: t.series1, opacity: 0.55 },
          emphasis: { itemStyle: { opacity: 1 } },
        },
        meanBar(0),
        meanBar(1),
      ],
    }
  }, [t, x, y, points])
  return <Chart option={option} height={240} label={`${y.label} nos dias com e sem ${x.label}, um ponto por dia`} />
}

/** One dot per day, x against y, with the straight line that fits them best. */
export function TrendChart({ x, y, points }: { x: Metric; y: Metric; points: Point[] }) {
  const t = useChartTokens()
  const option = useMemo<ChartOption>(() => {
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const { slope, intercept } = linearFit(xs, ys)
    const lo = Math.min(...xs)
    const hi = Math.max(...xs)
    return {
      ...baseOption(t),
      grid: { left: 4, right: 16, top: 12, bottom: 4, containLabel: true },
      tooltip: tooltip(t, ({ value }) => [
        formatDay(value[2], "EEE, d 'de' MMM"),
        `${x.label}: ${formatMetric(x, value[0])}`,
        `${y.label}: ${formatMetric(y, value[1])}`,
      ]),
      xAxis: {
        type: 'value',
        scale: true,
        ...metricAxis(x, xs),
        ...axisStyle(t),
        splitLine: { show: false },
        axisLine: { show: true, lineStyle: { color: t.baseline } },
        axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true, formatter: (value: number) => formatMetric(x, value) },
      },
      yAxis: {
        type: 'value',
        scale: true,
        ...metricAxis(y, ys),
        ...axisStyle(t),
        axisLabel: { color: t.muted, fontSize: 11, formatter: (value: number) => formatMetric(y, value) },
      },
      series: [
        {
          type: 'scatter',
          data: points.map((point) => [point.x, point.y, point.day]),
          symbolSize: 8,
          itemStyle: { color: t.series1, opacity: 0.55 },
          emphasis: { itemStyle: { opacity: 1 } },
        },
        {
          type: 'line',
          data: [
            [lo, intercept + slope * lo],
            [hi, intercept + slope * hi],
          ],
          showSymbol: false,
          silent: true,
          lineStyle: { color: t.ink, width: 2, type: 'dashed' },
          z: 3,
        },
      ],
    }
  }, [t, x, y, points])
  return <Chart option={option} height={260} label={`${y.label} conforme ${x.label}, um ponto por dia`} />
}
