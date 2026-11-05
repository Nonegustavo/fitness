import { useMemo } from 'react'
import type { DayKey } from '../lib/dates'
import { aggregate, aggregateNote, axisLabel, chartLabel, periodGoals, periodTitle, type PeriodWindow } from '../lib/periods'
import type { DayValue } from '../lib/stats'
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
} from './Chart'
import { TableView } from './ui'

const HEIGHT = 200

/**
 * One bar per period against a goal: a day's value, or a longer period's average (or total). A fixed goal is
 * a labeled reference line; a goal that changes by day (training days) is drawn as its own stepped line.
 */
export function PeriodBars({
  periods,
  values,
  how,
  goal,
  unfinished,
  format,
  axisFormat,
  valueLabel = '',
  noun,
  legend = 'Registrado',
  label,
  step,
}: {
  periods: PeriodWindow
  /** Values by day; several on a day add up ('perDay', 'sum') or average ('mean'). */
  values: readonly DayValue[]
  /** What a longer period's bar is: the average per day with data, the average of the values, or their total. */
  how: 'perDay' | 'mean' | 'sum'
  /** A fixed goal, or each day's goal (a period's is their average over its days with data). */
  goal?: number | readonly DayValue[]
  /** A day still under way (today): its bar shows in the day view, but longer periods leave it out of their averages. */
  unfinished?: DayKey
  /** Value with unit, for the tooltip and the table ("2,5 L", "1.850 kcal"). */
  format: (value: number) => string
  axisFormat: (value: number) => string
  /** What a bar is ("de água", "consumidas"). */
  valueLabel?: string
  /** How the days or entries behind a period are counted ("noite", "noites"); days by default. */
  noun?: readonly [string, string]
  /** The bars' name next to "Meta", when the goal changes by day. */
  legend?: string
  /** What the chart shows, for screen readers ("Água bebida"). */
  label: string
  /** The axis top rounds up to a multiple of this. */
  step: number
}) {
  const t = useChartTokens()
  const { grain, today } = periods
  const counted = useMemo(
    () => (unfinished && grain !== 'day' ? values.filter((value) => value.date !== unfinished) : values),
    [values, unfinished, grain],
  )
  const points = useMemo(() => aggregate(periods, counted, how), [periods, counted, how])
  const notes = useMemo(() => points.map((point) => aggregateNote(how, grain, point, noun)), [points, how, grain, noun])
  const fixedGoal = typeof goal === 'number' ? goal : undefined
  const goals = useMemo(
    () =>
      goal === undefined || typeof goal === 'number'
        ? undefined
        : periodGoals(periods, goal, new Set(counted.map((value) => value.date))),
    [periods, goal, counted],
  )
  // Newest first, only the periods with data.
  const rows = useMemo(() => points.flatMap((point, i) => (point.value === undefined ? [] : [i])).reverse(), [points])

  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t)
    const goalMax = Math.max(fixedGoal ?? 0, ...(goals ?? []).map((g) => g ?? 0))
    return {
      ...base,
      tooltip: {
        ...(base.tooltip as object),
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'shadow', shadowStyle: { color: t.line, opacity: 0.4 } },
        formatter: (params: unknown) => {
          const index = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0
          const point = points[index]
          const target = goals?.[index] ?? fixedGoal
          return (
            tooltipTitle(periodTitle(grain, point.start, today)) +
            (point.value === undefined
              ? tooltipNote('sem registro')
              : tooltipRow(t.series1, format(point.value), valueLabel, 'dot') + (notes[index] ? tooltipNote(notes[index]) : '')) +
            (target === undefined ? '' : tooltipRow(t.ink2, format(target), 'meta'))
          )
        },
      },
      xAxis: categoryAxis(
        t,
        points.map((point) => axisLabel(periods, point.start)),
      ),
      yAxis: {
        type: 'value',
        ...axisStyle(t),
        max: (extent: { max: number }) =>
          Math.ceil(Math.max(Number.isFinite(extent.max) ? extent.max : 0, goalMax, step) / step) * step,
        axisLabel: { color: t.muted, fontSize: 11, formatter: axisFormat },
      },
      series: [
        {
          type: 'bar',
          data: points.map((point) => point.value ?? null),
          barMaxWidth: 24,
          itemStyle: { color: t.series1, borderRadius: [4, 4, 0, 0] },
          emphasis: { itemStyle: { opacity: 0.8 } },
          markLine:
            fixedGoal === undefined
              ? undefined
              : {
                  symbol: 'none',
                  silent: true,
                  lineStyle: { color: t.ink2, width: 1, type: 'solid' },
                  label: { formatter: 'Meta', position: 'insideEndTop', color: t.ink2, fontSize: 11 },
                  data: [{ yAxis: fixedGoal }],
                },
        },
        ...(goals
          ? [
              {
                type: 'line',
                data: goals.map((g) => g ?? null),
                step: 'middle',
                showSymbol: false,
                lineStyle: { color: t.ink2, width: 1.5 },
                itemStyle: { color: t.ink2 },
                emphasis: { disabled: true },
              },
            ]
          : []),
      ],
    }
  }, [t, periods, grain, today, points, notes, goals, fixedGoal, format, axisFormat, valueLabel, step])

  if (rows.length === 0) return <NoData height={HEIGHT} />
  return (
    <>
      {goals && (
        <Legend
          items={[
            { label: legend, color: t.series1, kind: 'dot' },
            { label: 'Meta', color: t.ink2, kind: 'line' },
          ]}
        />
      )}
      <Chart option={option} height={HEIGHT} label={chartLabel(label, periods)} />
      <TableView>
        <table className="w-full tabular-nums">
          <tbody>
            {rows.map((i) => {
              const point = points[i]
              const target = goals?.[i] ?? fixedGoal
              return (
                <tr key={point.start} className="border-b border-line last:border-0">
                  <td className="py-1 text-ink-2">
                    {periodTitle(grain, point.start, today)}
                    {notes[i] && <span className="block text-xs text-muted">{notes[i]}</span>}
                  </td>
                  <td className="py-1 text-right">{format(point.value!)}</td>
                  {target !== undefined && <td className="py-1 pl-3 text-right text-muted">meta {format(target)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableView>
    </>
  )
}
