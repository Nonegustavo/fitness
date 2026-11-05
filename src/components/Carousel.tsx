import { Children, useEffect, useRef, useState, type ReactNode } from 'react'
import { CardFill, cx } from './ui'

/**
 * Big cards side by side, shown one at a time at the full width of the page: swipe (or tap the
 * dots) to move. Every page has the same height; a longer card scrolls inside. A page that renders
 * nothing is left out.
 */
export function Carousel({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState(0)
  const [active, setActive] = useState(0)

  // Pages show up as their data loads (or not at all), so count the ones with content.
  useEffect(() => {
    const element = track.current
    if (!element) return
    const count = () => setPages([...element.children].filter((page) => page.childElementCount > 0).length)
    count()
    const observer = new MutationObserver(count)
    observer.observe(element, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const step = () => {
    const element = track.current
    const first = [...(element?.children ?? [])].find((page) => page.childElementCount > 0) as HTMLElement | undefined
    if (!element || !first) return 0
    return first.offsetWidth + parseFloat(getComputedStyle(element).columnGap || '0')
  }

  const onScroll = () => {
    const width = step()
    if (width > 0 && track.current) setActive(Math.min(pages - 1, Math.round(track.current.scrollLeft / width)))
  }

  const goTo = (index: number) => track.current?.scrollTo({ left: index * step(), behavior: 'smooth' })

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
      {pages > 1 && (
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
      )}
    </section>
  )
}
