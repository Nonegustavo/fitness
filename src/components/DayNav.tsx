import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useEffectEvent } from 'react'
import { formatDay, shiftDay, type DayKey } from '../lib/dates'
import { tapFeedback } from '../lib/haptics'
import { IconButton } from './ui'

/** How far and how fast a sideways swipe must go to change the day. */
const SWIPE = { minPx: 70, maxMs: 600 }

/** Where a swipe belongs to something else: fields, sheets, rows that delete, and anything scrolling sideways. */
function ownsSwipe(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  if (document.querySelector('[role="dialog"]')) return true
  if (target.closest('input, textarea, select, [data-swipe-row], [data-no-day-swipe]')) return true
  for (let element: Element | null = target; element && element !== document.body; element = element.parentElement) {
    const { overflowX } = getComputedStyle(element)
    if ((overflowX === 'auto' || overflowX === 'scroll') && element.scrollWidth > element.clientWidth) return true
  }
  return false
}

/** A quick sideways swipe anywhere on the screen: left for the next day, right for the previous one. */
function useDaySwipe(onSwipe: (direction: -1 | 1) => void) {
  const swiped = useEffectEvent(onSwipe)
  useEffect(() => {
    let start: { x: number; y: number; at: number } | undefined
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      start = event.touches.length === 1 && !ownsSwipe(event.target) ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : undefined
    }
    const onEnd = (event: TouchEvent) => {
      if (!start) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      const quick = Date.now() - start.at < SWIPE.maxMs
      start = undefined
      if (quick && Math.abs(dx) > SWIPE.minPx && Math.abs(dx) > 2 * Math.abs(dy)) swiped(dx < 0 ? 1 : -1)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
    }
  }, [])
}

/**
 * ‹ Hoje › — moves between days, never past today; tapping the label goes back to today. A sideways
 * swipe on the screen does the same as the arrows.
 */
export function DayNav({ date, today, onChange }: { date: DayKey; today: DayKey; onChange: (date: DayKey) => void }) {
  useDaySwipe((direction) => {
    if (direction === 1 && date >= today) return
    tapFeedback()
    onChange(shiftDay(date, direction))
  })
  const label =
    date === today ? 'Hoje' : date === shiftDay(today, -1) ? 'Ontem' : formatDay(date, "EEE, d 'de' MMM")
  return (
    <div className="mb-2 flex items-center justify-between">
      <IconButton label="Dia anterior" onClick={() => onChange(shiftDay(date, -1))}>
        <ChevronLeft size={20} />
      </IconButton>
      <button type="button" className="text-sm font-semibold first-letter:uppercase" onClick={() => onChange(today)}>
        {label}
      </button>
      <IconButton label="Próximo dia" disabled={date >= today} onClick={() => onChange(shiftDay(date, 1))}>
        <ChevronRight size={20} />
      </IconButton>
    </div>
  )
}
