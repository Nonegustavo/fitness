import { useLiveQuery } from 'dexie-react-hooks'
import { Moon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { DayNav, DayPager } from '../../components/DayNav'
import { PeriodBars } from '../../components/PeriodBars'
import { PeriodControl, useFirstDay, usePeriod } from '../../components/PeriodControl'
import { PeriodLine } from '../../components/TimeCharts'
import { Button, Card, cx, Empty, Page, SkeletonCard, SkeletonLines, Stat } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { db } from '../../db/schema'
import type { DailyHealth } from '../../db/types'
import { formatDay, formatTime, shiftDay, type DayKey } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
import type { DayValue } from '../../lib/stats'
import { Hypnogram } from './Hypnogram'
import { hrvStatus, sleepStages, STAGE_CLASS, useDailyHealth } from './recovery'

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

/** "Noite de 5 para 6 de novembro": a night counts for the morning it ends, as Garmin dates it. */
function nightLabel(date: DayKey): string {
  const before = shiftDay(date, -1)
  const sameMonth = before.slice(0, 7) === date.slice(0, 7)
  return `Noite de ${formatDay(before, sameMonth ? 'd' : "d 'de' MMMM")} para ${formatDay(date, "d 'de' MMMM")}`
}

/** The latest day with a night; null when there's none at all. */
function useLatestNight(): DailyHealth | null | undefined {
  return useLiveQuery(
    async () => (await db.dailyHealth.orderBy('id').reverse().filter((day) => !day.deleted && day.sleep !== undefined).first()) ?? null,
  )
}

export default function SleepPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const asked = params.get('data')
  const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today ? asked : today
  const setDate = (next: DayKey) => setParams(next === today ? {} : { data: next }, { replace: true })
  const latest = useLatestNight()

  if (latest === undefined) {
    return (
      <Page title="Sono e recuperação" icon={Moon} tone="sleep">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={5} />
      </Page>
    )
  }

  return (
    <Page title="Sono e recuperação" icon={Moon} tone="sleep" subtitle={latest ? nightLabel(date) : 'Do relógio Garmin'}>
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
          {/* The chosen night's cards move with the finger; the one before or after slides in. */}
          <DayPager date={date} today={today} onChange={setDate}>
            {(day) => <SleepDay date={day} today={today} latest={latest} onDate={setDate} />}
          </DayPager>
          <TrendsCard />
        </>
      )}
    </Page>
  )
}

/** One night under the day picker: its own query, since the pager also draws the night coming in. */
function SleepDay({ date, today, latest, onDate }: { date: DayKey; today: DayKey; latest: DailyHealth; onDate: (date: DayKey) => void }) {
  const days = useDailyHealth(date, date)
  return (
    <div>
      <DayNav date={date} today={today} onChange={onDate} />
      <div className="space-y-4">
        {days ? (
          <NightCards day={days[0]} date={date} today={today} latest={latest} onPick={onDate} />
        ) : (
          <>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={3} />
          </>
        )}
      </div>
    </div>
  )
}

/** The night of a day and the recovery numbers of that day, or what's missing. */
function NightCards({
  day,
  date,
  today,
  latest,
  onPick,
}: {
  day: DailyHealth | undefined
  date: DayKey
  today: DayKey
  latest: DailyHealth
  onPick: (date: DayKey) => void
}) {
  const stats = day ? recoveryStats(day) : []
  return (
    <>
      {day?.sleep ? (
        <NightCard day={day} />
      ) : (
        <Card title="Noite">
          <Empty>
            {date === today
              ? 'A noite de hoje ainda não chegou do Garmin.'
              : stats.length > 0
                ? 'O relógio não registrou o sono desta noite.'
                : 'Sem dados de sono nesta noite.'}
          </Empty>
          {latest.id < date && (
            <Button size="sm" variant="ghost" className="w-full" onClick={() => onPick(latest.id)}>
              Ver a {nightLabel(latest.id).toLowerCase()}
            </Button>
          )}
        </Card>
      )}
      {day && stats.length > 0 && <RecoveryCard stats={stats} hrv={day.hrv} />}
    </>
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
          <p className="mb-1 text-sm font-medium">Ao longo da noite</p>
          <Hypnogram spans={day.sleepStages} />
        </div>
      )}
    </Card>
  )
}

interface RecoveryStat {
  label: string
  value: ReactNode
  note?: string
}

/** The day's recovery numbers that the watch has. */
function recoveryStats({ hrv, restingHr, bodyBattery, stress, steps }: DailyHealth): RecoveryStat[] {
  const stats: RecoveryStat[] = []
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
  return stats
}

function RecoveryCard({ stats, hrv }: { stats: RecoveryStat[]; hrv?: DailyHealth['hrv'] }) {
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
