import { useState, type ReactNode } from 'react'
import { dragFeed, SwipePager } from './SwipePager'
import { Segmented } from './ui'

/**
 * A screen's tabs: the tab bar, centered, over the tab's content as pages. Dragging the content
 * sideways moves to the next or previous tab with the pill following the finger; tapping a tab
 * slides its content in from its side. `children` draws a tab from the key it gets (it also runs
 * for the tab coming in). `bleed={false}` keeps the slide inside the pager (tabs inside a card).
 */
export function PageTabs<T extends string>({
  label,
  value,
  options,
  onChange,
  children,
  className,
  bleed,
  gap = 'space-y-4',
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  children: (tab: T) => ReactNode
  /** For each tab's page (spacing between its cards, say). */
  className?: string
  bleed?: boolean
  /** Between the tab bar and the content. */
  gap?: string
}) {
  const [feed] = useState(dragFeed<T>)
  const index = (tab: T) => options.findIndex((option) => option.value === tab)
  return (
    <div className={gap}>
      <div className="flex justify-center">
        <Segmented label={label} value={value} options={options} onChange={onChange} follow={feed} />
      </div>
      <SwipePager
        value={value}
        neighbor={(tab, side) => options[index(tab) + side]?.value}
        compare={(a, b) => index(a) - index(b)}
        onChange={onChange}
        onDrag={feed.emit}
        className={className}
        bleed={bleed}
      >
        {children}
      </SwipePager>
    </div>
  )
}
