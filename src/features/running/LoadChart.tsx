import { ChartSpline } from 'lucide-react'
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
} from '../../components/Chart'
import { PeriodControl, usePeriod } from '../../components/PeriodControl'
import { Card, SkeletonCard, Stat, TableView } from '../../components/ui'
import type { DayKey } from '../../lib/dates'
import { formatFixed } from '../../lib/format'
import { axisLabel, chartLabel, GRAINS, periodTitle, type PeriodWindow } from '../../lib/periods'
import { ACWR_SENTENCES, ACWR_SHORT, FORM_ZONES, loadByPeriod, type LoadDay, type LoadStatus } from './load'
import { formNumber, loadNumber, sentence, useTrainingLoad } from './LoadCards'

const HEIGHT = 220

/** Fitness and fatigue as lines and form as bars, where each period ends; one axis, as they share a unit. */
function LoadFormChart({ periods, series }: { periods: PeriodWindow; series: LoadDay[] }) {
  const t = useChartTokens()
  const { grain, today } = periods
  const points = useMemo(() => loadByPeriod(periods, series), [periods, series])
  // Newest first, only the periods the series reaches.
  const rows = useMemo(() => points.flatMap((point, i) => (point.day ? [i] : [])).reverse(), [points])
  const form = t.muted

  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t)
    const line = (color: string, pick: (day: LoadDay) => number) => ({
      type: 'line',
      data: points.map((point) => (point.day ? Math.round(pick(point.day)) : null)),
      showSymbol: points.length <= 31,
      symbolSize: 5,
      lineStyle: { color, width: 2 },
      itemStyle: { color },
    })
    return {
      ...base,
      tooltip: {
        ...(base.tooltip as object),
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'shadow', shadowStyle: { color: t.line, opacity: 0.4 } },
        formatter: (params: unknown) => {
          const point = points[(params as { dataIndex: number }[])[0]?.dataIndex ?? 0]
          const title = tooltipTitle(periodTitle(grain, point.start, today))
          if (!point.day) return title + tooltipNote('antes do primeiro treino com FC')
          const { ctl, atl, tsb } = point.day
          return (
            title +
            tooltipRow(t.series1, loadNumber(ctl), 'condicionamento (CTL)') +
            tooltipRow(t.series2, loadNumber(atl), 'fadiga (ATL)') +
            tooltipRow(form, formNumber(tsb), 'forma (TSB)', 'dot') +
            tooltipNote(grain === 'day' ? `carga do dia ${loadNumber(point.load)}` : `no fim do período · carga ${loadNumber(point.load)}`)
          )
        },
      },
      xAxis: categoryAxis(
        t,
        points.map((point) => axisLabel(periods, point.start)),
      ),
      yAxis: { type: 'value', ...axisStyle(t) },
      series: [
        {
          type: 'bar',
          data: points.map((point) => {
            if (!point.day) return null
            const value = Math.round(point.day.tsb)
            // The rounded end is the one away from zero, below it for a negative form.
            return { value, itemStyle: { borderRadius: value >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] } }
          }),
          barMaxWidth: 14,
          itemStyle: { color: form, opacity: 0.5 },
        },
        line(t.series1, (day) => day.ctl),
        line(t.series2, (day) => day.atl),
      ],
    }
  }, [t, form, periods, grain, today, points])

  if (rows.length === 0) return <NoData height={HEIGHT} />
  return (
    <>
      <Legend
        items={[
          { label: 'Condicionamento (CTL)', color: t.series1, kind: 'line' },
          { label: 'Fadiga (ATL)', color: t.series2, kind: 'line' },
          { label: 'Forma (TSB)', color: form, kind: 'dot' },
        ]}
      />
      <Chart option={option} height={HEIGHT} label={chartLabel('Condicionamento, fadiga e forma', periods)} />
      <TableView>
        <table className="w-full tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-normal">{GRAINS.find((option) => option.value === grain)?.label}</th>
              <th className="py-1 text-right font-normal">CTL</th>
              <th className="py-1 text-right font-normal">ATL</th>
              <th className="py-1 text-right font-normal">TSB</th>
              <th className="py-1 text-right font-normal">Carga</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const { start, day, load } = points[i]
              return (
                <tr key={start} className="border-t border-line">
                  <td className="py-1">{axisLabel(periods, start)}</td>
                  <td className="py-1 text-right">{loadNumber(day!.ctl)}</td>
                  <td className="py-1 text-right">{loadNumber(day!.atl)}</td>
                  <td className="py-1 text-right">{formNumber(day!.tsb)}</td>
                  <td className="py-1 text-right">{loadNumber(load)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableView>
    </>
  )
}

/** Today's form and load in a sentence. */
function todayText({ zone, flag }: LoadStatus): string {
  if (zone && flag) return `${sentence(FORM_ZONES[zone].text)}; ${ACWR_SENTENCES[flag]}.`
  if (zone) return `${sentence(FORM_ZONES[zone].text)}.`
  if (flag) return `${sentence(ACWR_SENTENCES[flag])}.`
  return 'Ainda há pouco histórico para ler a forma e a carga.'
}

/**
 * Training load and form, as in Runalyze and intervals.icu: today's fitness, fatigue, form and ratio of the
 * last week to the usual, and how they went in the period picked (the last 12 weeks to begin with).
 */
export function LoadFormCard({ today }: { today: DayKey }) {
  const load = useTrainingLoad(today)
  const period = usePeriod('carga', { grain: 'week', earliest: load?.series[0]?.date })
  if (!load) return <SkeletonCard lines={6} />
  const { series, status } = load
  if (!status) return null
  return (
    <Card icon={ChartSpline} tone="today" title="Carga e forma">
      {/* Four across when the card itself is wide enough, not the window: on a computer it may be one of two columns. */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-4">
          <Stat label="Condicionamento" value={loadNumber(status.ctl)} note="CTL, média de 42 dias" />
          <Stat label="Fadiga" value={loadNumber(status.atl)} note="ATL, média de 7 dias" />
          <Stat label="Forma" value={formNumber(status.tsb)} note={status.zone ? FORM_ZONES[status.zone].label : 'TSB'} />
          <Stat
            label="ACWR"
            value={status.acwr !== undefined ? formatFixed(status.acwr, 2) : '—'}
            note={status.flag ? ACWR_SHORT[status.flag] : '7 dias ÷ 4 semanas'}
          />
        </div>
      </div>
      <p className="mt-3 mb-3 text-sm text-ink-2">{todayText(status)}</p>
      <PeriodControl period={period} />
      <LoadFormChart periods={period.window} series={series} />
      <p className="mt-2 text-xs text-muted">
        Carga: minutos em cada zona de FC × o número da zona (TRIMP de Edwards), de todo treino do relógio com FC.
        Condicionamento e fadiga são médias da carga diária de 42 e 7 dias, e a forma é a diferença. ACWR: os últimos 7
        dias contra a média semanal de 4 semanas; acima de 1,5, mais risco de lesão.
      </p>
    </Card>
  )
}
