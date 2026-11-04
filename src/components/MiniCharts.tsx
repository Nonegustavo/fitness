import { cx } from './ui'

/**
 * Small bars for a card (weeks of running, days of steps), drawn with plain elements so the Hoje
 * screen doesn't load the chart library. The last bar, or `highlight`, is the strong one.
 */
export function MiniBars({
  values,
  color,
  highlight = values.length - 1,
  marker,
  label,
  className,
}: {
  values: number[]
  color: string
  highlight?: number
  /** A level to mark across the bars (an average, a goal). */
  marker?: number
  /** What the bars show, for screen readers. */
  label: string
  className?: string
}) {
  const max = Math.max(...values, marker ?? 0, 1)
  return (
    <div role="img" aria-label={label} className={cx('relative flex items-end gap-[3px]', className ?? 'h-16')}>
      {values.map((value, i) => (
        <span
          key={i}
          className="min-w-0 flex-1 rounded-t-[3px]"
          style={{
            height: `${Math.max(value > 0 ? 6 : 2, (value / max) * 100)}%`,
            background: value > 0 ? color : 'var(--line)',
            opacity: value > 0 ? (i === highlight ? 1 : 0.45) : 1,
          }}
        />
      ))}
      {marker !== undefined && marker > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-2/60"
          style={{ bottom: `${(marker / max) * 100}%` }}
        />
      )}
    </div>
  )
}

/** Bars from a low to a high value for each day (Body Battery's range). */
export function RangeBars({
  ranges,
  color,
  max = 100,
  label,
}: {
  ranges: ({ low: number; high: number } | undefined)[]
  color: string
  max?: number
  label: string
}) {
  return (
    <div role="img" aria-label={label} className="flex h-16 items-stretch gap-1">
      {ranges.map((range, i) => (
        <span key={i} className="relative min-w-0 flex-1 rounded-[3px] bg-surface-2">
          {range && (
            <span
              className="absolute inset-x-0 rounded-[3px]"
              style={{
                bottom: `${(range.low / max) * 100}%`,
                height: `${Math.max(4, ((range.high - range.low) / max) * 100)}%`,
                background: color,
                opacity: i === ranges.length - 1 ? 1 : 0.55,
              }}
            />
          )}
        </span>
      ))}
    </div>
  )
}

/**
 * A line over days or weeks, with gaps where a value is missing and an optional band (HRV's
 * balanced range). `invert` puts lower values on top (a faster pace).
 */
export function Sparkline({
  values,
  color,
  band,
  invert = false,
  label,
  height = 64,
}: {
  values: (number | undefined)[]
  color: string
  band?: { low: number; high: number }
  invert?: boolean
  label: string
  height?: number
}) {
  const known = values.filter((value): value is number => value !== undefined)
  if (known.length < 2) return null
  const min = Math.min(...known, band?.low ?? Infinity)
  const max = Math.max(...known, band?.high ?? -Infinity)
  const span = max - min || 1
  const width = 100
  const x = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * width)
  // 8% of room above and below, so the line and its dots aren't cut.
  const y = (value: number) => {
    const share = (value - min) / span
    return 8 + (invert ? share : 1 - share) * 84
  }
  const segments: string[] = []
  let current = ''
  values.forEach((value, i) => {
    if (value === undefined) {
      if (current) segments.push(current)
      current = ''
      return
    }
    current += `${current ? 'L' : 'M'}${x(i).toFixed(2)},${y(value).toFixed(2)}`
  })
  if (current) segments.push(current)
  const lastIndex = values.findLastIndex((value) => value !== undefined)
  return (
    <div role="img" aria-label={label} className="relative w-full" style={{ height }}>
      <svg aria-hidden viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" className="absolute inset-0 size-full">
        {band && (
          <rect
            x={0}
            width={width}
            y={Math.min(y(band.low), y(band.high))}
            height={Math.abs(y(band.high) - y(band.low))}
            fill={color}
            opacity={0.12}
          />
        )}
        {segments.map((d) => (
          <path key={d} d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}
      </svg>
      {/* The latest value as a round dot (inside the stretched drawing it would turn oval). */}
      <span
        aria-hidden
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${x(lastIndex)}%`, top: `${y(values[lastIndex]!)}%`, background: color }}
      />
    </div>
  )
}
