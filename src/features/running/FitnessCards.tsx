import { HeartPulse, Timer } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { axisStyle, baseOption, categoryAxis, Chart, tooltipNote, tooltipRow, tooltipTitle, useChartTokens, type ChartOption } from '../../components/Chart'
import { Card, Empty, Stat, TableView } from '../../components/ui'
import { formatDay } from '../../lib/dates'
import { formatClock, formatFixed } from '../../lib/format'
import { distanceLabel, type Effort, type MonthVdot, type RunFitness } from './predict'
import { predicted } from './RacePrediction'
import { formatPace } from './running'

const activityLink = (id: string) => `/treinos/atividades/${id}`

/** "10 km em 42:00 (30/10)", to the run it came from. */
function EffortLink({ effort }: { effort: Effort }) {
  return (
    <Link to={activityLink(effort.activityId)} className="font-medium text-accent-ink">
      {distanceLabel(effort.meters)} em {formatClock(effort.seconds)} ({formatDay(effort.date, 'd/MM')})
    </Link>
  )
}

/** 5 km, 10 km, half and full marathon by Riegel's formula, from the longest reliable stretch of the last 90 days. */
export function PredictionsCard({ fitness }: { fitness: RunFitness }) {
  const { reference, predictions } = fitness
  return (
    <Card icon={Timer} tone="analysis" title="Previsões de prova">
      {!reference ? (
        <Empty>Nenhuma corrida ao ar livre de 3 km ou mais nos últimos 90 dias para prever.</Empty>
      ) : (
        <>
          {/* Four across when the card itself is wide enough, not the window: on a computer it may be one of two columns. */}
          <div className="@container">
            <div className="grid grid-cols-2 gap-3 @md:grid-cols-4">
              {predictions.map((prediction) => (
                <Stat
                  key={prediction.label}
                  label={prediction.label}
                  value={<span className="tabular-nums">{predicted(prediction.seconds)}</span>}
                  note={`${formatPace(prediction.seconds / (prediction.meters / 1000))}/km`}
                />
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            Pela fórmula de Riegel, a partir do seu melhor trecho longo e forte dos últimos 90 dias: <EffortLink effort={reference} />.
            Quanto mais longe dessa distância, menos precisa; supõe preparo para a prova.
          </p>
        </>
      )}
    </Card>
  )
}

const HEIGHT = 170

/** The best VDOT of each month, as a line. */
function VdotChart({ months }: { months: MonthVdot[] }) {
  const t = useChartTokens()
  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t)
    return {
      ...base,
      tooltip: {
        ...(base.tooltip as object),
        trigger: 'axis',
        confine: true,
        formatter: (params: unknown) => {
          const { month, best } = months[(params as { dataIndex: number }[])[0]?.dataIndex ?? 0]
          return (
            tooltipTitle(formatDay(month, 'MMMM yyyy')) +
            (best
              ? tooltipRow(t.series1, formatFixed(best.vdot, 1), `${distanceLabel(best.meters)} em ${formatClock(best.seconds)}`)
              : tooltipNote('sem corrida de 3 km ou mais'))
          )
        },
      },
      xAxis: categoryAxis(
        t,
        months.map((item) => formatDay(item.month, 'MMM')),
      ),
      yAxis: { type: 'value', scale: true, ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => formatFixed(v, 0) } },
      series: [
        {
          type: 'line',
          data: months.map((item) => (item.best ? Number(item.best.vdot.toFixed(1)) : null)),
          connectNulls: true,
          symbolSize: 6,
          lineStyle: { color: t.series1, width: 2 },
          itemStyle: { color: t.series1 },
        },
      ],
    }
  }, [t, months])
  return <Chart option={option} height={HEIGHT} label="VO2max estimado (VDOT), o melhor de cada mês nos últimos 12 meses" />
}

/** Daniels' VDOT from the best stretch of 3 km or more of the last 90 days, and month by month. */
export function VdotCard({ fitness, months }: { fitness: RunFitness; months: MonthVdot[] }) {
  const { best } = fitness
  const shown = months.filter((item) => item.best)
  if (!best && shown.length === 0) return null
  return (
    <Card icon={HeartPulse} tone="analysis" title="VO2max estimado (VDOT)">
      {best ? (
        <>
          <p className="text-4xl leading-none font-semibold tabular-nums">
            {formatFixed(best.vdot, 1)}
            <span className="ml-1.5 text-base font-normal text-ink-2">ml/kg/min</span>
          </p>
          <p className="mt-1 text-sm text-ink-2">
            Do melhor trecho de 3 km ou mais nos últimos 90 dias: <EffortLink effort={best} />
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-2">Nenhuma corrida de 3 km ou mais nos últimos 90 dias.</p>
      )}
      {shown.length >= 2 && (
        <div className="mt-3">
          <VdotChart months={months} />
          <TableView>
            <table className="w-full tabular-nums">
              <tbody>
                {[...shown].reverse().map(({ month, best: effort }) => (
                  <tr key={month} className="border-b border-line last:border-0">
                    <td className="py-1 text-ink-2">{formatDay(month, 'MMM yyyy')}</td>
                    <td className="py-1 text-right font-medium">{formatFixed(effort!.vdot, 1)}</td>
                    <td className="py-1 pl-3 text-right text-muted">
                      {distanceLabel(effort!.meters)} em {formatClock(effort!.seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableView>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        Uma estimativa pela fórmula de Daniels e Gilbert, do ritmo dos seus melhores trechos, não uma medida de laboratório
        nem o VO2max do relógio. Meses só com treinos leves aparecem mais baixos.
      </p>
    </Card>
  )
}
