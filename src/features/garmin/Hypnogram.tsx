import { useContext, useMemo, useRef, useState, type CSSProperties } from 'react'
import { CardFill, cx } from '../../components/ui'
import type { SleepStage, SleepStageSpan } from '../../db/types'
import { formatTime } from '../../lib/dates'
import { STAGE_CLASS } from './recovery'
import { describeNight, hourMarks, MIN_PX, spanAt, spanLength, STAGE_LABEL, STAGE_LEVEL, TOP_LEVEL } from './stageChart'

/** The levels top to bottom, as the labels stack beside the chart. */
const LEVELS: SleepStage[] = ['awake', 'rem', 'light', 'deep']

/** Hour numbers this close to an end (in % of the width) would be cut by the edge. */
const EDGE = 6

/**
 * The night as steps (from Health Connect): each stretch is a block rising from the baseline to its
 * stage's level, deep sleep the lowest and awake the highest, so every change of stage reads as a step.
 * Fills the width it's given; `height` is the plot's. Hovering or tapping a block tells its stage and times.
 */
export function Hypnogram({ spans, height }: { spans: SleepStageSpan[]; height?: number }) {
  // In a card of fixed height (Hoje's "Em foco"), shorter, so the whole chart fits without scrolling.
  const fill = useContext(CardFill)
  const plotHeight = height ?? (fill ? 76 : 112)
  const night = useMemo(() => spans.filter((span) => span.end > span.start).sort((a, b) => a.start - b.start), [spans])
  // Lower steps first: a short awakening drawn wider than it lasted covers its neighbors, not the other way round.
  const painted = useMemo(() => [...night].sort((a, b) => STAGE_LEVEL[a.stage] - STAGE_LEVEL[b.stage] || a.start - b.start), [night])
  const plot = useRef<HTMLDivElement>(null)
  const pointer = useRef('mouse')
  const [picked, setPicked] = useState<SleepStageSpan>()
  // Another night in the same place (the Sono page's arrows) starts with nothing picked.
  const selected = picked && night.includes(picked) ? picked : undefined
  if (night.length === 0) return null
  const start = night[0].start
  const end = Math.max(...night.map((span) => span.end))
  const length = end - start
  if (length <= 0) return null
  const x = (time: number) => ((time - start) / length) * 100

  function blockStyle(span: SleepStageSpan): CSSProperties {
    const left = x(span.start)
    const width = x(span.end) - left
    const drawn = `max(${width}%, ${MIN_PX[span.stage]}px)`
    // Centered on the stretch when drawn wider; half a pixel more so neighbors never leave a hairline between them.
    return {
      left: `calc(${left + width / 2}% - ${drawn} / 2)`,
      width: `calc(${drawn} + 0.5px)`,
      height: `${(STAGE_LEVEL[span.stage] / TOP_LEVEL) * 100}%`,
    }
  }

  function spanUnder(clientX: number): SleepStageSpan | undefined {
    const box = plot.current?.getBoundingClientRect()
    if (!box || box.width === 0) return undefined
    const msPerPx = length / box.width
    return spanAt(night, start + (clientX - box.left) * msPerPx, (stage) => MIN_PX[stage] * msPerPx)
  }

  const marks = hourMarks(start, end)

  return (
    // Room on top for the "Acordado" label, which is centered on the top line.
    <figure className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 pt-3 select-none">
      <div aria-hidden className="grid grid-rows-4 text-xs leading-none" style={{ height: plotHeight }}>
        {LEVELS.map((stage) => (
          <span key={stage} className={cx('-translate-y-1/2 self-start', selected?.stage === stage ? 'font-semibold text-ink' : 'text-ink-2')}>
            {STAGE_LABEL[stage]}
          </span>
        ))}
      </div>
      <div
        ref={plot}
        role="img"
        aria-label={describeNight(night)}
        className="relative border-b border-baseline"
        style={{ height: plotHeight }}
        onPointerDown={(event) => (pointer.current = event.pointerType)}
        onPointerMove={(event) => event.pointerType === 'mouse' && setPicked(spanUnder(event.clientX))}
        onPointerLeave={(event) => event.pointerType === 'mouse' && setPicked(undefined)}
        onClick={(event) => {
          // A tap shows a stretch and a second tap on it hides it; the mouse shows it by hovering.
          if (pointer.current === 'mouse') return
          const span = spanUnder(event.clientX)
          setPicked(span === selected ? undefined : span)
        }}
      >
        {/* Each level's line, level with the top of its blocks and behind them. */}
        {LEVELS.map((stage) => (
          <span
            key={stage}
            className="absolute inset-x-0 border-t border-line"
            style={{ bottom: `calc(${(STAGE_LEVEL[stage] / TOP_LEVEL) * 100}% - 1px)` }}
          />
        ))}
        {painted.map((span) => (
          // An opaque base under the stage's color, so the lighter stages don't show the guide lines through.
          <span key={`${span.start}:${span.stage}`} className="absolute bottom-0 bg-surface" style={blockStyle(span)}>
            <span
              className={cx('absolute inset-0 transition-opacity', STAGE_CLASS[span.stage], selected && selected !== span && 'opacity-35')}
            />
          </span>
        ))}
      </div>

      <span />
      <div aria-hidden className="relative h-5 text-[11px] leading-none text-muted tabular-nums">
        {marks.map((mark) => (
          <span
            key={mark.time}
            className="absolute top-1 size-[3px] -translate-x-1/2 rounded-full bg-muted"
            style={{ left: `${x(mark.time)}%` }}
          />
        ))}
        {marks
          .filter((mark) => mark.labeled && x(mark.time) > EDGE && x(mark.time) < 100 - EDGE)
          .map((mark) => (
            <span key={mark.time} className="absolute top-2.5 -translate-x-1/2" style={{ left: `${x(mark.time)}%` }}>
              {mark.hour}h
            </span>
          ))}
      </div>

      <span />
      {/* Under the plot only, so the times line up with its ends; a picked stretch takes their place. */}
      <figcaption className="mt-1 text-xs tabular-nums">
        {selected ? (
          <p className="text-center">
            <span className="font-medium">{STAGE_LABEL[selected.stage]}</span>{' '}
            <span className="text-ink-2">
              {formatTime(selected.start)}–{formatTime(selected.end)} · {spanLength(selected)}
            </span>
          </p>
        ) : (
          <p className="flex justify-between gap-2">
            <span>
              <span className="text-muted">Início </span>
              {formatTime(start)}
            </span>
            <span>
              <span className="text-muted">Despertar </span>
              {formatTime(end)}
            </span>
          </p>
        )}
      </figcaption>
    </figure>
  )
}
