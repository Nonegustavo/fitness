import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { formatClock } from '../../lib/format'
import { addRest, alertRestOver, stopRest, useRestTimer } from './restTimer'

/** Floating countdown between sets, visible on every screen while it runs. */
export function RestTimerBar() {
  const timer = useRestTimer()
  const [now, setNow] = useState(() => Date.now())
  const alertedFor = useRef<number | null>(null)

  useEffect(() => {
    if (!timer) return
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick)
  }, [timer])

  const remainingSec = timer ? Math.ceil((timer.endsAt - now) / 1000) : 0
  const over = !!timer && remainingSec <= 0

  useEffect(() => {
    if (!timer || !over || alertedFor.current === timer.endsAt) return
    alertedFor.current = timer.endsAt
    alertRestOver()
    const hide = setTimeout(stopRest, 4000)
    return () => clearTimeout(hide)
  }, [timer, over])

  if (!timer) return null
  const progress = Math.min(Math.max(1 - (timer.endsAt - now) / (timer.totalSec * 1000), 0), 1)

  return (
    <div
      role="timer"
      aria-label="Descanso"
      className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-lg lg:right-6 lg:bottom-6 lg:left-auto lg:mx-0 lg:w-96"
    >
      <div className="h-1 bg-accent/20">
        <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="flex items-center gap-1 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-ink-2">{over ? 'Descanso terminado' : `Descanso · ${timer.label}`}</p>
          <p className="text-2xl font-semibold tabular-nums">{over ? 'Próxima série' : formatClock(remainingSec)}</p>
        </div>
        {!over && (
          <>
            <Button size="sm" variant="ghost" onClick={() => addRest(-15)}>
              −15s
            </Button>
            <Button size="sm" variant="ghost" onClick={() => addRest(15)}>
              +15s
            </Button>
          </>
        )}
        <Button size="sm" onClick={stopRest}>
          {over ? 'Ok' : 'Pular'}
        </Button>
      </div>
    </div>
  )
}
