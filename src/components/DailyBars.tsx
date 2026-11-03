import { useMemo } from 'react'
import { formatDay, type DayKey } from '../lib/dates'
import { axisStyle, baseOption, Chart, Legend, tooltipRow, useChartTokens, type ChartOption } from './Chart'
import { TableView } from './ui'

/**
 * One bar per day against a goal. A fixed goal is a labeled reference line; a goal
 * that changes by day (training days) is drawn as its own stepped line, with a legend.
 */
export function DailyBars({
  days,
  values,
  goals,
  format,
  axisFormat,
  valueLabel,
  label,
  step,
}: {
  days: DayKey[]
  values: number[]
  goals?: number | (number | undefined)[]
  /** Value with unit, for the tooltip and the table ("2,5 L", "1.850 kcal"). */
  format: (value: number) => string
  axisFormat: (value: number) => string
  /** What a bar is ("de água", "consumidas"). */
  valueLabel: string
  label: string
  /** The axis top rounds up to a multiple of this. */
  step: number
}) {
  const t = useChartTokens()
  const goalPerDay = Array.isArray(goals) ? goals : undefined
  const fixedGoal = typeof goals === 'number' ? goals : undefined

  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t)
    const goalMax = Math.max(fixedGoal ?? 0, ...(goalPerDay ?? []).map((g) => g ?? 0))
    return {
      ...base,
      tooltip: {
        ...(base.tooltip as object),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: t.line, opacity: 0.4 } },
        formatter: (params: unknown) => {
          const index = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0
          const goal = goalPerDay?.[index] ?? fixedGoal
          return (
            `<div style="opacity:.7;margin-bottom:4px">${formatDay(days[index], "EEE, d 'de' MMM")}</div>` +
            tooltipRow(t.series1, format(values[index]), valueLabel, 'dot') +
            (goal === undefined ? '' : tooltipRow(t.ink2, format(goal), 'meta'))
          )
        },
      },
      xAxis: {
        type: 'category',
        data: days.map((day) => formatDay(day, 'd/M')),
        ...axisStyle(t),
        axisLine: { show: true, lineStyle: { color: t.baseline } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        ...axisStyle(t),
        max: (extent: { max: number }) => Math.ceil(Math.max(extent.max, goalMax, step) / step) * step,
        axisLabel: { color: t.muted, fontSize: 11, formatter: axisFormat },
      },
      series: [
        {
          type: 'bar',
          data: values,
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
        ...(goalPerDay
          ? [
              {
                type: 'line',
                data: goalPerDay.map((goal) => goal ?? null),
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
  }, [t, days, values, fixedGoal, goalPerDay, format, axisFormat, valueLabel, step])

  return (
    <>
      {goalPerDay && (
        <Legend
          items={[
            { label: 'Consumido', color: t.series1, kind: 'dot' },
            { label: 'Meta', color: t.ink2, kind: 'line' },
          ]}
        />
      )}
      <Chart option={option} height={200} label={label} />
      <TableView>
        <table className="w-full tabular-nums">
          <tbody>
            {[...days].reverse().map((day, i) => {
              const index = days.length - 1 - i
              const goal = goalPerDay?.[index] ?? fixedGoal
              return (
                <tr key={day} className="border-b border-line last:border-0">
                  <td className="py-1 text-ink-2">{formatDay(day, "EEE, d 'de' MMM")}</td>
                  <td className="py-1 text-right">{format(values[index])}</td>
                  {goal !== undefined && <td className="py-1 pl-3 text-right text-muted">meta {format(goal)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableView>
    </>
  )
}
