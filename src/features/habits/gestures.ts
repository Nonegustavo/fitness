import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { tapFeedback } from '../../lib/haptics'

export const LONG_PRESS_MS = 500
/** A finger that moves this much is scrolling, not pressing. */
const MOVE_PX = 10

interface PointerLike {
  button: number
  pointerType: string
  clientX: number
  clientY: number
}

interface Cancelable {
  preventDefault: () => void
}

/**
 * The handlers of a long press (a right click and the menu key too): `onLongPress` runs, and the
 * click that ends the press is swallowed so it doesn't also toggle what's under the finger.
 *
 * The phone's own long press (contextmenu, at the delay set in Android) opens at once. A finger held
 * past our delay before that opens on release instead, with the touch's click cancelled: opened
 * while still held, the release could tap whatever the sheet put under it. A mouse opens on time.
 */
export function longPressHandlers(onLongPress: () => void, feedback: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let start: { x: number; y: number } | undefined
  let phase: 'idle' | 'pressing' | 'armed' | 'fired' = 'idle'

  const cancel = () => {
    clearTimeout(timer)
    start = undefined
    if (phase !== 'fired') phase = 'idle'
  }
  const fire = (buzz = true) => {
    cancel()
    phase = 'fired'
    if (buzz) feedback()
    onLongPress()
  }

  return {
    onPointerDown: (event: PointerLike) => {
      clearTimeout(timer)
      phase = 'idle'
      if (event.button !== 0) return
      phase = 'pressing'
      start = { x: event.clientX, y: event.clientY }
      const mouse = event.pointerType === 'mouse'
      timer = setTimeout(() => {
        if (mouse) return fire()
        phase = 'armed'
        feedback()
      }, LONG_PRESS_MS)
    },
    onPointerMove: (event: PointerLike) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_PX) cancel()
    },
    onPointerUp: () => {
      if (phase !== 'armed') cancel()
    },
    onPointerCancel: cancel,
    // A finger leaves on release too, before its touchend: only the mouse leaving cancels.
    onPointerLeave: (event: PointerLike) => {
      if (event.pointerType === 'mouse') cancel()
    },
    onTouchEnd: (event: Cancelable) => {
      if (phase !== 'armed') return
      event.preventDefault()
      fire(false)
    },
    onContextMenu: (event: Cancelable) => {
      event.preventDefault()
      if (phase !== 'fired') fire()
    },
    onClickCapture: (event: Cancelable & { stopPropagation: () => void }) => {
      if (phase !== 'fired') return
      phase = 'idle'
      event.preventDefault()
      event.stopPropagation()
    },
    onKeyDown: () => {
      phase = 'idle'
    },
  }
}

/** `longPressHandlers` for an element, kept across renders and always calling the latest `onLongPress`. */
export function useLongPress(onLongPress: () => void): ReturnType<typeof longPressHandlers> {
  const latest = useRef(onLongPress)
  useLayoutEffect(() => {
    latest.current = onLongPress
  })
  const [handlers] = useState(() => longPressHandlers(() => latest.current(), tapFeedback))
  // A press still running when the element goes away mustn't open anything.
  useEffect(() => () => handlers.onPointerCancel(), [handlers])
  return handlers
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Slides the items of a list from where they were to their new places when `order` changes (FLIP),
 * if `animate`: for a change the user made in the list. A new day, or data arriving, puts them in
 * place at once. Put `itemRef(id)` on each item, inside a positioned container: places are read
 * relative to it, so scrolling in between doesn't count as moving.
 */
export function useReorderMotion(order: string[], animate: boolean): (id: string) => (node: HTMLElement | null) => void {
  const nodes = useRef(new Map<string, HTMLElement>())
  const places = useRef(new Map<string, { x: number; y: number }>())
  const refs = useRef(new Map<string, (node: HTMLElement | null) => void>())
  const key = order.join('\n')
  const lastKey = useRef(key)

  // Every render takes note of the places; only a new order animates.
  useLayoutEffect(() => {
    const moved = lastKey.current !== key && animate && !reducedMotion()
    lastKey.current = key
    const next = new Map<string, { x: number; y: number }>()
    for (const [id, node] of nodes.current) {
      const place = { x: node.offsetLeft, y: node.offsetTop }
      next.set(id, place)
      const before = places.current.get(id)
      if (!moved || !before || (before.x === place.x && before.y === place.y)) continue
      node.animate([{ transform: `translate(${before.x - place.x}px, ${before.y - place.y}px)` }, { transform: 'none' }], {
        duration: 320,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      })
    }
    places.current = next
  })

  return (id) => {
    let ref = refs.current.get(id)
    if (!ref) {
      ref = (node) => {
        if (node) nodes.current.set(id, node)
        else nodes.current.delete(id)
      }
      refs.current.set(id, ref)
    }
    return ref
  }
}
