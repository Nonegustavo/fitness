import { Play, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cx } from '../../components/ui'
import { formatClock } from '../../lib/format'
import { clockSec, type SetTimer } from './setTimer'

/** ▶ times the set; ■ stops it early. */
export function SetTimerButton({
  running,
  label,
  onStart,
  onStop,
}: {
  running: boolean
  /** The set's label ("1", "A"). */
  label: string
  onStart: () => void
  onStop: () => void
}) {
  const name = running ? `Parar o tempo da série ${label}` : `Cronometrar a série ${label}`
  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      onClick={running ? onStop : onStart}
      className={cx(
        'flex size-10 items-center justify-center rounded-lg transition active:scale-90',
        running ? 'bg-accent text-white' : 'bg-surface-2 text-accent-ink hover:brightness-110',
      )}
    >
      {running ? <Square size={14} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
    </button>
  )
}

/**
 * The running set's clock, in place of its time field (and as tall, so the row keeps its height):
 * what's left of the countdown, or the time so far.
 */
export function SetTimerClock({ timer, label }: { timer: SetTimer; label: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick)
  }, [])
  const up = timer.targetSec === undefined
  return (
    <div
      role="timer"
      aria-label={`${up ? 'Tempo da série' : 'Tempo restante da série'} ${label}`}
      className="flex h-11 items-center justify-center rounded-xl border border-accent-ink bg-accent/10 font-semibold text-accent-ink tabular-nums"
    >
      {up && <span className="mr-0.5 text-xs font-normal" aria-hidden>↑</span>}
      {formatClock(clockSec(timer, now))}
    </div>
  )
}
