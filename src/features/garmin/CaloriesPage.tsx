import { Flame } from 'lucide-react'
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
import { PeriodControl, useFirstDay, usePeriod } from '../../components/PeriodControl'
import { Card, cx, Empty, Page, SkeletonCard, SkeletonLines, Stat } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { db } from '../../db/schema'
import type { DailyHealth, FoodLog } from '../../db/types'
import { dayKey, dayRange, formatDay, formatTime, relativeDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { aggregate, axisLabel, chartLabel, countLabel, periodTitle, type Bucket, type PeriodWindow } from '../../lib/periods'
import type { DayValue } from '../../lib/stats'
import { useWeights } from '../body/body'
import { useFoodLogs } from '../food/nutrition'
import { forecastDay, restingEstimate, type Forecast, type RestingSource } from './forecast'
import { useDailyHealth } from './recovery'
import { useGarminState } from './sync'

const DAYS = 30

const average = (values: number[]) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined)

interface DayEnergy {
  day: DayKey
  total?: number
  active?: number
  /** Eaten, from the food log (only on days with something logged). */
  eaten?: number
}

/** A period's energy per day: the day's own, or a longer period's average over its days with data. */
interface PeriodEnergy extends Bucket {
  total?: number
  active?: number
  eaten?: number
  /** Days with the watch's calories and days with food logged. */
  days: number
  eatenDays: number
}

const hasCalories = (day: DailyHealth) => day.calories?.total !== undefined

function energyByPeriod(periods: PeriodWindow, rows: DailyHealth[], logs: FoodLog[], today: DayKey): PeriodEnergy[] {
  // Today isn't over: the averages of longer periods leave it out.
  const counts = (day: DayKey) => periods.grain === 'day' || day !== today
  const totals: DayValue[] = []
  const actives: DayValue[] = []
  for (const row of rows) {
    const total = row.calories?.total
    if (total === undefined || !counts(row.id)) continue
    totals.push({ date: row.id, value: total })
    const active = row.calories?.active
    if (active !== undefined) actives.push({ date: row.id, value: active })
  }
  const eaten = logs.filter((log) => counts(log.date)).map((log) => ({ date: log.date, value: log.nutrients.kcal }))
  const total = aggregate(periods, totals, 'perDay')
  const active = aggregate(periods, actives, 'perDay')
  const food = aggregate(periods, eaten, 'perDay')
  return periods.buckets.map((bucket, i) => ({
    ...bucket,
    total: total[i].value,
    active: active[i].value,
    eaten: food[i].value,
    days: total[i].days,
    eatenDays: food[i].days,
  }))
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

function EnergyChart({ periods, energy }: { periods: PeriodWindow; energy: PeriodEnergy[] }) {
  const { t, active, rest, eaten } = useColors()
  const { grain, today } = periods
  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t)
    const kcal = (value: number) => `${formatNumber(value, 0)} kcal`
    return {
      ...base,
      tooltip: {
        ...(base.tooltip as object),
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'shadow', shadowStyle: { color: t.line, opacity: 0.4 } },
        formatter: (params: unknown) => {
          const period = energy[(params as { dataIndex: number }[])[0]?.dataIndex ?? 0]
          const rows =
            (period.total !== undefined ? tooltipRow(t.ink, kcal(period.total), 'gastas') : '') +
            (period.active !== undefined ? tooltipRow(active, formatNumber(period.active, 0), 'ativas', 'dot') : '') +
            (period.total !== undefined ? tooltipRow(rest, formatNumber(period.total - (period.active ?? 0), 0), 'em repouso', 'dot') : '') +
            (period.eaten !== undefined ? tooltipRow(eaten, kcal(period.eaten), 'comidas') : '')
          const counts = [
            period.days > 0 && `${countLabel('day', period.days)} do relógio`,
            period.eatenDays > 0 && `${period.eatenDays} com registro`,
          ].filter(Boolean)
          const note = grain === 'day' ? '' : tooltipNote(`média por dia · ${counts.join(', ')}`)
          return tooltipTitle(periodTitle(grain, period.start, today)) + (rows ? rows + note : tooltipNote('sem registro'))
        },
      },
      xAxis: categoryAxis(
        t,
        energy.map((period) => axisLabel(periods, period.start)),
      ),
      yAxis: { type: 'value', ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => formatNumber(v, 0) } },
      series: [
        {
          name: 'Repouso',
          type: 'bar',
          stack: 'gasto',
          data: energy.map((period) => (period.total !== undefined ? period.total - (period.active ?? 0) : null)),
          barMaxWidth: 18,
          itemStyle: { color: rest },
        },
        {
          name: 'Ativas',
          type: 'bar',
          stack: 'gasto',
          data: energy.map((period) => period.active ?? null),
          barMaxWidth: 18,
          itemStyle: { color: active, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: 'Comido',
          type: 'line',
          data: energy.map((period) => period.eaten ?? null),
          connectNulls: false,
          symbolSize: 5,
          lineStyle: { color: eaten, width: 2 },
          itemStyle: { color: eaten },
        },
      ],
    }
  }, [t, active, rest, eaten, periods, grain, today, energy])

  if (!energy.some((period) => period.total !== undefined || period.eaten !== undefined)) return <NoData height={220} />
  return (
    <>
      <Legend
        items={[
          { label: 'Em repouso', color: rest, kind: 'dot' },
          { label: 'Ativas', color: active, kind: 'dot' },
          { label: 'Comido', color: eaten, kind: 'line' },
        ]}
      />
      <Chart option={option} height={220} label={chartLabel('Calorias gastas e comidas por dia', periods)} />
    </>
  )
}

/** Calories over the period picked: each day, or the average per day of a week, month or year. */
function EnergyHistory({ today }: { today: DayKey }) {
  const earliest = useFirstDay(db.dailyHealth, 'id', hasCalories)
  const period = usePeriod('calorias', { earliest })
  const { from, to } = period.window
  const rows = useDailyHealth(from, to)
  const logs = useFoodLogs(from, to)
  const energy = useMemo(
    () => rows && logs && energyByPeriod(period.window, rows, logs, today),
    [rows, logs, period.window, today],
  )
  return (
    <Card title="Histórico">
      <PeriodControl period={period} />
      {energy ? <EnergyChart periods={period.window} energy={energy} /> : <SkeletonLines lines={5} />}
    </Card>
  )
}

function sourceNote(source: RestingSource, today: DayKey): string {
  switch (source.kind) {
    case 'watch':
      return `repouso pela mediana de ${source.days} ${source.days === 1 ? 'dia' : 'dias'} do relógio`
    case 'scale':
      return `repouso pelo metabolismo basal da balança (${relativeDay(source.date, today)})`
    case 'formula':
      return 'repouso pela fórmula de Mifflin-St Jeor'
  }
}

/**
 * Today's calories by the end of the day: the active ones Garmin counted so far and the whole day's
 * resting ones, of which it only has the hours up to its last sync.
 */
function ForecastCard({ forecast, updatedAt, today }: { forecast: Forecast; updatedAt?: number; today: DayKey }) {
  const garmin = useGarminState()
  const { kcal, active, restingSoFar, restingLeft, resting } = forecast
  const share = (value: number) => `${(value / kcal) * 100}%`
  // A forecast, not a count: to the nearest ten.
  const rounded = Math.round(kcal / 10) * 10
  const fresh =
    garmin.phase === 'syncing'
      ? 'Atualizando com o Garmin…'
      : updatedAt === undefined
        ? 'As ativas de hoje ainda não chegaram do Garmin'
        : `Garmin atualizado ${dayKey(updatedAt) === today ? '' : `${relativeDay(dayKey(updatedAt), today)}, `}às ${formatTime(updatedAt)}`
  return (
    <Card title="Previsão para hoje">
      <p className="text-4xl leading-none font-semibold tabular-nums">
        ~{formatNumber(rounded, 0)}
        <span className="ml-1.5 text-base font-normal text-ink-2">kcal</span>
      </p>
      <p className="mt-1 text-sm text-ink-2">Sem contar a atividade do resto do dia</p>
      <div
        role="img"
        aria-label={`Previsão de ${formatNumber(rounded, 0)} kcal: ${formatNumber(active, 0)} ativas até agora e ${formatNumber(restingSoFar + restingLeft, 0)} em repouso no dia, ${formatNumber(restingLeft, 0)} delas ainda por vir`}
        className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-2"
      >
        <span className="h-full bg-(--tone-recovery)" style={{ width: share(active) }} />
        <span className="h-full bg-series-1" style={{ width: share(restingSoFar) }} />
        <span className="h-full bg-series-1/30" style={{ width: share(restingLeft) }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-ink-2">
            <span aria-hidden className="size-2 rounded-full bg-(--tone-recovery)" /> Ativas até agora
          </dt>
          <dd className="text-xl font-semibold tabular-nums">{formatNumber(active, 0)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-ink-2">
            <span aria-hidden className="size-2 rounded-full bg-series-1" /> Repouso do dia
          </dt>
          <dd className="text-xl font-semibold tabular-nums">{formatNumber(restingSoFar + restingLeft, 0)}</dd>
          {restingLeft > 0 && (
            <dd className="flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden className="size-2 rounded-full bg-series-1/30" /> {formatNumber(restingLeft, 0)} ainda por vir
            </dd>
          )}
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        {fresh} · {sourceNote(resting.source, today)}.
      </p>
    </Card>
  )
}

/** The energy the watch counts each day, active and at rest, next to what the food log says was eaten. */
export default function CaloriesPage() {
  const today = useToday()
  const from = shiftDay(today, -(DAYS - 1))
  const rows = useDailyHealth(from, today)
  const logs = useFoodLogs(from, today)
  const weights = useWeights()

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

  const forecast = useMemo(() => {
    if (!days) return undefined
    const scale = weights && [...weights].reverse().find((entry) => entry.bmrKcal)
    // Mifflin–St Jeor (`formulaBmr`) would come next, but it needs the age, which the app doesn't ask.
    const resting = restingEstimate({ days, today, scaleBmr: scale ? { kcal: scale.bmrKcal!, date: scale.date } : undefined })
    return resting && forecastDay(days.at(-1), resting)
  }, [days, weights, today])
  // When today's numbers last changed, on whichever device fetched them.
  const todayRow = rows?.find((row) => row.id === today)
  const updatedAt = todayRow?.calories ? todayRow.updatedAt : undefined

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
          {forecast && <ForecastCard forecast={forecast} updatedAt={updatedAt} today={today} />}

          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="Hoje até agora"
                value={todays.total !== undefined ? formatNumber(todays.total, 0) : '—'}
                note={todays.active !== undefined ? `${formatNumber(todays.active, 0)} ativas` : 'até a sincronização'}
              />
              <Stat label="Média de 7 dias" value={week !== undefined ? formatNumber(week, 0) : '—'} />
              <Stat label={`Média de ${DAYS} dias`} value={month !== undefined ? formatNumber(month, 0) : '—'} />
              <Stat label="Ativas por dia" value={activeMonth !== undefined ? formatNumber(activeMonth, 0) : '—'} note={`média de ${DAYS} dias`} />
            </div>
          </Card>

          <EnergyHistory today={today} />

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
