import { useMemo } from 'react'
import {
  axisStyle,
  baseOption,
  categoryAxis,
  Chart,
  NoData,
  tooltipNote,
  tooltipRow,
  tooltipTitle,
  useChartTokens,
  type ChartOption,
} from '../../components/Chart'
import { TableView } from '../../components/ui'
import type { Activity } from '../../db/types'
import { formatDuration, formatNumber } from '../../lib/format'
import {
  axisLabel,
  canGoForward,
  chartLabel,
  GRAINS,
  groupByPeriod,
  periodTitle,
  type Bucket,
  type Grain,
  type PeriodWindow,
} from '../../lib/periods'
import { formatPace, isRun } from './running'

/** The run color, read from the page so the chart follows the light or dark scheme. */
function useRunColor(): string {
  const t = useChartTokens()
  return useMemo(() => getComputedStyle(document.documentElement).getPropertyValue('--tone-today').trim() || t.series1, [t])
}

export interface RunPeriod extends Bucket {
  km: number
  runs: number
  /** Running time (the watch's timer). */
  seconds: number
}

/** The running of each period on screen: distance, runs and time added up. */
export function runsByPeriod(periods: PeriodWindow, activities: readonly Activity[]): RunPeriod[] {
  const runs = activities.filter((activity) => !activity.deleted && isRun(activity))
  return groupByPeriod(periods, runs, (run) => run.date).map((group, i) => ({
    ...periods.buckets[i],
    km: Math.round(group.reduce((total, run) => total + (run.distanceM ?? 0), 0) / 100) / 10,
    runs: group.length,
    seconds: group.reduce((total, run) => total + run.timerSec, 0),
  }))
}

/** Seconds per km of a period's running, when it covered enough to mean something: 3 km, or 1 km in a day. */
const periodPace = (period: RunPeriod, grain: Grain): number | undefined =>
  period.km >= (grain === 'day' ? 1 : 3) ? period.seconds / period.km : undefined

const runCount = (count: number) => `${count} ${count === 1 ? 'corrida' : 'corridas'}`

/** Kilometers per period, the one under way stronger, with the average of the periods with running. */
export function RunVolumeChart({ periods, runs }: { periods: PeriodWindow; runs: RunPeriod[] }) {
  const t = useChartTokens()
  const color = useRunColor()
  const { grain, today } = periods
  // The period holding today isn't over: it is the strong bar, and it stays out of the average.
  const current = canGoForward(periods) ? -1 : runs.length - 1
  const ran = runs.filter((period, i) => i !== current && period.km > 0)
  const mean = ran.length > 0 ? ran.reduce((total, period) => total + period.km, 0) / ran.length : undefined
  // Newest first; in the day view only the days with a run.
  const rows = useMemo(() => [...runs].reverse().filter((period) => grain !== 'day' || period.runs > 0), [runs, grain])

  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t)
    return {
      ...base,
      tooltip: {
        ...(base.tooltip as object),
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'shadow', shadowStyle: { color: t.line, opacity: 0.4 } },
        formatter: (params: unknown) => {
          const period = runs[(params as { dataIndex: number }[])[0]?.dataIndex ?? 0]
          const pace = periodPace(period, grain)
          const count = grain === 'day' ? runCount(period.runs) : `total · ${runCount(period.runs)}`
          return (
            tooltipTitle(periodTitle(grain, period.start, today)) +
            (period.runs === 0
              ? tooltipNote('sem corrida')
              : tooltipRow(color, `${formatNumber(period.km, 1)} km`, count, 'dot') +
                tooltipRow(t.ink2, formatDuration(period.seconds * 1000), pace ? `${formatPace(pace)}/km` : ''))
          )
        },
      },
      xAxis: categoryAxis(
        t,
        runs.map((period) => axisLabel(periods, period.start)),
      ),
      yAxis: { type: 'value', ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => `${v} km` } },
      series: [
        {
          type: 'bar',
          data: runs.map((period, i) => ({ value: period.km, itemStyle: { opacity: current < 0 || i === current ? 1 : 0.6 } })),
          barMaxWidth: 22,
          itemStyle: { color, borderRadius: [4, 4, 0, 0] },
          markLine:
            mean === undefined
              ? undefined
              : {
                  symbol: 'none',
                  silent: true,
                  lineStyle: { color: t.ink2, width: 1, type: 'dashed' },
                  label: { formatter: `média ${formatNumber(mean, 1)} km`, position: 'insideEndTop', color: t.ink2, fontSize: 11 },
                  data: [{ yAxis: mean }],
                },
        },
      ],
    }
  }, [t, color, periods, grain, today, runs, current, mean])

  if (!runs.some((period) => period.runs > 0)) return <NoData height={210} />
  return (
    <>
      <Chart option={option} height={210} label={chartLabel('Quilômetros de corrida', periods)} />
      <TableView>
        <table className="w-full tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-normal">{GRAINS.find((option) => option.value === grain)?.label}</th>
              <th className="py-1 text-right font-normal">Km</th>
              <th className="py-1 text-right font-normal">Corridas</th>
              <th className="py-1 text-right font-normal">Ritmo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((period) => {
              const pace = periodPace(period, grain)
              return (
                <tr key={period.start} className="border-t border-line">
                  <td className="py-1">{axisLabel(periods, period.start)}</td>
                  <td className="py-1 text-right">{formatNumber(period.km, 1)}</td>
                  <td className="py-1 text-right">{period.runs}</td>
                  <td className="py-1 text-right">{pace ? `${formatPace(pace)}/km` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableView>
    </>
  )
}

/** The average pace of each period (all its runs together, weighted by distance); faster is higher. */
export function RunPaceChart({ periods, runs }: { periods: PeriodWindow; runs: RunPeriod[] }) {
  const t = useChartTokens()
  const runColor = useRunColor()
  const { grain, today } = periods
  const paces = useMemo(() => runs.map((period) => periodPace(period, grain)), [runs, grain])

  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t)
    return {
      ...base,
      tooltip: {
        ...(base.tooltip as object),
        trigger: 'axis',
        confine: true,
        formatter: (params: unknown) => {
          const index = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0
          const { start, km, runs: count } = runs[index]
          const pace = paces[index]
          return (
            tooltipTitle(periodTitle(grain, start, today)) +
            (pace
              ? tooltipRow(runColor, `${formatPace(pace)}/km`, `${grain === 'day' ? '' : 'média '}em ${formatNumber(km, 1)} km`)
              : tooltipNote(count === 0 ? 'sem corrida' : `pouca distância (${formatNumber(km, 1)} km)`))
          )
        },
      },
      xAxis: categoryAxis(
        t,
        runs.map((period) => axisLabel(periods, period.start)),
      ),
      yAxis: {
        type: 'value',
        inverse: true,
        scale: true,
        ...axisStyle(t),
        axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => formatPace(v) },
      },
      series: [
        {
          type: 'line',
          data: paces.map((pace) => pace ?? null),
          connectNulls: true,
          symbolSize: 6,
          lineStyle: { color: runColor, width: 2 },
          itemStyle: { color: runColor },
        },
      ],
    }
  }, [t, runColor, periods, grain, today, runs, paces])

  if (!paces.some((pace) => pace !== undefined)) return <NoData height={190} />
  return <Chart option={option} height={190} label={chartLabel('Ritmo médio, mais alto é mais rápido', periods)} />
}
