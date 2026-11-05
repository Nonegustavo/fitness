import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

echarts.use([LineChart, BarChart, ScatterChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer])

export type ChartOption = echarts.EChartsCoreOption

export interface ChartTokens {
  surface: string
  ink: string
  ink2: string
  muted: string
  line: string
  baseline: string
  series1: string
  series2: string
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

const subscribeScheme = (callback: () => void) => {
  darkQuery.addEventListener('change', callback)
  return () => darkQuery.removeEventListener('change', callback)
}

/** The chart colors for the current light/dark scheme, read from the CSS tokens. */
export function useChartTokens(): ChartTokens {
  const dark = useSyncExternalStore(subscribeScheme, () => darkQuery.matches)
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    const token = (name: string) => style.getPropertyValue(name).trim()
    return {
      surface: token('--surface'),
      ink: token('--ink'),
      ink2: token('--ink-2'),
      muted: token('--muted'),
      line: token('--line'),
      baseline: token('--baseline'),
      series1: token('--series-1'),
      series2: token('--series-2'),
    }
    // `dark` is the cache key: the tokens change when the scheme flips.
  }, [dark])
}

/** Shared chrome: recessive hairline grid, muted axis text, surface-colored tooltip. */
export function baseOption(t: ChartTokens): ChartOption {
  return {
    animation: false,
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    grid: { left: 4, right: 12, top: 12, bottom: 4, containLabel: true },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.line,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.ink, fontSize: 13 },
      extraCssText: 'border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);',
    },
  }
}

export function axisStyle(t: ChartTokens) {
  return {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: t.line, width: 1, type: 'solid' as const } },
  }
}

const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Tooltip HTML is a string, so escape anything the user typed (site names, etc.). */
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => escapeMap[c])

/** One tooltip row: line key, value first (strong), label after. */
export function tooltipRow(color: string, value: string, label: string, kind: 'line' | 'dot' = 'line'): string {
  const key =
    kind === 'line'
      ? `<span style="display:inline-block;width:12px;height:2px;border-radius:1px;background:${color};vertical-align:middle;margin-right:8px"></span>`
      : `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};vertical-align:middle;margin:0 10px 0 2px"></span>`
  return `<div style="white-space:nowrap">${key}<strong>${escapeHtml(value)}</strong> <span style="opacity:.7">${escapeHtml(label)}</span></div>`
}

/** The tooltip's first line: the day or period it is about. */
export const tooltipTitle = (text: string): string => `<div style="opacity:.7;margin-bottom:4px">${escapeHtml(text)}</div>`

/** A muted line under the rows ("média de 5 dias", "sem registro"). */
export const tooltipNote = (text: string): string => `<div style="opacity:.7;font-size:12px;margin-top:2px">${escapeHtml(text)}</div>`

/** A category x axis (one slot per day or period) on the baseline, without grid lines. */
export function categoryAxis(t: ChartTokens, labels: string[]) {
  return {
    type: 'category',
    data: labels,
    ...axisStyle(t),
    axisLine: { show: true, lineStyle: { color: t.baseline } },
    splitLine: { show: false },
  }
}

export function Chart({
  option,
  height = 220,
  label,
  group,
}: {
  option: ChartOption
  height?: number
  label: string
  /** Charts in the same group move their crosshairs together. */
  group?: string
}) {
  const element = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const instance = echarts.init(element.current!)
    chart.current = instance
    if (group) {
      instance.group = group
      echarts.connect(group)
    }
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(element.current!)
    return () => {
      observer.disconnect()
      instance.dispose()
      chart.current = null
    }
    // The group is read once: a chart keeps the one it was created with.
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={element} role="img" aria-label={label} style={{ height }} className="w-full" />
}

/** A chart's place while its period has nothing to draw, so the card keeps its size. */
export function NoData({ height }: { height: number }) {
  return (
    <p className="flex items-center justify-center text-center text-sm text-muted" style={{ height }}>
      Nada registrado nesse período.
    </p>
  )
}

/** Legend for two or more series: the colored key carries identity, the text stays in ink. */
export function Legend({ items }: { items: { label: string; color: string; kind: 'line' | 'dot' }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          {item.kind === 'line' ? (
            <span className="h-0.5 w-3 rounded-full" style={{ background: item.color }} />
          ) : (
            <span className="size-2 rounded-full" style={{ background: item.color }} />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  )
}
