import { Moon } from 'lucide-react'
import { Link } from 'react-router'
import { MiniBars } from '../../components/MiniCharts'
import { toneColor } from '../../components/tone'
import { Card, cx, SkeletonCard } from '../../components/ui'
import type { DailyHealth, SleepStage, SleepStageSpan } from '../../db/types'
import { dayRange, formatTime, parseDay, relativeDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatDuration } from '../../lib/format'
import { Hypnogram } from './Hypnogram'
import { latestNight, sleepQuality, sleepStages, STAGE_CLASS, useDailyHealth, type StagePart } from './recovery'

/** The nights the card shows when the watch didn't bring the stages through the night. */
const NIGHTS = 7
const LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

type Sleep = NonNullable<DailyHealth['sleep']>

/**
 * How long the night spent in each stage: the watch's totals, or else added up from the stages
 * through the night (Health Connect has those without the totals sometimes).
 */
export function nightStages(sleep: Sleep, spans: SleepStageSpan[] | undefined): StagePart[] {
  const parts = sleepStages(sleep)
  if (parts.length > 0 || !spans?.length) return parts
  const seconds = (stage: SleepStage) =>
    spans.reduce((total, span) => (span.stage === stage ? total + Math.max(0, span.end - span.start) / 1000 : total), 0)
  return sleepStages({ totalSec: sleep.totalSec, deepSec: seconds('deep'), lightSec: seconds('light'), remSec: seconds('rem'), awakeSec: seconds('awake') })
}

/**
 * Last night from the watch, on the Hoje page, filling its card: the score and its word, how long and
 * when, the night's HRV and resting heart rate, the stages through the night (Health Connect) with how
 * long each one took, or else the last week of nights. Hidden until the Garmin sync brings a night.
 */
export function TodaySleepCard({ today }: { today: DayKey }) {
  const days = useDailyHealth(shiftDay(today, -(NIGHTS - 1)), today)
  // While loading, a placeholder of the card's size; with no night, nothing.
  if (!days) return <SkeletonCard lines={4} />
  const night = latestNight(days)
  if (!night?.sleep) return null
  const { sleep, sleepStages: spans } = night
  const stages = nightStages(sleep, spans)
  const hours = formatDuration(sleep.totalSec * 1000)
  const times = sleep.start !== undefined && sleep.end !== undefined ? `${formatTime(sleep.start)} – ${formatTime(sleep.end)}` : undefined
  return (
    <Card
      icon={Moon}
      tone="sleep"
      title={`Sono · ${relativeDay(night.id, today)}`}
      action={
        <Link to="/sono" className="text-sm font-medium text-accent-ink">
          Detalhes
        </Link>
      }
    >
      <div className="flex h-full flex-col">
        <div className="flex items-end gap-5">
          {sleep.score !== undefined ? (
            <>
              <div>
                <p className="text-4xl leading-none font-semibold tabular-nums">{sleep.score}</p>
                <p className="mt-1 text-xs text-ink-2">{sleepQuality(sleep.score)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xl leading-tight font-semibold tabular-nums">{hours}</p>
                {times && <p className="mt-0.5 text-xs text-ink-2 tabular-nums">{times}</p>}
              </div>
            </>
          ) : (
            <div className="min-w-0">
              <p className="text-4xl leading-none font-semibold tabular-nums">{hours}</p>
              <p className="mt-1 text-xs text-ink-2 tabular-nums">{times ?? 'dormiu'}</p>
            </div>
          )}
          <NightNumbers night={night} />
        </div>
        {spans && spans.length > 1 ? (
          // The stages get the room that's left, at least their own height (a taller drawing pushes the
          // breakdown down to be cut, never over it).
          <div className="mt-3 flex flex-1 flex-col justify-center">
            <Hypnogram spans={spans} />
          </div>
        ) : (
          <LastNights days={days} night={night.id} today={today} />
        )}
        {stages.length > 0 && (
          <ul className="mt-3 grid shrink-0 grid-cols-4 gap-2 text-xs" aria-label="Tempo em cada fase">
            {stages.map((part) => (
              <li key={part.key} className="min-w-0">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span aria-hidden className={cx('size-2 shrink-0 rounded-full', STAGE_CLASS[part.key])} />
                  <span className="truncate">{part.label}</span>
                </span>
                <span className="mt-0.5 block font-semibold tabular-nums">{formatDuration(part.seconds * 1000)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

/** The night's HRV and resting heart rate, small, at the end of the top row. */
function NightNumbers({ night }: { night: DailyHealth }) {
  const hrv = night.hrv?.lastNight
  const resting = night.restingHr
  if (hrv === undefined && resting === undefined) return null
  return (
    <dl className="ml-auto shrink-0 space-y-0.5 text-right text-xs">
      {hrv !== undefined && (
        <div>
          <dt className="inline text-muted">HRV </dt>
          <dd className="inline font-semibold tabular-nums">{hrv} ms</dd>
        </div>
      )}
      {resting !== undefined && (
        <div>
          <dt className="inline text-muted">FC de repouso </dt>
          <dd className="inline font-semibold tabular-nums">{resting} bpm</dd>
        </div>
      )}
    </dl>
  )
}

/** Hours slept in the last week, the card's night the strong bar, when there are no stages to draw. */
function LastNights({ days, night, today }: { days: DailyHealth[]; night: DayKey; today: DayKey }) {
  const range = dayRange(shiftDay(today, -(NIGHTS - 1)), today)
  const byDay = new Map(days.map((day) => [day.id, day]))
  const hours = range.map((day) => (byDay.get(day)?.sleep?.totalSec ?? 0) / 3600)
  const slept = hours.filter((value) => value > 0)
  const mean = slept.length > 1 ? slept.reduce((total, value) => total + value, 0) / slept.length : undefined
  return (
    <div className="mt-3 flex flex-1 flex-col">
      <p className="mb-1.5 text-xs text-muted">
        Últimas {NIGHTS} noites{mean !== undefined && ` · média ${formatDuration(mean * 3_600_000)}`}
      </p>
      <MiniBars
        values={hours}
        highlight={range.indexOf(night)}
        marker={mean}
        color={toneColor('sleep')}
        label={`Horas de sono nas últimas ${NIGHTS} noites`}
        className="min-h-10 flex-1"
      />
      <div aria-hidden className="mt-1 flex gap-[3px] text-center text-[10px] text-muted">
        {range.map((day) => (
          <span key={day} className={cx('min-w-0 flex-1', day === night && 'font-bold text-ink-2')}>
            {LETTERS[parseDay(day).getDay()]}
          </span>
        ))}
      </div>
    </div>
  )
}
