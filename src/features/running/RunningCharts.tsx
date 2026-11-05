import { useMemo } from 'react'
import { axisStyle, baseOption, Chart, tooltipRow, useChartTokens, type ChartOption } from '../../components/Chart'
import { TableView } from '../../components/ui'
import { formatDay } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
import { formatPace, weekPace, type WeekVolume } from './running'

/** The run color, read from the page so the chart follows the light or dark scheme. */
function useRunColor(): string {
  const t = useChartTokens()
  return useMemo(() => getComputedStyle(document.documentElement).getPropertyValue('--tone-today').trim() || t.series1, [t])
}

const weekLabel = (week: WeekVolume) => formatDay(week.week, 'd/MM')

/** Kilometers per week, the current one stronger, with the average of the weeks with running. */
export function WeeklyKmChart({ weeks }: { weeks: WeekVolume[] }) {
  const t = useChartTokens()
  const color = useRunColor()
  const ran = weeks.slice(0, -1).filter((week) => week.km > 0)
  const mean = ran.length > 0 ? ran.reduce((total, week) => total + week.km, 0) / ran.length : undefined

  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t)
    return {
      ...base,
      tooltip: {
        ...(base.tooltip as object),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: t.line, opacity: 0.4 } },
        formatter: (params: unknown) => {
          const week = weeks[(params as { dataIndex: number }[])[0]?.dataIndex ?? 0]
          const pace = weekPace(week)
          return (
            `<div style="opacity:.7;margin-bottom:4px">Semana de ${formatDay(week.week, "d 'de' MMM")}</div>` +
            tooltipRow(color, `${formatNumber(week.km, 1)} km`, `${week.runs} ${week.runs === 1 ? 'corrida' : 'corridas'}`, 'dot') +
            (week.seconds > 0 ? tooltipRow(t.ink2, formatDuration(week.seconds * 1000), pace ? `${formatPace(pace)}/km` : '') : '')
          )
        },
      },
      xAxis: {
        type: 'category',
        data: weeks.map(weekLabel),
        ...axisStyle(t),
        axisLine: { show: true, lineStyle: { color: t.baseline } },
        splitLine: { show: false },
      },
      yAxis: { type: 'value', ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => `${v} km` } },
      series: [
        {
          type: 'bar',
          data: weeks.map((week, i) => ({ value: week.km, itemStyle: { opacity: i === weeks.length - 1 ? 1 : 0.6 } })),
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
  }, [t, color, weeks, mean])

  return (
    <>
      <Chart option={option} height={210} label={`Quilômetros de corrida por semana nas últimas ${weeks.length} semanas`} />
      <TableView>
        <table className="w-full tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-normal">Semana</th>
              <th className="py-1 text-right font-normal">Km</th>
              <th className="py-1 text-right font-normal">Corridas</th>
              <th className="py-1 text-right font-normal">Ritmo</th>
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((week) => {
              const pace = weekPace(week)
              return (
                <tr key={week.week} className="border-t border-line">
                  <td className="py-1">{weekLabel(week)}</td>
                  <td className="py-1 text-right">{formatNumber(week.km, 1)}</td>
                  <td className="py-1 text-right">{week.runs}</td>
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

/** The average pace of each week (all its runs together); faster is higher. */
export function WeeklyPaceChart({ weeks }: { weeks: WeekVolume[] }) {
  const t = useChartTokens()
  const runColor = useRunColor()
  const paces = weeks.map(weekPace)

  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t)
    return {
      ...base,
      tooltip: {
        ...(base.tooltip as object),
        trigger: 'axis',
        formatter: (params: unknown) => {
          const index = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0
          const pace = paces[index]
          return (
            `<div style="opacity:.7;margin-bottom:4px">Semana de ${formatDay(weeks[index].week, "d 'de' MMM")}</div>` +
            (pace ? tooltipRow(runColor, `${formatPace(pace)}/km`, `em ${formatNumber(weeks[index].km, 1)} km`) : 'sem corrida')
          )
        },
      },
      xAxis: {
        type: 'category',
        data: weeks.map(weekLabel),
        ...axisStyle(t),
        axisLine: { show: true, lineStyle: { color: t.baseline } },
        splitLine: { show: false },
      },
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
  }, [t, runColor, weeks, paces])

  return <Chart option={option} height={190} label={`Ritmo médio por semana nas últimas ${weeks.length} semanas; mais alto é mais rápido`} />
}
