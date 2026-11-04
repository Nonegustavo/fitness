import { Footprints } from 'lucide-react'
import { DailyBars } from '../../components/DailyBars'
import { Card, Empty, Page, SkeletonCard, Stat } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { dayRange, formatDay, relativeDay, shiftDay } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { useDailyHealth } from './recovery'

const DAYS = 30

const average = (values: number[]) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined)

/** Steps day by day from the watch (and the calories of each day), as the Garmin sync brought them. */
export default function StepsPage() {
  const today = useToday()
  const from = shiftDay(today, -(DAYS - 1))
  const rows = useDailyHealth(from, today)

  if (!rows) {
    return (
      <Page title="Passos" icon={Footprints} tone="today">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={6} />
      </Page>
    )
  }

  const byDay = new Map(rows.map((row) => [row.id, row]))
  const days = dayRange(from, today)
  const steps = days.map((day) => byDay.get(day)?.steps)
  const known = (list: (number | undefined)[]) => list.filter((value): value is number => value !== undefined)
  // Today isn't over: the averages leave it out.
  const week = average(known(steps.slice(-8, -1)))
  const month = average(known(steps.slice(0, -1)))
  const best = days.reduce<{ day: string; steps: number } | undefined>((top, day, i) => {
    const value = steps[i]
    return value !== undefined && (!top || value > top.steps) ? { day, steps: value } : top
  }, undefined)
  const listed = [...rows].filter((row) => row.steps !== undefined || row.calories?.total !== undefined).reverse()

  return (
    <Page title="Passos" icon={Footprints} tone="today" subtitle="Do relógio, até a última sincronização do Garmin">
      {listed.length === 0 ? (
        <Card>
          <Empty>Nenhum dia com passos ainda. Eles chegam com a sincronização do Garmin.</Empty>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Hoje" value={steps.at(-1) !== undefined ? formatNumber(steps.at(-1)!, 0) : '—'} note="até a sincronização" />
              <Stat label="Média de 7 dias" value={week !== undefined ? formatNumber(week, 0) : '—'} />
              <Stat label={`Média de ${DAYS} dias`} value={month !== undefined ? formatNumber(month, 0) : '—'} />
              <Stat label="Melhor dia" value={best ? formatNumber(best.steps, 0) : '—'} note={best && relativeDay(best.day, today)} />
            </div>
          </Card>

          <Card title={`Últimos ${DAYS} dias`}>
            <DailyBars
              days={days}
              values={steps.map((value) => value ?? 0)}
              format={(value) => `${formatNumber(value, 0)} passos`}
              axisFormat={(value) => (value >= 1000 ? `${formatNumber(value / 1000, 0)} mil` : String(value))}
              valueLabel="passos"
              label={`Passos por dia nos últimos ${DAYS} dias`}
              step={2000}
            />
          </Card>

          <Card title="Dia a dia">
            <ul className="divide-y divide-line">
              {listed.map((row) => (
                <li key={row.id} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 text-ink-2 first-letter:uppercase">
                    {row.id === today ? 'hoje' : formatDay(row.id, "EEE, d 'de' MMM")}
                  </span>
                  <span className="w-14 text-right font-medium tabular-nums">{row.steps !== undefined ? formatNumber(row.steps, 0) : '—'}</span>
                  <span className="w-36 shrink-0 text-right text-xs text-muted tabular-nums">
                    {row.calories?.total !== undefined && `${formatNumber(row.calories.total, 0)} kcal`}
                    {row.calories?.active !== undefined && ` · ${formatNumber(row.calories.active, 0)} ativas`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </Page>
  )
}
