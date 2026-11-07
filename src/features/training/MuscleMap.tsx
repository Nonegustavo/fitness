import { cx } from '../../components/ui'
import type { MuscleGroup } from '../../db/types'
import { BODY_BACK, BODY_FRONT, type BodyView } from './bodyMap'
import { MUSCLES } from './catalog'

/** Weekly working sets per muscle that usually drive growth (hypertrophy studies: ~10–20). */
export const WEEKLY_RANGE = { min: 10, max: 20 }

type Level = 'none' | 'low' | 'some' | 'good' | 'high'

export function levelOf(sets: number): Level {
  if (sets <= 0) return 'none'
  if (sets < WEEKLY_RANGE.min / 2) return 'low'
  if (sets < WEEKLY_RANGE.min) return 'some'
  if (sets <= WEEKLY_RANGE.max) return 'good'
  return 'high'
}

const TONE = 'var(--tone-training)'
/** The body and the muscles not trained: a gray that stands out from the card in both themes. */
const BODY = 'color-mix(in oklab, var(--baseline) 60%, var(--surface-2))'
const FILL: Record<Level, string> = {
  none: BODY,
  low: `color-mix(in oklab, ${TONE} 30%, ${BODY})`,
  some: `color-mix(in oklab, ${TONE} 60%, ${BODY})`,
  good: TONE,
  high: 'var(--critical)',
}

const LEGEND: { level: Level; label: string }[] = [
  { level: 'none', label: '0' },
  { level: 'low', label: `1–${WEEKLY_RANGE.min / 2 - 1}` },
  { level: 'some', label: `${WEEKLY_RANGE.min / 2}–${WEEKLY_RANGE.min - 1}` },
  { level: 'good', label: `${WEEKLY_RANGE.min}–${WEEKLY_RANGE.max}` },
  { level: 'high', label: `+${WEEKLY_RANGE.max}` },
]

const setsLabel = (sets: number) => `${sets} ${sets === 1 ? 'série' : 'séries'}`

/** Where a number of sets falls on the bars: 0–25, so a week past 20 still has room to show. */
const SCALE = WEEKLY_RANGE.max * 1.25
const scaled = (sets: number) => `${(Math.min(sets, SCALE) / SCALE) * 100}%`

/** Name, bar and count: the list's rows and the scale over them line up on these columns. */
const ROW = 'grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2'

function Figure({ view, counts, label }: { view: BodyView; counts: Map<MuscleGroup, number>; label: string }) {
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={view.viewBox} className="h-60 w-auto" role="img" aria-label={label}>
        <g style={{ fill: BODY }}>
          {view.body.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {view.muscles.map(([muscle, paths]) => {
          const sets = counts.get(muscle) ?? 0
          return (
            <g key={muscle} className="transition-opacity hover:opacity-75" style={{ fill: FILL[levelOf(sets)] }}>
              <title>{`${MUSCLES[muscle]}: ${setsLabel(sets)}`}</title>
              {paths.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-1 text-xs text-muted">{label}</figcaption>
    </figure>
  )
}

/**
 * The week's working sets on a body, front and back, colored against the usual 10–20 sets per
 * muscle; the list next to it has the numbers, so nothing depends on the color alone.
 */
export function MuscleMap({ counts }: { counts: Map<MuscleGroup, number> }) {
  // Full-body and cardio exercises have no place on the figure; they stay in the list.
  const rows = (Object.keys(MUSCLES) as MuscleGroup[])
    .map((muscle) => [muscle, counts.get(muscle) ?? 0] as const)
    .filter(([muscle, sets]) => sets > 0 || (muscle !== 'full_body' && muscle !== 'cardio'))
    .sort((a, b) => b[1] - a[1])
  return (
    <div className="mt-4">
      <div className="flex justify-center gap-8">
        <Figure view={BODY_FRONT} counts={counts} label="Frente" />
        <Figure view={BODY_BACK} counts={counts} label="Costas" />
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-ink-2" aria-label="Legenda">
        {LEGEND.map(({ level, label }) => (
          <li key={level} className="flex items-center gap-1">
            <span aria-hidden className="inline-block size-2.5 rounded-[3px]" style={{ background: FILL[level] }} />
            {label}
          </li>
        ))}
        <li className="text-muted">séries na semana</li>
      </ul>
      {/* The scale's marks, once, over the bars' ticks. */}
      <div aria-hidden className={cx('mt-4', ROW)}>
        <span className="relative col-start-2 h-3.5 text-[11px] leading-3.5 text-muted tabular-nums">
          {[WEEKLY_RANGE.min, WEEKLY_RANGE.max].map((value) => (
            <span key={value} className="absolute -translate-x-1/2" style={{ left: scaled(value) }}>
              {value}
            </span>
          ))}
        </span>
      </div>
      <ul className="mt-1 space-y-1.5">
        {rows.map(([muscle, sets]) => (
          <li key={muscle} className={cx(ROW, 'text-sm')}>
            <span className="truncate text-ink-2">{MUSCLES[muscle]}</span>
            <RangeBar sets={sets} />
            <span className="text-right tabular-nums">{sets}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The 10–20 stretch of the track: a step off the track's own color, darker in light, lighter in dark. */
const RANGE_BAND = 'color-mix(in oklab, var(--ink) 9%, var(--surface-2))'

/**
 * One bar of sets on the 0–25 scale. The 10–20 range is part of the track (a shaded stretch, ticked
 * at both ends past the bar's edges), and the sets fill it from the left, on top.
 */
function RangeBar({ sets }: { sets: number }) {
  return (
    <span className="relative block h-2" aria-hidden>
      <span className="absolute inset-0 overflow-hidden rounded-[2px] bg-surface-2">
        <span
          className="absolute inset-y-0"
          style={{
            left: scaled(WEEKLY_RANGE.min),
            width: `calc(${scaled(WEEKLY_RANGE.max)} - ${scaled(WEEKLY_RANGE.min)})`,
            background: RANGE_BAND,
          }}
        />
      </span>
      {[WEEKLY_RANGE.min, WEEKLY_RANGE.max].map((value) => (
        <span key={value} className="absolute -inset-y-1 w-px -translate-x-1/2 bg-muted" style={{ left: scaled(value) }} />
      ))}
      {sets > 0 && (
        <span
          className="absolute inset-y-0 left-0 rounded-[2px]"
          style={{ width: scaled(sets), background: FILL[levelOf(sets)] }}
        />
      )}
    </span>
  )
}
