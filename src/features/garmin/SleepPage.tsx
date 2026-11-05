import { Moon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PeriodBars } from '../../components/PeriodBars'
import { PeriodControl, useFirstDay, usePeriod } from '../../components/PeriodControl'
import { PeriodLine } from '../../components/TimeCharts'
import { Card, cx, Empty, Page, SkeletonCard, SkeletonLines, Stat } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { db } from '../../db/schema'
import type { DailyHealth } from '../../db/types'
import { formatTime, relativeDay, shiftDay } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
import type { DayValue } from '../../lib/stats'
import { Hypnogram } from './Hypnogram'
import { hrvStatus, latestNight, sleepStages, STAGE_CLASS, useDailyHealth } from './recovery'

/** The last nights, for the latest one and the recovery numbers. */
const RECENT_DAYS = 30

const NIGHTS = ['noite', 'noites'] as const
const hasNight = (day: DailyHealth) => day.sleep !== undefined || day.hrv?.lastNight !== undefined || day.restingHr !== undefined
const sleepHours = (hours: number) => formatDuration(hours * 3_600_000)
const hoursAxis = (hours: number) => `${hours}h`

/** One reading per day, from the days that have it. */
const readings = (days: DailyHealth[], pick: (day: DailyHealth) => number | undefined): DayValue[] =>
  days.flatMap((day) => {
    const value = pick(day)
    return value ? [{ date: day.id, value }] : []
  })

export default function SleepPage() {
  const today = useToday()
  const from = shiftDay(today, -(RECENT_DAYS - 1))
  const days = useDailyHealth(from, today)
  if (!days) {
    return (
      <Page title="Sono e recuperação" icon={Moon} tone="sleep">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={5} />
      </Page>
    )
  }
  const latest = latestNight(days)

  return (
    <Page
      title="Sono e recuperação"
      icon={Moon}
      tone="sleep"
      subtitle={latest ? `Última noite: ${relativeDay(latest.id, today)}` : 'Do relógio Garmin'}
    >
      {!latest ? (
        <Card>
          <Empty>Nenhum dado de sono ainda.</Empty>
          <p className="text-sm text-ink-2">
            O sono, a HRV e a frequência cardíaca de repouso vêm do Garmin.{' '}
            <Link to="/ajustes" className="font-medium text-accent-ink underline underline-offset-2">
              Ligar em Ajustes
            </Link>
          </p>
        </Card>
      ) : (
        <>
          <NightCard day={latest} />
          <RecoveryCard day={latest} />
          <TrendsCard />
        </>
      )}
    </Page>
  )
}

function NightCard({ day }: { day: DailyHealth }) {
  const sleep = day.sleep
  if (!sleep) return null
  const stages = sleepStages(sleep)
  const total = stages.reduce((sum, part) => sum + part.seconds, 0)
  return (
    <Card title="Noite">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Dormiu" value={formatDuration(sleep.totalSec * 1000)} note={sleep.napSec ? `+ cochilo de ${formatDuration(sleep.napSec * 1000)}` : undefined} />
        <Stat label="Nota" value={sleep.score ?? '—'} note={sleep.score !== undefined ? 'de 100' : undefined} />
        <Stat
          label="Acordou"
          value={sleep.end ? formatTime(sleep.end) : '—'}
          note={sleep.start ? `dormiu às ${formatTime(sleep.start)}` : undefined}
        />
      </div>
      {total > 0 && (
        <>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full" role="img" aria-label="Fases do sono">
            {stages.map((part) => (
              <span key={part.key} className={cx('h-full', STAGE_CLASS[part.key])} style={{ width: `${(part.seconds / total) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {stages.map((part) => (
              <li key={part.key} className="flex items-center gap-2">
                <span className={cx('size-2.5 shrink-0 rounded-full', STAGE_CLASS[part.key])} />
                <span className="text-ink-2">{part.label}</span>
                <span className="ml-auto tabular-nums">
                  {formatDuration(part.seconds * 1000)}{' '}
                  <span className="text-muted">· {Math.round((part.seconds / total) * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {day.sleepStages && day.sleepStages.length > 1 && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-medium">Ao longo da noite</p>
          <Hypnogram spans={day.sleepStages} />
        </div>
      )}
    </Card>
  )
}

function RecoveryCard({ day }: { day: DailyHealth }) {
  const { hrv, restingHr, bodyBattery, stress, steps } = day
  const stats: { label: string; value: ReactNode; note?: string }[] = []
  if (hrv?.lastNight !== undefined) {
    stats.push({ label: 'HRV da noite', value: `${hrv.lastNight} ms`, note: hrvStatus(hrv.status) })
  }
  if (restingHr !== undefined) stats.push({ label: 'FC de repouso', value: `${restingHr} bpm` })
  if (bodyBattery?.high !== undefined) {
    stats.push({
      label: 'Body Battery',
      value: bodyBattery.high,
      note: bodyBattery.low !== undefined ? `mínimo ${bodyBattery.low}` : undefined,
    })
  }
  if (stress?.avg !== undefined) {
    stats.push({ label: 'Estresse médio', value: stress.avg, note: stress.max ? `máx ${stress.max}` : undefined })
  }
  if (steps !== undefined) stats.push({ label: 'Passos', value: formatNumber(steps, 0) })
  if (stats.length === 0) return null
  return (
    <Card title="Recuperação">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
      </div>
      {hrv && (hrv.weeklyAvg !== undefined || hrv.balancedLow !== undefined) && (
        <p className="mt-3 text-xs text-muted">
          {[
            hrv.weeklyAvg !== undefined && `HRV média de 7 dias: ${hrv.weeklyAvg} ms`,
            hrv.balancedLow !== undefined && hrv.balancedHigh !== undefined && `sua faixa equilibrada: ${hrv.balancedLow}–${hrv.balancedHigh} ms`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </Card>
  )
}

/** Sleep, HRV and resting heart rate over the period picked: each night, or the average of a week, month or year. */
function TrendsCard() {
  const earliest = useFirstDay(db.dailyHealth, 'id', hasNight)
  const period = usePeriod('sono', { earliest })
  const days = useDailyHealth(period.window.from, period.window.to)
  const hours = useMemo(() => readings(days ?? [], (day) => (day.sleep ? day.sleep.totalSec / 3600 : undefined)), [days])
  const hrv = useMemo(() => readings(days ?? [], (day) => day.hrv?.lastNight), [days])
  const resting = useMemo(() => readings(days ?? [], (day) => day.restingHr), [days])
  return (
    <Card title="Histórico">
      <PeriodControl period={period} />
      {!days ? (
        <SkeletonLines lines={5} />
      ) : (
        <>
          <p className="mb-1 text-sm font-medium">Horas de sono</p>
          <PeriodBars
            periods={period.window}
            values={hours}
            how="mean"
            format={sleepHours}
            axisFormat={hoursAxis}
            valueLabel="de sono"
            noun={NIGHTS}
            label="Horas de sono por noite"
            step={2}
          />
          {hrv.length > 0 && (
            <>
              <p className="mt-5 mb-1 text-sm font-medium">HRV da noite</p>
              <PeriodLine periods={period.window} values={hrv} how="mean" unit="ms" digits={0} label="HRV" noun={NIGHTS} />
            </>
          )}
          {resting.length > 0 && (
            <>
              <p className="mt-5 mb-1 text-sm font-medium">FC de repouso</p>
              <PeriodLine periods={period.window} values={resting} how="mean" unit="bpm" digits={0} label="FC de repouso" />
            </>
          )}
        </>
      )}
    </Card>
  )
}
