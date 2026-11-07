import type { LucideIcon } from 'lucide-react'
import {
  Children,
  isValidElement,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { dragFrames, enterFrame, leaveFrame, REST, swipeDirection, swipeEnd, type Frame } from './carouselMotion'
import { toneStyle, type Tone } from './tone'
import { CardFill, cx } from './ui'

/** What the row under the carousel shows for a page: its card's icon and color. */
export interface CarouselTab {
  icon: LucideIcon
  tone: Tone
  label: string
}

const SWITCH_MS = 300
const SWIPE_SETTLE_MS = 220
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
/** A finger has to move this far before it's a swipe (or a scroll of the page). */
const SLOP_PX = 10

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index])
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const shift = (x: number) => `translateX(${x}px)`
const css = ({ x, opacity }: Frame) => ({ transform: shift(x), opacity: String(opacity) })

/** Where a card stands now, mid-animation or mid-swipe included. */
function frameOf(element: HTMLElement): Frame {
  const style = getComputedStyle(element)
  return { x: style.transform === 'none' ? 0 : new DOMMatrixReadOnly(style.transform).m41, opacity: Number(style.opacity) }
}

/** Stops what moves a card (an animation, a swipe's inline style), leaving it at rest. */
function still(element: HTMLElement) {
  for (const animation of element.getAnimations()) animation.cancel()
  if (element.style.transform) element.style.transform = ''
  if (element.style.opacity) element.style.opacity = ''
}

/** A switch on its way to the screen: started by a tap (from rest) or by letting go of a swipe (from where it was). */
interface Switch {
  from: string
  to: string
  direction: 1 | -1
  swiped: boolean
}

/** A finger on the cards: where it started, how far it went sideways and how fast it was going. */
interface Drag {
  pointer: number
  x: number
  y: number
  dx: number
  swiping: boolean
  lastX: number
  lastTime: number
  velocity: number
}

/**
 * Big cards shown one at a time at the full width of the page. Tapping the row underneath switches
 * straight to a card: the one on screen slides out and fades while the new one comes in from the side
 * of its place in the order. A swipe switches too, the card following the finger. With `tabs` (one per
 * child, in the same order) the row has each card's icon; without them, dots. Every card has the same
 * height, and what doesn't fit is cut (CardFill). A child that renders nothing is left out.
 */
export function Carousel({ label, tabs, children }: { label: string; tabs?: CarouselTab[]; children: ReactNode }) {
  const id = useId()
  const stage = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  // The children that came out with something (they show up as their data loads, or not at all).
  const [filled, setFilled] = useState<string[]>([])
  // The card the user went to; until then, the first one.
  const [chosen, setChosen] = useState<string>()
  // The card on its way out after a switch, and the one a swipe is pulling in.
  const [leaving, setLeaving] = useState<string>()
  const [peek, setPeek] = useState<string>()
  const pending = useRef<Switch>(undefined)
  const drag = useRef<Drag>(undefined)
  const swiped = useRef(false)
  const focusTab = useRef<string>(undefined)

  // Each child by its key, so a card keeps its place and state when the order changes (by the hour).
  const items: { key: string; child: ReactNode }[] = []
  Children.forEach(children, (child, index) => {
    items.push({ key: isValidElement(child) && child.key !== null ? String(child.key) : `#${index}`, child })
  })
  const order = items.map((item) => item.key)
  const shown = order.filter((key) => filled.includes(key))
  const current = chosen !== undefined && shown.includes(chosen) ? chosen : shown[0]
  const position = current === undefined ? -1 : shown.indexOf(current)
  const pages = shown.length

  const page = (key: string | undefined) =>
    key === undefined ? null : stage.current?.querySelector<HTMLElement>(`:scope > [data-page="${CSS.escape(key)}"]`)

  useLayoutEffect(() => {
    const element = stage.current
    if (!element) return
    const count = () => {
      const next = [...element.children].flatMap((child) =>
        child instanceof HTMLElement && child.dataset.page && child.childElementCount > 0 ? [child.dataset.page] : [],
      )
      setFilled((previous) => (sameList(previous, next) ? previous : next))
    }
    count()
    const observer = new MutationObserver(count)
    observer.observe(element, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  // A card that's no longer on screen drops whatever was moving it, so it comes back at rest.
  useLayoutEffect(() => {
    for (const child of stage.current?.children ?? []) {
      const key = (child as HTMLElement).dataset.page
      if (key !== current && key !== leaving && key !== peek) still(child as HTMLElement)
    }
  })

  // Plays a switch once both cards are on screen: the old one out, the new one in.
  useLayoutEffect(() => {
    const move = pending.current
    if (!move) return
    pending.current = undefined
    const from = page(move.from)
    const to = page(move.to)
    const width = stage.current?.clientWidth ?? 0
    if (!from || !to || width === 0) return
    // Read where both stand before stopping them, so a swipe or an interrupted switch (even one turned
    // back) goes on from there.
    const fromStart = frameOf(from)
    const toStart = move.swiped || to.getAnimations().length > 0 ? frameOf(to) : enterFrame(move.direction, width)
    still(from)
    still(to)
    const duration = move.swiped ? SWIPE_SETTLE_MS : SWITCH_MS
    const away = leaveFrame(fromStart, move.direction, width)
    const out = from.animate([{ transform: shift(fromStart.x) }, { transform: shift(away.x) }], { duration, easing: EASE, fill: 'forwards' })
    to.animate([{ transform: shift(toStart.x) }, { transform: shift(0) }], { duration, easing: EASE })
    // The old card fades in the first half and the new one shows up a little after, so the two are
    // barely ever seen on top of each other.
    from.animate([{ opacity: fromStart.opacity }, { opacity: 0 }], { duration: duration / 2, easing: 'ease-out', fill: 'forwards' })
    to.animate([{ opacity: toStart.opacity }, { opacity: 1 }], {
      duration: duration * 0.6,
      delay: move.swiped ? 0 : duration * 0.15,
      easing: 'ease-out',
      fill: 'backwards',
    })
    out.onfinish = () => setLeaving((key) => (key === move.from ? undefined : key))
  }, [current, leaving])

  // Keeps the current card's icon in view when the row is wider than the screen.
  useEffect(() => {
    const bar = row.current
    const button = current === undefined ? null : bar?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(current)}"]`)
    if (!bar || !button) return
    if (focusTab.current === current) {
      focusTab.current = undefined
      button.focus({ preventScroll: true })
    }
    if (bar.scrollWidth <= bar.clientWidth) return
    bar.scrollTo({ left: button.offsetLeft - (bar.clientWidth - button.offsetWidth) / 2, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [current, pages])

  function goTo(key: string | undefined, swipe = false) {
    if (key === undefined || current === undefined || key === current) return
    if (!reducedMotion()) {
      pending.current = { from: current, to: key, direction: shown.indexOf(key) > position ? 1 : -1, swiped: swipe }
      setLeaving(current)
    }
    setChosen(key)
    setPeek(undefined)
  }

  /** A swipe let go short of switching: the card goes back, and the one peeking in goes away. */
  function goBack() {
    const element = page(current)
    const neighbor = peek === undefined ? null : page(peek)
    const width = stage.current?.clientWidth ?? 0
    for (const [target, end] of [
      [element, REST],
      [neighbor, enterFrame(peek !== undefined && shown.indexOf(peek) > position ? 1 : -1, width)],
    ] as const) {
      if (!target) continue
      const start = frameOf(target)
      still(target)
      if (start.x !== end.x || start.opacity !== end.opacity) {
        target.animate([css(start), css(end)], { duration: SWIPE_SETTLE_MS, easing: EASE, fill: target === neighbor ? 'forwards' : 'none' })
      }
    }
    if (neighbor) {
      const animation = neighbor.getAnimations()[0]
      if (animation) animation.onfinish = () => setPeek(undefined)
      else setPeek(undefined)
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    swiped.current = false
    // Mice and trackpads switch with the row or a sideways scroll (below): a mouse drag selects text.
    if (event.pointerType === 'mouse' || pages < 2 || !event.isPrimary) return
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      swiping: false,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const finger = drag.current
    if (!finger || finger.pointer !== event.pointerId || current === undefined) return
    let dx = event.clientX - finger.x
    const dy = event.clientY - finger.y
    if (!finger.swiping) {
      // Up or down first: the page scrolls, and this touch is no swipe.
      if (Math.abs(dy) > SLOP_PX && Math.abs(dy) >= Math.abs(dx)) {
        drag.current = undefined
        return
      }
      if (Math.abs(dx) < SLOP_PX) return
      finger.swiping = true
      swiped.current = true
      // The card follows from here, without jumping the distance it took to tell a swipe.
      finger.x += Math.sign(dx) * SLOP_PX
      dx = event.clientX - finger.x
      // A switch still playing ends at once: the finger has the card now.
      for (const key of [current, leaving]) {
        const element = page(key)
        if (element) still(element)
      }
      setLeaving(undefined)
    }
    const elapsed = Math.max(1, event.timeStamp - finger.lastTime)
    finger.velocity = 0.7 * ((event.clientX - finger.lastX) / elapsed) + 0.3 * finger.velocity
    finger.lastX = event.clientX
    finger.lastTime = event.timeStamp
    finger.dx = dx
    // With reduced motion the cards stay put; letting go still switches.
    if (reducedMotion()) return
    const neighbor = shown[position + swipeDirection(dx)]
    if (neighbor !== peek) setPeek(neighbor)
    const width = stage.current?.clientWidth ?? 0
    const frames = dragFrames(dx, width, neighbor !== undefined)
    const element = page(current)
    if (element) Object.assign(element.style, css(frames.current))
    const coming = page(neighbor)
    if (coming && frames.neighbor) Object.assign(coming.style, css(frames.neighbor))
  }

  /** The tap that ends a swipe is swallowed (below); one that never comes mustn't swallow a later one. */
  const endSwipe = () => setTimeout(() => (swiped.current = false), 400)

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const finger = drag.current
    if (!finger || finger.pointer !== event.pointerId) return
    drag.current = undefined
    if (!finger.swiping) return
    endSwipe()
    // A quiet moment before letting go isn't a flick.
    const velocity = event.timeStamp - finger.lastTime > 80 ? 0 : finger.velocity
    const direction = swipeEnd(finger.dx, velocity, stage.current?.clientWidth ?? 0)
    const target = direction === 0 ? undefined : shown[position + direction]
    if (target === undefined) goBack()
    else goTo(target, true)
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    const finger = drag.current
    if (!finger || finger.pointer !== event.pointerId) return
    drag.current = undefined
    if (!finger.swiping) return
    endSwipe()
    goBack()
  }

  // A sideways scroll (a trackpad's two-finger swipe) switches one card per gesture, and isn't taken
  // as the browser's swipe back.
  const step = useEffectEvent((direction: 1 | -1) => goTo(shown[position + direction]))
  useEffect(() => {
    const element = stage.current
    if (!element) return
    let total = 0
    let used = false
    let quiet: ReturnType<typeof setTimeout> | undefined
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      event.preventDefault()
      total += event.deltaX
      clearTimeout(quiet)
      quiet = setTimeout(() => {
        total = 0
        used = false
      }, 200)
      if (used || Math.abs(total) < 60) return
      used = true
      step(total > 0 ? 1 : -1)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', onWheel)
      clearTimeout(quiet)
    }
  }, [])

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const to = { ArrowRight: position + 1, ArrowLeft: position - 1, Home: 0, End: pages - 1 }[event.key]
    if (to === undefined || to < 0 || to >= pages) return
    event.preventDefault()
    focusTab.current = shown[to]
    goTo(shown[to])
  }

  const tabId = (key: string) => `${id}-tab-${key}`
  const panelId = (key: string) => `${id}-card-${key}`
  const withTabs = pages > 1

  return (
    <section aria-roledescription="carrossel" aria-label={label}>
      <div
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        // After a swipe, the finger's release is no tap on what's under it.
        onClickCapture={(event) => {
          if (!swiped.current) return
          swiped.current = false
          event.preventDefault()
          event.stopPropagation()
        }}
        // One cell the size of the stage, every card in it: a longer card is cut instead of growing it.
        className={cx('relative grid grid-cols-1 grid-rows-1 touch-pan-y touch-pinch-zoom', pages > 0 ? 'h-72' : 'h-0 overflow-hidden')}
      >
        <CardFill.Provider value>
          {items.map(({ key, child }) => {
            const on = key === current
            const visible = on || key === leaving || key === peek
            return (
              <div
                key={key}
                data-page={key}
                id={panelId(key)}
                role={withTabs && filled.includes(key) ? 'tabpanel' : undefined}
                aria-roledescription={withTabs ? 'cartão' : undefined}
                aria-labelledby={withTabs && filled.includes(key) ? tabId(key) : undefined}
                aria-hidden={on ? undefined : true}
                inert={!on}
                // `relative`: what a card places absolutely (screen-reader text, for one) stays inside its page.
                className={cx('relative col-start-1 row-start-1 min-w-0 [&>section]:h-full', on && 'z-10', !visible && 'invisible')}
              >
                {child}
              </div>
            )
          })}
        </CardFill.Provider>
      </div>
      {withTabs &&
        (tabs ? (
          // Scrolls sideways when there are more icons than fit; centered when they all fit.
          <div ref={row} className="scroll-fade-x relative mt-2 overflow-x-auto">
            <div role="tablist" aria-label={`Cartões de ${label}`} onKeyDown={onTabKey} className="mx-auto flex w-max gap-1 px-1 py-0.5">
              {shown.map((key, index) => {
                const tab = tabs[order.indexOf(key)]
                if (!tab) return null
                const selected = key === current
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    id={tabId(key)}
                    data-tab={key}
                    aria-selected={selected}
                    aria-controls={panelId(key)}
                    tabIndex={selected ? 0 : -1}
                    aria-label={`${tab.label} (${index + 1} de ${pages})`}
                    title={tab.label}
                    onClick={() => goTo(key)}
                    className={cx(
                      'inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
                      selected ? 'ring-1 ring-current' : 'text-muted hover:bg-surface-2 hover:text-ink-2',
                    )}
                    style={selected ? toneStyle(tab.tone, 16) : undefined}
                  >
                    <tab.icon size={17} />
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div ref={row} role="tablist" aria-label={`Cartões de ${label}`} onKeyDown={onTabKey} className="mt-2 flex justify-center gap-1.5">
            {shown.map((key, index) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={tabId(key)}
                data-tab={key}
                aria-selected={key === current}
                aria-controls={panelId(key)}
                tabIndex={key === current ? 0 : -1}
                aria-label={`Cartão ${index + 1} de ${pages}`}
                onClick={() => goTo(key)}
                className={cx('h-2 rounded-full transition-all', key === current ? 'w-5 bg-ink-2' : 'w-2 bg-baseline')}
              />
            ))}
          </div>
        ))}
    </section>
  )
}
