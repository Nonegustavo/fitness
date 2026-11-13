import { useLiveQuery } from 'dexie-react-hooks'
import { Moon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { DayNav, DayPager } from '../../components/DayNav'
import { PeriodBars } from '../../components/PeriodBars'
import { PeriodControl, useFirstDay, usePeriod, type Period } from '../../components/PeriodControl'
import { PeriodLine } from '../../components/TimeCharts'
import { Button, Card, COLUMNS, cx, Empty, Field, Page, Select, SkeletonCard, SkeletonLines, Stack, Stat } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { db } from '../../db/schema'
import { updateSettings } from '../../db/settings'
import type { DailyHealth } from '../../db/types'
import { daysBetween, formatDay, formatTime, shiftDay, type DayKey } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
import type { DayValue } from '../../lib/stats'
import { isAndroidApp } from '../healthconnect/plugin'
import { importHealthConnect, useHealthConnectState } from '../healthconnect/sync'
import { Hypnogram } from './Hypnogram'
import { hrvStatus, sleepStages, STAGE_CLASS, stressBand, useDailyHealth } from './recovery'
import { balanceSentence, clock, regularity, regularitySentence, sleepBalance, sleepGoalMin, spreadText } from './sleepHabits'

const NIGHTS = ['noite', 'noites'] as const
const hasNight = (day: DailyHealth) => day.sleep !== undefined || day.hrv?.lastNight !== undefined || day.restingHr !== undefined
const sleepHours = (hours: number) => formatDuration(hours * 3_600_000)
const hoursAxis = (hours: number) => `${hours}h`
/** Health Connect keeps 30 days for the apps without its history permission. */
const STAGES_KEPT_DAYS = 30
/** The sleep goals offered: 6h00 to 9h30, every 15 minutes. */
const GOALS = Array.from({ length: 15 }, (_, i) => 360 + i * 15)

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
  const trends = useTrends()
  const habits = useSleepHabits(today)

  if (latest === undefined) {
    return (
      <Page title="Sono e recuperação" icon={Moon} tone="sleep">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={5} />
      </Page>
    )
  }

  return (
    <Page title="Sono e recuperação" icon={Moon} tone="sleep" subtitle="Do relógio Garmin" wide>
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
        // All of the screen is the night's page: dragged sideways, everything moves with the finger. On a
        // wide screen the night is on the left, the habit and the history on the right.
        <DayPager date={date} today={today} onChange={setDate} className={COLUMNS}>
          {(day) => (
            <>
              <Stack>
                <SleepDay date={day} today={today} latest={latest} onDate={setDate} />
              </Stack>
              <Stack>
                <RegularityCard habits={habits} />
                <TrendsCard trends={trends} />
              </Stack>
            </>
          )}
        </DayPager>
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
        <NightCard day={day} today={today} />
      ) : (
        <Card title={nightLabel(date)}>
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

function NightCard({ day, today }: { day: DailyHealth; today: DayKey }) {
  const sleep = day.sleep
  if (!sleep) return null
  const stages = sleepStages(sleep)
  const total = stages.reduce((sum, part) => sum + part.seconds, 0)
  const vitals = [
    sleep.avgHr !== undefined && { label: 'FC média', value: `${Math.round(sleep.avgHr)} bpm` },
    sleep.avgRespiration !== undefined && { label: 'Respiração', value: `${formatNumber(sleep.avgRespiration, 0)} rpm` },
  ].filter((vital) => !!vital)
  return (
    <Card title={nightLabel(day.id)}>
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
        <div className="@container">
          <div className="mt-4 flex h-3 overflow-hidden rounded-full" role="img" aria-label="Fases do sono">
            {stages.map((part) => (
              <span key={part.key} className={cx('h-full', STAGE_CLASS[part.key])} style={{ width: `${(part.seconds / total) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm @sm:grid-cols-2">
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
        </div>
      )}
      {vitals.length > 0 && (
        // A quieter line under the stages: the three numbers on top keep the room they have on a phone.
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-3 text-sm">
          {vitals.map((vital) => (
            <div key={vital.label} className="flex items-baseline gap-2">
              <dt className="text-ink-2">{vital.label}</dt>
              <dd className="font-medium tabular-nums">{vital.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {day.sleepStages && day.sleepStages.length > 1 ? (
        <div className="mt-5">
          <p className="mb-1 text-sm font-medium">Ao longo da noite</p>
          <Hypnogram spans={day.sleepStages} />
        </div>
      ) : (
        <MissingStages date={day.id} today={today} />
      )}
    </Card>
  )
}

/**
 * The night's stages with their times only come from Health Connect, on the phone (the Garmin API has
 * the totals): where they come from, or a button in the app to bring them now.
 */
function MissingStages({ date, today }: { date: DayKey; today: DayKey }) {
  const android = isAndroidApp()
  const healthConnect = useHealthConnectState()
  const [tried, setTried] = useState(false)
  const age = daysBetween(date, today)
  const history = android && healthConnect.access?.history === true
  if (age > STAGES_KEPT_DAYS && !history) return <p className="mt-4 text-sm text-muted">Sem as fases desta noite.</p>
  if (!android) {
    return <p className="mt-4 text-sm text-muted">As fases ao longo da noite chegam pelo app do celular: abra o app para trazê-las.</p>
  }
  if (healthConnect.access && !healthConnect.access.granted.includes('sleep')) {
    return (
      <p className="mt-4 text-sm text-muted">
        As fases ao longo da noite vêm do Health Connect.{' '}
        <Link to="/ajustes" className="font-medium text-accent-ink underline underline-offset-2">
          Permitir o sono em Ajustes
        </Link>
      </p>
    )
  }
  const busy = healthConnect.phase === 'busy'
  const bring = async () => {
    // An import reaches back from the last one; an older night needs the whole history.
    await importHealthConnect({ full: age > 2 })
    setTried(true)
  }
  return (
    <div className="mt-4 flex items-center gap-3">
      <p className="min-w-0 flex-1 text-sm text-muted">
        {busy
          ? 'Trazendo do Health Connect…'
          : tried
            ? healthConnect.phase === 'error'
              ? `Não deu certo: ${healthConnect.message ?? 'tente de novo'}.`
              : 'O Health Connect não tem as fases desta noite.'
            : 'As fases ao longo da noite vêm do Health Connect, no celular.'}
      </p>
      <Button size="sm" className="shrink-0" disabled={busy} onClick={() => void bring()}>
        Importar agora
      </Button>
    </div>
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
    stats.push({ label: 'Estresse médio', value: stress.avg, note: [stressBand(stress.avg), stress.max && `máx ${stress.max}`].filter(Boolean).join(' · ') })
  }
  if (steps !== undefined) stats.push({ label: 'Passos', value: formatNumber(steps, 0) })
  return stats
}

function RecoveryCard({ stats, hrv }: { stats: RecoveryStat[]; hrv?: DailyHealth['hrv'] }) {
  return (
    <Card title="Recuperação">
      <div className="@container">
        <div className="grid grid-cols-2 gap-4 @sm:grid-cols-3">
          {stats.map((stat) => (
            <Stat key={stat.label} {...stat} />
          ))}
        </div>
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

interface Trends {
  period: Period
  /** False while the days load. */
  loaded: boolean
  hours: DayValue[]
  hrv: DayValue[]
  resting: DayValue[]
  stress: DayValue[]
}

/**
 * The history's period and readings, read once for the screen: each night's page draws the same
 * charts, so the one coming in during a drag shows them at once, with the period picked.
 */
function useTrends(): Trends {
  const earliest = useFirstDay(db.dailyHealth, 'id', hasNight)
  const period = usePeriod('sono', { earliest })
  const days = useDailyHealth(period.window.from, period.window.to)
  const hours = useMemo(() => readings(days ?? [], (day) => (day.sleep ? day.sleep.totalSec / 3600 : undefined)), [days])
  const hrv = useMemo(() => readings(days ?? [], (day) => day.hrv?.lastNight), [days])
  const resting = useMemo(() => readings(days ?? [], (day) => day.restingHr), [days])
  const stress = useMemo(() => readings(days ?? [], (day) => day.stress?.avg), [days])
  return { period, loaded: days !== undefined, hours, hrv, resting, stress }
}

/** Sleep, HRV, resting heart rate and stress over the period picked: each night, or the average of a week, month or year. */
function TrendsCard({ trends }: { trends: Trends }) {
  const { period, loaded, hours, hrv, resting, stress } = trends
  return (
    <Card title="Histórico">
      <PeriodControl period={period} />
      {!loaded ? (
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
          {stress.length > 0 && (
            <>
              <p className="mt-5 mb-1 text-sm font-medium">Estresse médio</p>
              <PeriodLine periods={period.window} values={stress} how="mean" unit="" digits={0} label="Estresse médio" />
            </>
          )}
        </>
      )}
    </Card>
  )
}

interface SleepHabits {
  /** False while the nights load. */
  loaded: boolean
  regular: ReturnType<typeof regularity>
  balance: ReturnType<typeof sleepBalance>
  goalMin: number
}

/** The last 2 weeks' regularity and the last 7 nights against the goal, as of today: the same on every night's page. */
function useSleepHabits(today: DayKey): SleepHabits {
  const settings = useSettings()
  const goalMin = sleepGoalMin(settings)
  const days = useDailyHealth(shiftDay(today, -13), today)
  return useMemo(
    () => ({
      loaded: days !== undefined,
      regular: days && regularity(days, today),
      balance: days && sleepBalance(days, today, goalMin),
      goalMin,
    }),
    [days, today, goalMin],
  )
}

/** When the nights usually start and end, how much that varies, and the last 7 against the sleep goal. */
function RegularityCard({ habits }: { habits: SleepHabits }) {
  const { loaded, regular, balance, goalMin } = habits
  if (loaded && !regular && !balance) return null
  // A goal set off the 15-minute steps (on another device, say) still shows.
  const goals = GOALS.includes(goalMin) ? GOALS : [...GOALS, goalMin].sort((a, b) => a - b)
  return (
    <Card title="Regularidade">
      {!loaded ? (
        <SkeletonLines lines={4} />
      ) : (
        <>
          {regular ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Costuma dormir" value={clock(regular.bedtime)} note={spreadText(regular.bedtimeSdMin)} />
                <Stat label="Costuma acordar" value={clock(regular.wake)} note={spreadText(regular.wakeSdMin)} />
              </div>
              <p className="mt-3 text-sm text-ink-2">{regularitySentence(regular)}</p>
            </>
          ) : (
            <p className="text-sm text-muted">Com 5 noites com horário nas últimas 2 semanas, aparecem a hora de dormir e a de acordar de costume.</p>
          )}
          {balance && <p className="mt-3 text-sm">{balanceSentence(balance)}</p>}
          <div className="mt-4 max-w-56">
            <Field label="Meta de sono por noite">
              <Select value={goalMin} onChange={(event) => void updateSettings(() => ({ sleepGoalMin: Number(event.target.value) }))}>
                {goals.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes * 60_000)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </>
      )}
    </Card>
  )
}
