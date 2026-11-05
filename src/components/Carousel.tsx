import type { LucideIcon } from 'lucide-react'
import { Children, useEffect, useRef, useState, type ReactNode } from 'react'
import { toneStyle, type Tone } from './tone'
import { CardFill, cx } from './ui'

/** What the row under the carousel shows for a page: its card's icon and color. */
export interface CarouselTab {
  icon: LucideIcon
  tone: Tone
  label: string
}

const sameList = (a: boolean[], b: boolean[]) => a.length === b.length && a.every((value, index) => value === b[index])

/**
 * Big cards side by side, shown one at a time at the full width of the page: swipe, or tap the row
 * underneath, to move. With `tabs` (one per child, in the same order) the row has each card's icon,
 * to jump straight to it; without them it has dots. Every page has the same height; a longer card
 * scrolls inside. A page that renders nothing is left out.
 */
export function Carousel({ label, tabs, children }: { label: string; tabs?: CarouselTab[]; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  // Which children came out with something (they show up as their data loads, or not at all).
  const [filled, setFilled] = useState<boolean[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    const element = track.current
    if (!element) return
    const count = () => {
      const next = [...element.children].map((page) => page.childElementCount > 0)
      setFilled((previous) => (sameList(previous, next) ? previous : next))
    }
    count()
    const observer = new MutationObserver(count)
    observer.observe(element, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  // The children on screen, by their position in `children` (and in `tabs`).
  const shown = filled.flatMap((on, index) => (on ? [index] : []))
  const pages = shown.length

  const step = () => {
    const element = track.current
    const first = [...(element?.children ?? [])].find((page) => page.childElementCount > 0) as HTMLElement | undefined
    if (!element || !first) return 0
    return first.offsetWidth + parseFloat(getComputedStyle(element).columnGap || '0')
  }

  const onScroll = () => {
    const width = step()
    if (width > 0 && track.current) setActive(Math.max(0, Math.min(pages - 1, Math.round(track.current.scrollLeft / width))))
  }

  const goTo = (index: number) => track.current?.scrollTo({ left: index * step(), behavior: 'smooth' })

  // Keeps the current card's icon in view when the row is wider than the screen.
  useEffect(() => {
    const bar = row.current
    const button = bar?.querySelectorAll('button')[active]
    if (!bar || !button || bar.scrollWidth <= bar.clientWidth) return
    bar.scrollTo({ left: button.offsetLeft - (bar.clientWidth - button.offsetWidth) / 2, behavior: 'smooth' })
  }, [active, pages])

  return (
    <section aria-roledescription="carrossel" aria-label={label}>
      <div
        ref={track}
        onScroll={onScroll}
        className={cx(
          'grid snap-x snap-mandatory auto-cols-[100%] grid-flow-col gap-4 overflow-x-auto overscroll-x-contain',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          // Pages that came out empty take no room; a card fills its page's height.
          '[&>*:empty]:hidden [&>*>section]:h-full',
        )}
      >
        <CardFill.Provider value>
          {Children.map(children, (child) => (
            // `relative`: what a card places absolutely (screen-reader text, for one) stays inside its page;
            // otherwise it escapes the scrolling track and widens the whole screen.
            <div className="relative h-72 min-w-0 snap-start snap-always" aria-roledescription="página">
              {child}
            </div>
          ))}
        </CardFill.Provider>
      </div>
      {pages > 1 &&
        (tabs ? (
          // Scrolls sideways when there are more icons than fit; centered when they all fit.
          <div ref={row} className="relative mt-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="mx-auto flex w-max gap-1 px-1 py-0.5">
              {shown.map((childIndex, index) => {
                const tab = tabs[childIndex]
                if (!tab) return null
                const current = index === active
                return (
                  <button
                    key={childIndex}
                    type="button"
                    aria-label={`${tab.label} (${index + 1} de ${pages})`}
                    aria-current={current ? 'true' : undefined}
                    title={tab.label}
                    onClick={() => goTo(index)}
                    className={cx(
                      'inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
                      current ? 'ring-1 ring-current' : 'text-muted hover:bg-surface-2 hover:text-ink-2',
                    )}
                    style={current ? toneStyle(tab.tone, 16) : undefined}
                  >
                    <tab.icon size={17} />
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="mt-2 flex justify-center gap-1.5">
            {Array.from({ length: pages }, (_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Cartão ${index + 1} de ${pages}`}
                aria-current={index === active ? 'true' : undefined}
                onClick={() => goTo(index)}
                className={cx('h-2 rounded-full transition-all', index === active ? 'w-5 bg-ink-2' : 'w-2 bg-baseline')}
              />
            ))}
          </div>
        ))}
    </section>
  )
}
