import { createContext, startTransition, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { tapFeedback } from '../lib/haptics'
import { lockOf, pageSlots, releaseTarget, rubberBand, settleMs, velocityOf, type Sample, type Side } from './swipe'
import { cx } from './ui'

/** True inside a pager's pages: a DayNav there leaves the swiping to the pager. */
export const InPager = createContext(false)

/** Where a drag is going, for a tab bar's pill to follow. */
export interface PagerDrag<K extends string> {
  /** The page it moves toward; undefined when it heads back (or there's no page that way). */
  to: K | undefined
  /** How far: 0 on the current page, 1 on the other. */
  fraction: number
  /** Let go: the rest of the way takes this long. */
  settleMs?: number
}

/** Passes a pager's drags on to whoever listens (a tab bar's pill). */
export function dragFeed<K extends string>() {
  const listeners = new Set<(drag: PagerDrag<K>) => void>()
  return {
    emit: (drag: PagerDrag<K>) => listeners.forEach((listener) => listener(drag)),
    subscribe: (listener: (drag: PagerDrag<K>) => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

const SLIDE_MS = 260
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
/** Back into place with a hint of bounce. */
const SPRING_BACK = 'cubic-bezier(0.3, 1.3, 0.5, 1)'
const SPRING_BACK_MS = 300

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const translate = (x: number) => `translate3d(${x}px, 0, 0)`

/**
 * A neighbor drawn ahead, at rest: out of sight, and no taller than the page shown, so the screen
 * doesn't scroll on into it.
 */
const READY_STYLE = { visibility: 'hidden', bottom: 0, overflow: 'hidden' } as const
/** How long after the last touch the neighbors may be drawn: not while the finger is busy. */
const QUIET_MS = 600

/** When the browser has nothing else to do (or soon, where it can't tell). */
function whenIdle(run: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const id = requestIdleCallback(run, { timeout: 2000 })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(run, 300)
  return () => clearTimeout(id)
}

/** What owns a sideways drag itself: fields, rows that delete, charts (their tooltip follows the finger). */
const OWNS_SWIPE = 'input, textarea, select, [contenteditable], [data-swipe-row], [data-no-swipe], [data-no-day-swipe], [_echarts_instance_]'

/**
 * Outside the pager, where a screen-wide one still takes a drag: the screen's own content (its title,
 * the cards around the pager) and the empty background under it. Not the bars and buttons on top of
 * the screen, nor its sheets.
 */
const onScreen = (target: Element) =>
  !!target.closest('main') || target.hasAttribute('data-screen') || target === document.body || target === document.documentElement

function ownsSwipe(target: EventTarget | null, pager: HTMLElement, anywhere: boolean): boolean {
  if (!(target instanceof Element)) return true
  if (document.querySelector('[role="dialog"]')) return true
  if (target.closest(OWNS_SWIPE)) return true
  // A pager inside this one moves its own pages; outside any pager, only a screen-wide one takes it.
  const inPager = target.closest('[data-pager]')
  if (inPager !== pager && !(anywhere && inPager === null && onScreen(target))) return true
  // So does anything scrolling sideways.
  for (let element: Element | null = target; element && element !== pager; element = element.parentElement) {
    const { overflowX } = getComputedStyle(element)
    if ((overflowX === 'auto' || overflowX === 'scroll') && element.scrollWidth > element.clientWidth) return true
  }
  return false
}

interface View<K> {
  /** The page shown. Right after a drag it leads `value`, until the parent catches up. */
  shown: K
  /** The last `value` seen, to notice a new one. */
  seen: K
  /**
   * The pages our drags went to that haven't come back as `value` yet, oldest first: one coming back
   * after a newer drag went on is already behind, not a page to slide to.
   */
  told?: K[]
  /** The other page on screen: the neighbor a drag pulls in, or the page sliding out. */
  other?: { key: K; side: Side }
  /** A new `value` from outside slides in from this side. */
  slide?: { from: Side; id: number }
}

interface Drag<K> {
  pointer: number
  x0: number
  y0: number
  locked: boolean
  width: number
  /** From one page to the next: the width plus the gap between them. */
  step: number
  /** The page the drag pulls in, and from which side; undefined key past the last page. */
  toward?: { key: K | undefined; side: Side }
  samples: Sample[]
}

interface Motion<K> {
  /** Where the pages are, when no animation runs. */
  offset: number
  drag?: Drag<K>
  animation?: Animation
  /** What the running animation does when it ends. */
  done?: () => void
  /** A drag ends with a click on whatever was under the finger; clicks until then are swallowed. */
  swallowUntil: number
  /** The last touch on the screen (pointer down or move), so the neighbors are drawn when it's quiet. */
  touchedAt: number
}

/**
 * Pages side by side, one shown at a time: a sideways drag moves the page with the finger (vertical
 * scrolling stays the browser's), and the next or previous one comes in from the side; let go past a
 * third of the width or with a flick, it slides into place, else the page springs back. Past the last
 * page the pull is elastic. A new `value` from elsewhere (arrows, a tab, a link) slides in from its
 * side too. `children` draws a page; it runs for the neighbor as well while that one is on screen
 * (inert then), so each page reads its data from its own key.
 *
 * `bleed`: the pages slide out to the edges of the screen's content area instead of stopping at the
 * pager's own edges (off for a pager inside a card).
 *
 * `anywhere` (with `bleed`, by default): a drag that starts outside the pager moves it too, on the
 * screen's title, the cards around it or the empty space under the last one, as long as nothing
 * there moves sideways itself.
 *
 * `ahead`: once the screen is quiet, the page before and the one after are drawn too, out of sight,
 * so a drag only has to show them: nothing to build while the finger moves, and their data is
 * already there.
 */
export function SwipePager<K extends string>({
  value,
  neighbor,
  compare,
  onChange,
  onDrag,
  children,
  className,
  bleed = true,
  anywhere = bleed,
  ahead = false,
}: {
  value: K
  /** The page before (-1) or after (1) one; undefined at an end. */
  neighbor: (key: K, side: Side) => K | undefined
  /** Which of two pages comes first: a new value after the shown one comes in from the right. */
  compare: (a: K, b: K) => number
  onChange: (key: K) => void
  onDrag?: (drag: PagerDrag<K>) => void
  children: (key: K) => ReactNode
  /** For each page (spacing between its cards, say). */
  className?: string
  bleed?: boolean
  anywhere?: boolean
  ahead?: boolean
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const motion = useRef<Motion<K>>({ offset: 0, swallowUntil: 0, touchedAt: 0 })
  const [view, setView] = useState<View<K>>({ shown: value, seen: value })
  /** The pages drawn ahead (`ahead`); only those still next to the page shown are kept. */
  const [ready, setReady] = useState<readonly K[]>([])
  // Each page as `children` drew it, for as long as `children` stays the same: a drag starting, a
  // swap or a page drawn ahead then leaves the other pages as they are instead of drawing them again.
  const drawn = useMemo(() => new Map<K, ReactNode>(), [children])
  const draw = (key: K) => {
    if (!drawn.has(key)) drawn.set(key, children(key))
    return drawn.get(key)
  }
  /** Keeps a page that leaves the screen drawn when it's next to the new one, instead of drawing it again. */
  const keepReady = (key: K) => {
    if (ahead) setReady((keys) => (keys.includes(key) ? keys : [...keys, key]))
  }

  // A new value: one our own drag asked for is already in place (or behind a newer drag); one from
  // elsewhere slides in.
  let current = view
  if (value !== view.seen) {
    const told = view.told ?? []
    if (value === view.shown) current = { ...view, seen: value, told: undefined }
    else if (told.includes(value)) current = { ...view, seen: value, told: told.slice(told.indexOf(value) + 1) }
    else {
      const from: Side = compare(value, view.shown) > 0 ? 1 : -1
      current = { shown: value, seen: value, other: { key: view.shown, side: -from as Side }, slide: { from, id: (view.slide?.id ?? 0) + 1 } }
    }
    setView(current)
  }

  function place(x: number) {
    motion.current.offset = x
    if (track.current) track.current.style.transform = x ? translate(x) : ''
  }

  /** The pages at rest: no offset, no clipping, no layer kept for the motion, the neighbors drawn ahead out of sight. */
  function rest() {
    place(0)
    if (viewport.current) viewport.current.style.clipPath = ''
    if (track.current) track.current.style.willChange = ''
    // As React draws them; a drag may have shown one that React never got to draw as pulled in.
    track.current?.querySelectorAll<HTMLElement>(':scope > [data-ready]').forEach((page) => {
      page.style.visibility = READY_STYLE.visibility
      page.style.bottom = '0'
      page.style.overflow = READY_STYLE.overflow
    })
  }

  /** A neighbor drawn ahead shows at once when a drag pulls it in, before React redraws it as such. */
  function reveal(side: Side) {
    const page = track.current?.querySelector<HTMLElement>(`:scope > [data-ready="${side}"]`)
    if (!page) return
    page.style.visibility = 'visible'
    page.style.bottom = 'auto'
    page.style.overflow = 'visible'
  }

  /** The page's width and the step to the next, after setting the gap and the clipping for the motion. */
  function measure() {
    const element = viewport.current!
    const box = element.getBoundingClientRect()
    let left = 0
    let right = 0
    if (bleed) {
      const area = (element.closest('main') ?? document.documentElement).getBoundingClientRect()
      left = Math.max(0, box.left - area.left)
      right = Math.max(0, area.right - box.right)
    }
    const gap = bleed ? left + right : 16
    element.style.setProperty('--pager-gap', `${gap}px`)
    // Inside a card, a taller neighbor mustn't spill over what comes below the pager. A screen-wide
    // pager holds all of its screen, so there the neighbor shows whole, down past a shorter page.
    element.style.clipPath = `inset(0 ${-right}px ${bleed ? '-100000px' : '0'} ${-left}px)`
    if (track.current) track.current.style.willChange = 'transform'
    return { width: box.width, step: box.width + gap }
  }

  /** Where the pages are mid-animation. */
  const offsetNow = () => (track.current ? new DOMMatrixReadOnly(getComputedStyle(track.current).transform).m41 : 0)

  /** Slides the pages from `from` to `to` on the compositor (smooth while React renders), then `done`. */
  function run(from: number, to: number, ms: number, easing: string, done: () => void) {
    const m = motion.current
    m.animation?.cancel()
    m.animation = undefined
    m.done = undefined
    place(to)
    if (ms <= 0 || !track.current) return done()
    const animation = track.current.animate([{ transform: translate(from) }, { transform: translate(to) }], { duration: ms, easing })
    m.animation = animation
    m.done = done
    animation.onfinish = () => {
      if (m.animation !== animation) return
      m.animation = undefined
      m.done = undefined
      done()
    }
  }

  /** A touch during an animation ends it at once, so the new drag starts from the page it was going to. */
  function fastForward() {
    const m = motion.current
    const { animation, done } = m
    if (!animation) return
    animation.cancel()
    m.animation = undefined
    m.done = undefined
    if (done) flushSync(done)
  }

  const changed = useEffectEvent((key: K) => onChange(key))
  const dragged = useEffectEvent((drag: PagerDrag<K>) => onDrag?.(drag))

  // A page from outside slides in, carrying on from where an unfinished slide had got to.
  useLayoutEffect(() => {
    const m = motion.current
    const slide = current.slide
    if (slide) {
      m.drag = undefined
      const now = m.animation ? offsetNow() : m.offset
      const { step } = measure()
      const id = slide.id
      const leaving = current.other?.key
      run(now + slide.from * step, 0, reducedMotion() ? 0 : SLIDE_MS, EASE_OUT, () => {
        if (leaving !== undefined) keepReady(leaving)
        setView((v) => (v.slide?.id === id ? { shown: v.shown, seen: v.seen, told: v.told } : v))
      })
    } else if (!m.drag && !m.animation) {
      rest()
    }
    // Only a new page or a new slide moves anything.
  }, [current.shown, current.slide?.id])

  const onDown = useEffectEvent((event: PointerEvent) => {
    const m = motion.current
    if (event.pointerType !== 'mouse') m.touchedAt = event.timeStamp
    if (!event.isPrimary || ownsSwipe(event.target, viewport.current!, anywhere)) return
    // A new first finger means the last one is gone: a drag whose release never came puts its page back.
    if (m.drag) {
      const stale = m.drag
      m.drag = undefined
      if (stale.locked && !m.animation) {
        rest()
        setView((v) => ({ shown: v.shown, seen: v.seen, told: v.told }))
      }
    }
    fastForward()
    // The computer has the arrows and the tabs; a mouse drag would fight selecting text.
    if (event.pointerType === 'mouse') return
    m.drag = { pointer: event.pointerId, x0: event.clientX, y0: event.clientY, locked: false, width: 0, step: 0, samples: [] }
  })

  const onMove = useEffectEvent((event: PointerEvent) => {
    const m = motion.current
    if (event.pointerType !== 'mouse') m.touchedAt = event.timeStamp
    const drag = m.drag
    if (!drag || event.pointerId !== drag.pointer) return
    if (!drag.locked) {
      const lock = lockOf(event.clientX - drag.x0, event.clientY - drag.y0)
      if (!lock) return
      if (lock === 'y') {
        m.drag = undefined
        return
      }
      drag.locked = true
      // From here on the page moves with the finger, without jumping by the slop.
      drag.x0 = event.clientX
      Object.assign(drag, measure())
      try {
        viewport.current!.setPointerCapture(drag.pointer)
      } catch {
        // The pointer is gone already; its release still arrives.
      }
    }
    const raw = event.clientX - drag.x0
    const side: Side = raw < 0 ? 1 : -1
    if (raw !== 0 && drag.toward?.side !== side) {
      const shown = current.shown
      const key = neighbor(shown, side)
      drag.toward = { key, side }
      // Drawn as a transition: rendering it mustn't hold the page back from the finger. Unless the
      // page changed meanwhile (a slide from outside), which then keeps its own pages. One drawn
      // ahead is already there, and shows at once.
      if (key !== undefined) {
        reveal(side)
        startTransition(() =>
          setView((v) => (v.shown === shown && !v.slide ? { shown, seen: v.seen, told: v.told, other: { key, side } } : v)),
        )
      }
    }
    const x = drag.toward?.key === undefined ? rubberBand(raw, drag.width) : Math.max(-drag.step, Math.min(drag.step, raw))
    place(x)
    drag.samples.push({ t: event.timeStamp, x })
    if (drag.samples.length > 12) drag.samples.shift()
    dragged({ to: drag.toward?.key, fraction: Math.min(1, Math.abs(x) / drag.step) })
  })

  const onEnd = useEffectEvent((event: PointerEvent, cancelled: boolean) => {
    const m = motion.current
    const drag = m.drag
    if (!drag || event.pointerId !== drag.pointer) return
    m.drag = undefined
    if (!drag.locked) return
    m.swallowUntil = event.timeStamp + 300
    const x = m.offset
    const velocity = velocityOf(drag.samples, event.timeStamp)
    const shown = current.shown
    const can = { [-1]: neighbor(shown, -1) !== undefined, [1]: neighbor(shown, 1) !== undefined } as Record<Side, boolean>
    const side = cancelled ? 0 : releaseTarget(x, velocity, drag.width, can)
    const key = drag.toward?.side === side ? drag.toward.key : undefined
    const reduced = reducedMotion()
    if (side !== 0 && key !== undefined) {
      const to = -side * drag.step
      const ms = reduced ? 0 : settleMs(to - x, velocity)
      dragged({ to: key, fraction: 1, settleMs: ms })
      run(x, to, ms, EASE_OUT, () => {
        tapFeedback()
        // The neighbor is the page now; the pages go back to rest once React has swapped them. The
        // page left behind is the new one's neighbor: it stays drawn. The screen hears of the new
        // page as a transition: what it redraws then mustn't hold up the swap.
        keepReady(shown)
        setView((v) => ({ shown: key, seen: v.seen, told: [...(v.told ?? []), key] }))
        startTransition(() => changed(key))
      })
    } else {
      const ms = reduced ? 0 : SPRING_BACK_MS
      dragged({ to: undefined, fraction: 0, settleMs: ms })
      run(x, 0, ms, SPRING_BACK, () => {
        rest()
        setView((v) => ({ shown: v.shown, seen: v.seen, told: v.told }))
      })
    }
  })

  useEffect(() => {
    const element = viewport.current!
    // A screen-wide pager listens on the whole document, so a drag from outside it reaches it too
    // (its moves come from wherever the finger is until the pager captures them).
    const host: HTMLElement | Document = anywhere ? document : element
    const down = (event: Event) => onDown(event as PointerEvent)
    const move = (event: Event) => onMove(event as PointerEvent)
    const up = (event: Event) => onEnd(event as PointerEvent, false)
    const cancel = (event: Event) => onEnd(event as PointerEvent, true)
    // Only the pager losing its own capture ends the drag: taking it fires one on the element that had it.
    const lost = (event: PointerEvent) => event.target === element && onEnd(event, true)
    const click = (event: Event) => {
      if (event.timeStamp > motion.current.swallowUntil) return
      motion.current.swallowUntil = 0
      event.preventDefault()
      event.stopPropagation()
    }
    host.addEventListener('pointerdown', down)
    host.addEventListener('pointermove', move)
    host.addEventListener('pointerup', up)
    host.addEventListener('pointercancel', cancel)
    element.addEventListener('lostpointercapture', lost)
    host.addEventListener('click', click, true)
    // Up and down stay the browser's scroll across the screen, sideways is the pager's: else a drag
    // starting outside it could be taken as the page's own pan, which cancels the pointer. Rows that
    // scroll sideways still do (the browser's pan stops at the nearest scroller).
    const touchAction = document.body.style.touchAction
    if (anywhere) document.body.style.touchAction = 'pan-y pinch-zoom'
    // A sideways drag is ours to the end: left to the browser, a quick one counted as a fling, and the
    // tap after it only stopped that fling instead of clicking. Each move's pointer event comes first,
    // so the drag is already locked when its touch event arrives. Touches stay with the element they
    // started on, so a drag from outside the pager is only seen on the document.
    const touchMove = (event: Event) => {
      // A scroll's moves come only as touches (the browser takes the pointer): the screen is busy.
      motion.current.touchedAt = event.timeStamp
      if (motion.current.drag?.locked && event.cancelable) event.preventDefault()
    }
    host.addEventListener('touchmove', touchMove, { passive: false })
    return () => {
      host.removeEventListener('touchmove', touchMove)
      host.removeEventListener('pointerdown', down)
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerup', up)
      host.removeEventListener('pointercancel', cancel)
      element.removeEventListener('lostpointercapture', lost)
      host.removeEventListener('click', click, true)
      if (anywhere) document.body.style.touchAction = touchAction
      motion.current.animation?.cancel()
    }
  }, [anywhere])

  // `ahead`: once the page shown has settled and the finger has left the screen for a moment, the
  // pages before and after it are drawn (out of sight), when the browser is idle.
  const settled = !current.other && !current.slide
  const neighbors = useEffectEvent((shown: K) =>
    ([-1, 1] as const).flatMap((side) => {
      const key = neighbor(shown, side)
      return key === undefined ? [] : [key]
    }),
  )
  useEffect(() => {
    if (!ahead || !settled) return
    const shown = current.shown
    let cancel = () => {}
    const wait = () => {
      const id = setTimeout(() => (cancel = whenIdle(draw)), QUIET_MS)
      cancel = () => clearTimeout(id)
    }
    const draw = () => {
      const m = motion.current
      if (m.drag || m.animation || performance.now() - m.touchedAt < QUIET_MS) return wait()
      const keys = neighbors(shown)
      startTransition(() =>
        setReady((now) => (now.length === keys.length && keys.every((key) => now.includes(key)) ? now : keys)),
      )
    }
    wait()
    return () => cancel()
  }, [ahead, settled, current.shown])

  const slots = pageSlots(current.shown, current.other, ahead ? ready : [], neighbor, compare)

  return (
    // pan-y: up and down stay the browser's scroll; sideways comes here.
    <div ref={viewport} data-pager="" className="touch-pan-y touch-pinch-zoom">
      <div ref={track} className="relative">
        {slots.map(({ key, side, ready: drawnAhead }) => (
          <div
            key={key}
            inert={side !== 0}
            data-ready={drawnAhead ? side : undefined}
            className={cx(side !== 0 && 'absolute inset-x-0 top-0', className)}
            style={
              side
                ? { transform: `translateX(calc(${side} * (100% + var(--pager-gap, 2rem))))`, ...(drawnAhead ? READY_STYLE : {}) }
                : undefined
            }
          >
            <InPager value>{draw(key)}</InPager>
          </div>
        ))}
      </div>
    </div>
  )
}
