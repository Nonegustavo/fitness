import type { MuscleGroup } from '../../db/types'
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
const FILL: Record<Level, string> = {
  none: 'var(--surface-2)',
  low: `color-mix(in oklab, ${TONE} 30%, var(--surface-2))`,
  some: `color-mix(in oklab, ${TONE} 60%, var(--surface-2))`,
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

type Shape = { muscle: MuscleGroup } & (
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'path'; d: string }
)

/** Both sides of a pair of ellipses, mirrored around the body's center (x = 50). */
const pair = (muscle: MuscleGroup, cx: number, cy: number, rx: number, ry: number): Shape[] => [
  { muscle, kind: 'ellipse', cx, cy, rx, ry },
  { muscle, kind: 'ellipse', cx: 100 - cx, cy, rx, ry },
]

const FRONT: Shape[] = [
  ...pair('shoulders', 31, 46, 7, 6),
  { muscle: 'chest', kind: 'path', d: 'M37 44 Q50 40 63 44 L63 56 Q50 61 37 56 Z' },
  ...pair('biceps', 25, 64, 4.5, 9),
  ...pair('forearms', 21, 86, 4, 10),
  { muscle: 'abs', kind: 'path', d: 'M40 60 Q50 63 60 60 L58 92 Q50 96 42 92 Z' },
  { muscle: 'adductors', kind: 'path', d: 'M46 100 L50 104 L54 100 L52 124 L48 124 Z' },
  ...pair('quads', 41, 122, 6.5, 19),
  ...pair('calves', 41, 166, 4, 13),
]

const BACK: Shape[] = [
  ...pair('shoulders', 31, 46, 7, 6),
  { muscle: 'back', kind: 'path', d: 'M37 42 Q50 38 63 42 L61 74 Q50 84 39 74 Z' },
  ...pair('triceps', 25, 64, 4.5, 9),
  ...pair('forearms', 21, 86, 4, 10),
  ...pair('glutes', 43, 98, 7, 7.5),
  ...pair('hamstrings', 41, 128, 6, 16),
  ...pair('calves', 41, 164, 5, 12),
]

/** Head, hands and feet: the silhouette, never colored. */
const OUTLINE = (
  <g style={{ fill: 'var(--baseline)' }}>
    <circle cx="50" cy="22" r="10" />
    <rect x="46" y="31" width="8" height="8" rx="2" />
    <ellipse cx="19" cy="102" rx="3.5" ry="5" />
    <ellipse cx="81" cy="102" rx="3.5" ry="5" />
    <ellipse cx="41" cy="186" rx="4.5" ry="3" />
    <ellipse cx="59" cy="186" rx="4.5" ry="3" />
  </g>
)

function Figure({ shapes, counts, label }: { shapes: Shape[]; counts: Map<MuscleGroup, number>; label: string }) {
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="8 8 84 186" className="h-56 w-auto" role="img" aria-label={label}>
        {OUTLINE}
        {shapes.map((shape, i) => {
          const sets = counts.get(shape.muscle) ?? 0
          const style = { fill: FILL[levelOf(sets)], stroke: 'var(--surface)', strokeWidth: 0.8 }
          const title = <title>{`${MUSCLES[shape.muscle]}: ${sets} ${sets === 1 ? 'série' : 'séries'}`}</title>
          return shape.kind === 'ellipse' ? (
            <ellipse key={i} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} style={style}>
              {title}
            </ellipse>
          ) : (
            <path key={i} d={shape.d} style={style}>
              {title}
            </path>
          )
        })}
      </svg>
      <figcaption className="text-xs text-muted">{label}</figcaption>
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
      <div className="flex justify-center gap-6">
        <Figure shapes={FRONT} counts={counts} label="Frente" />
        <Figure shapes={BACK} counts={counts} label="Costas" />
      </div>
      <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-ink-2" aria-label="Legenda">
        {LEGEND.map(({ level, label }) => (
          <li key={level} className="flex items-center gap-1">
            <span aria-hidden className="inline-block size-2.5 rounded-[3px]" style={{ background: FILL[level] }} />
            {label}
          </li>
        ))}
        <li className="text-muted">séries na semana</li>
      </ul>
      <ul className="mt-4 space-y-1.5">
        {rows.map(([muscle, sets]) => (
          <li key={muscle} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2 text-sm">
            <span className="truncate text-ink-2">{MUSCLES[muscle]}</span>
            <RangeBar sets={sets} />
            <span className="text-right tabular-nums">{sets}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Sets on a 0–25 scale, with the 10–20 band marked. */
function RangeBar({ sets }: { sets: number }) {
  const scale = WEEKLY_RANGE.max * 1.25
  const pct = (value: number) => `${(Math.min(value, scale) / scale) * 100}%`
  return (
    <span className="relative block h-3 rounded-full bg-surface-2" aria-hidden>
      <span
        className="absolute inset-y-0 rounded-full"
        style={{
          left: pct(WEEKLY_RANGE.min),
          width: `calc(${pct(WEEKLY_RANGE.max)} - ${pct(WEEKLY_RANGE.min)})`,
          background: `color-mix(in oklab, ${TONE} 18%, transparent)`,
        }}
      />
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(sets), background: FILL[levelOf(sets)] }} />
    </span>
  )
}
