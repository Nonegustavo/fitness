import type { SleepStage, SleepStageSpan } from '../../db/types'
import { formatTime } from '../../lib/dates'
import { formatDuration } from '../../lib/format'

/** How high each stage's step reaches, in levels of the chart: deep sleep the lowest, awake the highest. */
export const STAGE_LEVEL: Record<SleepStage, number> = { deep: 1, light: 2, rem: 3, awake: 4 }
export const TOP_LEVEL = 4

export const STAGE_LABEL: Record<SleepStage, string> = { awake: 'Acordado', rem: 'REM', light: 'Leve', deep: 'Profundo' }

/**
 * The narrowest a stretch is drawn, in pixels: a minute is about half a pixel on a phone, and a short
 * awakening is what the chart must not lose.
 */
export const MIN_PX: Record<SleepStage, number> = { awake: 3, rem: 2, light: 2, deep: 2 }

const HOUR = 3_600_000

export interface HourMark {
  time: number
  /** The local hour, 0–23. */
  hour: number
  /** Every other hour (the even ones) carries its number. */
  labeled: boolean
}

/** The full local hours strictly inside the night, for the marks along the time axis. */
export function hourMarks(start: number, end: number): HourMark[] {
  const first = new Date(start)
  first.setMinutes(0, 0, 0)
  // Whole-hour steps stay on the hour across a daylight saving change, which moves the clock a whole hour.
  const marks: HourMark[] = []
  for (let time = first.getTime() + HOUR; time < end; time += HOUR) {
    const hour = new Date(time).getHours()
    marks.push({ time, hour, labeled: hour % 2 === 0 })
  }
  return marks
}

/**
 * The stretch drawn at `time`. Stretches narrower than their minimum (`minMs`, the minimum width in
 * time) are drawn wider around their middle, and taller steps are painted over lower ones, so where
 * they overlap the taller one is what shows, and what a tap picks.
 */
export function spanAt(
  spans: SleepStageSpan[],
  time: number,
  minMs: (stage: SleepStage) => number,
): SleepStageSpan | undefined {
  let found: SleepStageSpan | undefined
  for (const span of spans) {
    const half = Math.max(span.end - span.start, minMs(span.stage)) / 2
    if (Math.abs(time - (span.start + span.end) / 2) > half) continue
    if (!found || STAGE_LEVEL[span.stage] >= STAGE_LEVEL[found.stage]) found = span
  }
  return found
}

const DESCRIBED: SleepStage[] = ['deep', 'light', 'rem', 'awake']

/** "1 min" for a stretch, and "menos de 1 min" for the shortest ones. */
export const spanLength = (span: SleepStageSpan): string =>
  span.end - span.start < 60_000 ? 'menos de 1 min' : formatDuration(span.end - span.start)

/** The night in words, for screen readers: when, how long in each stage, and how many times awake in the middle. */
export function describeNight(spans: SleepStageSpan[]): string {
  if (spans.length === 0) return 'Fases do sono'
  const start = Math.min(...spans.map((span) => span.start))
  const end = Math.max(...spans.map((span) => span.end))
  const parts = DESCRIBED.flatMap((stage) => {
    const ms = spans.filter((span) => span.stage === stage).reduce((sum, span) => sum + span.end - span.start, 0)
    const name = stage === 'rem' ? STAGE_LABEL.rem : STAGE_LABEL[stage].toLowerCase()
    return ms > 0 ? [`${name} ${formatDuration(ms)}`] : []
  })
  // Awake at the very start or end is falling asleep and getting up, not waking in the night.
  const ordered = [...spans].sort((a, b) => a.start - b.start)
  const woke = ordered.filter((span, i) => span.stage === 'awake' && i > 0 && i < ordered.length - 1).length
  const times = woke === 0 ? '' : `; acordou ${woke} ${woke === 1 ? 'vez' : 'vezes'} no meio da noite`
  return `Fases do sono, das ${formatTime(start)} às ${formatTime(end)}: ${parts.join(', ')}${times}`
}
