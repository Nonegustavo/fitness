import { useLayoutEffect, useState, type RefObject } from 'react'

/** The longest a screen waits, hidden, for its data before it comes in with what it has. */
const REVEAL_WAIT_MS = 600

/** What marks a part of a screen still loading: the skeletons, and `Pending` where nothing shows meanwhile. */
const LOADING = '[data-loading]'

/**
 * Whether a screen may come in: as soon as nothing in it is loading, or after REVEAL_WAIT_MS with
 * whatever still is (data that slow keeps its skeleton). Until then the screen stays hidden, so its
 * cards don't pop in one by one as their queries come back; from then on it stays shown.
 */
export function useReveal(ref: RefObject<HTMLElement | null>): boolean {
  const [shown, setShown] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (shown || !element) return
    // A screen with nothing to load comes in at its first paint.
    if (!element.querySelector(LOADING)) {
      setShown(true)
      return
    }
    const show = () => setShown(true)
    const observer = new MutationObserver(() => {
      if (!element.querySelector(LOADING)) show()
    })
    observer.observe(element, { childList: true, subtree: true })
    const timer = setTimeout(show, REVEAL_WAIT_MS)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [ref, shown])
  return shown
}
