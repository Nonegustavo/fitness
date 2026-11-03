import { Fragment } from 'react'
import { cx } from '../../components/ui'
import type { SleepStage, SleepStageSpan } from '../../db/types'
import { formatTime } from '../../lib/dates'
import { STAGE_CLASS } from './recovery'

// Awake on top and deep sleep at the bottom, the usual way to draw a night.
const ROWS: { stage: SleepStage; label: string }[] = [
  { stage: 'awake', label: 'Acordado' },
  { stage: 'rem', label: 'REM' },
  { stage: 'light', label: 'Leve' },
  { stage: 'deep', label: 'Profundo' },
]

/** The night's stages in time order, one row per stage (from Health Connect). */
export function Hypnogram({ spans }: { spans: SleepStageSpan[] }) {
  const start = spans[0].start
  const end = spans[spans.length - 1].end
  const length = end - start
  if (length <= 0) return null
  const percent = (time: number) => ((time - start) / length) * 100

  return (
    <figure aria-label={`Fases do sono das ${formatTime(start)} às ${formatTime(end)}`}>
      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-y-1 text-xs">
        {ROWS.map(({ stage, label }) => (
          <Fragment key={stage}>
            <span className="text-ink-2">{label}</span>
            <span className="relative block h-4 rounded-[4px] bg-surface-2">
              {spans
                .filter((span) => span.stage === stage)
                .map((span) => (
                  <span
                    key={span.start}
                    className={cx('absolute inset-y-0 rounded-[2px]', STAGE_CLASS[stage])}
                    style={{ left: `${percent(span.start)}%`, width: `${Math.max(0.4, percent(span.end) - percent(span.start))}%` }}
                  />
                ))}
            </span>
          </Fragment>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-[4.5rem_1fr] text-xs text-muted">
        <span />
        <span className="flex justify-between tabular-nums">
          <span>{formatTime(start)}</span>
          <span>{formatTime(end)}</span>
        </span>
      </div>
    </figure>
  )
}
