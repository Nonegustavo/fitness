import { Flame } from 'lucide-react'
import { useMemo } from 'react'
import { axisStyle, baseOption, Chart, Legend, tooltipRow, useChartTokens, type ChartOption } from '../../components/Chart'
import { Card, cx, Empty, Page, SkeletonCard, Stat } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { dayRange, formatDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { useFoodLogs } from '../food/nutrition'
import { useDailyHealth } from './recovery'

const DAYS = 30

const average = (values: number[]) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined)

interface DayEnergy {
  day: DayKey
  total?: number
  active?: number
  /** Eaten, from the food log (only on days with something logged). */
  eaten?: number
}

/** The colors Garmin uses for this: red for active, blue for at rest; the food color for what was eaten. */
function useColors() {
  const t = useChartTokens()
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
    return { t, active: token('--tone-recovery', t.series2), rest: t.series1, eaten: token('--tone-food', t.ink2) }
  }, [t])
}

function EnergyChart({ days }: { days: DayEnergy[] }) {
  const { t, active, rest, eaten } = useColors()
  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t)
    return {
      ...base,
      tooltip: {
        ...(base.tooltip as object),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: t.line, opacity: 0.4 } },
        formatter: (params: unknown) => {
          const day = days[(params as { dataIndex: number }[])[0]?.dataIndex ?? 0]
          return (
            `<div style="opacity:.7;margin-bottom:4px">${formatDay(day.day, "EEE, d 'de' MMM")}</div>` +
            (day.total !== undefined ? tooltipRow(t.ink, `${formatNumber(day.total, 0)} kcal`, 'gastas') : '') +
            (day.active !== undefined ? tooltipRow(active, formatNumber(day.active, 0), 'ativas', 'dot') : '') +
            (day.total !== undefined ? tooltipRow(rest, formatNumber(day.total - (day.active ?? 0), 0), 'em repouso', 'dot') : '') +
            (day.eaten !== undefined ? tooltipRow(eaten, `${formatNumber(day.eaten, 0)} kcal`, 'comidas') : '')
          )
        },
      },
      xAxis: {
        type: 'category',
        data: days.map((day) => formatDay(day.day, 'd/M')),
        ...axisStyle(t),
        axisLine: { show: true, lineStyle: { color: t.baseline } },
        splitLine: { show: false },
      },
      yAxis: { type: 'value', ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 11 } },
      series: [
        {
          name: 'Repouso',
          type: 'bar',
          stack: 'gasto',
          data: days.map((day) => (day.total !== undefined ? day.total - (day.active ?? 0) : null)),
          barMaxWidth: 18,
          itemStyle: { color: rest },
        },
        {
          name: 'Ativas',
          type: 'bar',
          stack: 'gasto',
          data: days.map((day) => day.active ?? null),
          barMaxWidth: 18,
          itemStyle: { color: active, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: 'Comido',
          type: 'line',
          data: days.map((day) => day.eaten ?? null),
          connectNulls: false,
          symbolSize: 5,
          lineStyle: { color: eaten, width: 2 },
          itemStyle: { color: eaten },
        },
      ],
    }
  }, [t, active, rest, eaten, days])

  return (
    <>
      <Legend
        items={[
          { label: 'Em repouso', color: rest, kind: 'dot' },
          { label: 'Ativas', color: active, kind: 'dot' },
          { label: 'Comido', color: eaten, kind: 'line' },
        ]}
      />
      <Chart option={option} height={220} label={`Calorias gastas e comidas por dia nos últimos ${DAYS} dias`} />
    </>
  )
}

/** The energy the watch counts each day, active and at rest, next to what the food log says was eaten. */
export default function CaloriesPage() {
  const today = useToday()
  const from = shiftDay(today, -(DAYS - 1))
  const rows = useDailyHealth(from, today)
  const logs = useFoodLogs(from, today)

  const days = useMemo<DayEnergy[] | undefined>(() => {
    if (!rows || !logs) return undefined
    const byDay = new Map(rows.map((row) => [row.id, row]))
    const eaten = new Map<DayKey, number>()
    for (const log of logs) eaten.set(log.date, (eaten.get(log.date) ?? 0) + log.nutrients.kcal)
    return dayRange(from, today).map((day) => ({
      day,
      total: byDay.get(day)?.calories?.total,
      active: byDay.get(day)?.calories?.active,
      eaten: eaten.get(day),
    }))
  }, [rows, logs, from, today])

  if (!days) {
    return (
      <Page title="Calorias gastas" icon={Flame} tone="training">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={6} />
      </Page>
    )
  }

  const withTotal = days.filter((day) => day.total !== undefined)
  const finished = withTotal.filter((day) => day.day !== today)
  const todays = days.at(-1)!
  const week = average(finished.slice(-7).map((day) => day.total!))
  const month = average(finished.map((day) => day.total!))
  const activeMonth = average(finished.filter((day) => day.active !== undefined).map((day) => day.active!))
  const listed = [...days].reverse().filter((day) => day.total !== undefined || day.eaten !== undefined)

  return (
    <Page title="Calorias gastas" icon={Flame} tone="training" subtitle="Do relógio, até a última sincronização do Garmin">
      {withTotal.length === 0 ? (
        <Card>
          <Empty>Nenhum dia com calorias do relógio ainda. Elas chegam com a sincronização do Garmin.</Empty>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="Hoje"
                value={todays.total !== undefined ? formatNumber(todays.total, 0) : '—'}
                note={todays.active !== undefined ? `${formatNumber(todays.active, 0)} ativas` : 'até a sincronização'}
              />
              <Stat label="Média de 7 dias" value={week !== undefined ? formatNumber(week, 0) : '—'} />
              <Stat label={`Média de ${DAYS} dias`} value={month !== undefined ? formatNumber(month, 0) : '—'} />
              <Stat label="Ativas por dia" value={activeMonth !== undefined ? formatNumber(activeMonth, 0) : '—'} note={`média de ${DAYS} dias`} />
            </div>
          </Card>

          <Card title={`Últimos ${DAYS} dias`}>
            <EnergyChart days={days} />
          </Card>

          <Card title="Dia a dia">
            <p className="mb-1 text-xs text-muted">Gastas pelo relógio, comidas pelo registro de alimentação e o saldo (comido − gasto).</p>
            <ul className="divide-y divide-line">
              {listed.map((day) => {
                const balance = day.total !== undefined && day.eaten !== undefined ? day.eaten - day.total : undefined
                return (
                  <li key={day.day} className="flex items-baseline gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 text-ink-2 first-letter:uppercase">
                      {day.day === today ? 'hoje' : formatDay(day.day, "EEE, d 'de' MMM")}
                    </span>
                    <span className="w-16 text-right font-medium tabular-nums">
                      {day.total !== undefined ? formatNumber(day.total, 0) : '—'}
                    </span>
                    <span className="w-16 text-right text-ink-2 tabular-nums">{day.eaten !== undefined ? formatNumber(day.eaten, 0) : '—'}</span>
                    <span className={cx('w-14 text-right text-xs tabular-nums', balance === undefined ? 'text-muted' : 'text-ink-2')}>
                      {balance === undefined ? '' : `${balance > 0 ? '+' : balance < 0 ? '−' : ''}${formatNumber(Math.abs(balance), 0)}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>
        </>
      )}
    </Page>
  )
}
