import { RefreshCw } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { tapFeedback } from '../lib/haptics'

/** How far down (after the drag is damped) the page must be pulled to refresh. */
const TRIGGER_PX = 64
const MAX_PX = 96

/**
 * Pulling the page down from its top runs `onRefresh` (a sync), with a spinner showing meanwhile.
 * Touch only: on the computer there's the sync button in the sidebar.
 */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: ReactNode }) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const start = useRef<{ x: number; y: number } | undefined>(undefined)
  const distance = useRef(0)
  const refresh = useEffectEvent(async () => {
    setBusy(true)
    setPull(TRIGGER_PX * 0.75)
    tapFeedback()
    try {
      await onRefresh()
    } finally {
      setBusy(false)
      setPull(0)
    }
  })
  const isBusy = useEffectEvent(() => busy)

  useEffect(() => {
    const onStart = (event: TouchEvent) => {
      const atTop = window.scrollY <= 0 && event.touches.length === 1 && !document.querySelector('[role="dialog"]')
      const touch = event.touches[0]
      start.current = atTop && !isBusy() ? { x: touch.clientX, y: touch.clientY } : undefined
      distance.current = 0
    }
    const onMove = (event: TouchEvent) => {
      if (start.current === undefined) return
      const dx = event.touches[0].clientX - start.current.x
      const dy = event.touches[0].clientY - start.current.y
      // A sideways gesture (the "Em foco" carousel, a row to delete) isn't a pull.
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        start.current = undefined
        distance.current = 0
        setPull(0)
        return
      }
      // Half the finger's travel, so it feels like pulling something with a little weight.
      distance.current = dy > 0 && window.scrollY <= 0 ? Math.min(MAX_PX, dy * 0.5) : 0
      setPull(distance.current)
    }
    const onEnd = () => {
      if (start.current === undefined) return
      start.current = undefined
      if (distance.current >= TRIGGER_PX) void refresh()
      else setPull(0)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [])

  const ready = pull >= TRIGGER_PX
  return (
    <>
      <div
        aria-live="polite"
        className="flex items-start justify-center overflow-hidden transition-[height] duration-200 ease-out"
        style={{ height: pull }}
      >
        {(pull > 8 || busy) && (
          <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs text-ink-2">
            <RefreshCw
              size={14}
              className={busy ? 'animate-spin' : undefined}
              style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }}
            />
            {busy ? 'Atualizando…' : ready ? 'Solte para atualizar' : 'Puxe para atualizar'}
          </span>
        )}
      </div>
      {children}
    </>
  )
}
