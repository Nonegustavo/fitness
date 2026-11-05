import type { Table } from 'dexie'
import { Trash2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { remove, restore } from '../db/repo'
import type { Synced } from '../db/types'
import { useToast } from './Toast'
import { cx } from './ui'

/** Deletes a row at once and offers "Desfazer" for a few seconds, instead of asking first. */
export function useRemoveWithUndo() {
  const toast = useToast()
  return <T extends Synced>(table: Table<T, string>, id: string, message: string) =>
    void remove(table, id).then(() =>
      toast({ message, action: { label: 'Desfazer', onClick: () => void restore(table, id) } }),
    )
}

/** How far the row must travel, as a share of its width, to delete. */
const THRESHOLD = 0.35

interface Gesture {
  pointer: number
  x: number
  y: number
  width: number
}

/**
 * A row that slides left under the finger (or the mouse) and deletes past a third of its width.
 * Up and down still scroll the page. The caller deletes and offers the undo.
 */
export function SwipeToDelete({
  onDelete,
  children,
  as: Row = 'li',
  className,
}: {
  onDelete: () => void
  children: ReactNode
  as?: 'li' | 'div'
  className?: string
}) {
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const gesture = useRef<Gesture | null>(null)
  // A swipe ends with a click on whatever was under the pointer; that click is swallowed.
  const swallowClick = useRef(false)

  function settle(release: boolean) {
    const start = gesture.current
    gesture.current = null
    setSwiping(false)
    if (release && start && -offset > start.width * THRESHOLD) {
      setOffset(-start.width)
      setTimeout(onDelete, 180)
    } else {
      setOffset(0)
    }
  }

  return (
    // data-swipe-row: a sideways swipe here deletes, it doesn't change the day.
    <Row data-swipe-row className={cx('relative overflow-hidden', className)}>
      <div
        aria-hidden
        className={cx(
          'absolute inset-0 flex items-center justify-end bg-critical px-5 text-white',
          offset === 0 && 'invisible',
        )}
      >
        <Trash2 size={18} />
      </div>
      <div
        style={{ transform: `translateX(${offset}px)`, transition: swiping ? 'none' : 'transform 180ms ease-out' }}
        className="relative touch-pan-y bg-surface"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          gesture.current = {
            pointer: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            width: event.currentTarget.offsetWidth,
          }
        }}
        onPointerMove={(event) => {
          const start = gesture.current
          if (!start || start.pointer !== event.pointerId) return
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (!swiping) {
            // Mostly up or down is a scroll; mostly left is a swipe.
            if (Math.abs(dy) > 10) gesture.current = null
            if (Math.abs(dy) > 10 || dx > -10 || Math.abs(dx) < Math.abs(dy) * 1.5) return
            try {
              // Keeps the moves coming when the finger leaves the row.
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              // The pointer is already gone; the swipe still follows the moves that arrive.
            }
            swallowClick.current = true
            setSwiping(true)
          }
          setOffset(Math.min(0, dx))
        }}
        onPointerUp={() => gesture.current && settle(swiping)}
        onPointerCancel={() => settle(false)}
        onClickCapture={(event) => {
          if (!swallowClick.current) return
          swallowClick.current = false
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        {children}
      </div>
    </Row>
  )
}
