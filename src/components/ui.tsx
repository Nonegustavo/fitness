import { ChevronLeft, type LucideIcon } from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { Link } from 'react-router'
import { useReveal } from './reveal'
import type { PagerDrag } from './SwipePager'
import { IconTile, toneColor, ToneContext, type Tone } from './tone'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function Page({
  title,
  subtitle,
  back,
  actions,
  icon,
  tone,
  children,
}: {
  title: string
  subtitle?: ReactNode
  /** Link to the parent screen, shown above the title. */
  back?: { to: string; label: string }
  actions?: ReactNode
  /** The section's icon, on a tile of its color, next to the title. */
  icon?: LucideIcon
  tone?: Tone
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // The screen eases in whole, once its data is there, instead of card by card.
  const shown = useReveal(ref)
  const page = (
    <div
      ref={ref}
      data-tone={tone}
      className={cx(
        'mx-auto w-full max-w-3xl px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-36 lg:px-8 lg:pt-8 lg:pb-12',
        shown ? 'animate-enter' : 'opacity-0',
      )}
    >
      {back && (
        <Link to={back.to} className="mb-1 inline-flex items-center gap-0.5 text-sm text-ink-2 hover:text-ink">
          <ChevronLeft size={16} />
          {back.label}
        </Link>
      )}
      <header className="mb-4 flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && tone && <IconTile icon={icon} tone={tone} size="md" />}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-ink-2 first-letter:uppercase">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  )
  return tone ? <ToneContext value={tone}>{page}</ToneContext> : page
}

/**
 * Set by the "Em foco" carousel: a card fills its page's fixed height, and a body longer than that is
 * cut, fading out at the bottom (no scrolling inside the card).
 */
export const CardFill = createContext(false)

export function Card({
  title,
  action,
  icon,
  tone,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  /** The section's icon, on a tile of its color, before the title. */
  icon?: LucideIcon
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  const fill = useContext(CardFill)
  const card = (
    <section
      data-tone={tone}
      className={cx('rounded-2xl border border-line bg-surface p-4', fill && 'flex h-full flex-col', className)}
    >
      {(title || action) && (
        <div className="mb-3 flex min-h-8 shrink-0 items-center justify-between gap-2">
          {title && (
            <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-2">
              {icon && tone && <IconTile icon={icon} tone={tone} />}
              <span className="min-w-0">{title}</span>
            </h2>
          )}
          {action}
        </div>
      )}
      {fill ? <div className="scroll-fade-y -mx-1 min-h-0 flex-1 overflow-hidden px-1">{children}</div> : children}
    </section>
  )
  // A card of another section (the food card on Hoje) colors its controls, and the sheets they open, its way.
  return tone ? <ToneContext value={tone}>{card}</ToneContext> : card
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:brightness-110',
  secondary: 'bg-surface-2 text-ink hover:brightness-95',
  ghost: 'text-ink-2 hover:bg-surface-2',
  danger: 'bg-critical text-white hover:brightness-110',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-9 px-3 text-sm' : 'h-11 px-4',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

export function IconButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-2 transition hover:bg-surface-2 active:scale-90 disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Label + control. Use `group` for controls made of buttons (Segmented): a <label>
 * would forward clicks on its text to the first button.
 */
export function Field({
  label,
  hint,
  group,
  children,
}: {
  label: string
  hint?: ReactNode
  group?: boolean
  children: ReactNode
}) {
  const Wrapper = group ? 'div' : 'label'
  return (
    <Wrapper className="block">
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </Wrapper>
  )
}

const inputClass =
  'h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none transition placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent/30'

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx(inputClass, className)} {...props} />
}

/** Decimal input that accepts a comma, as the Brazilian keyboard types it. */
export function DecimalInput({ className, ...props }: ComponentProps<'input'>) {
  return <input type="text" inputMode="decimal" autoComplete="off" className={cx(inputClass, className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputClass, 'pr-8', className)} {...props} />
}

/** A drag between the pages of a tab bar (PageTabs), for its pill to follow. */
export interface PillFeed<T extends string> {
  subscribe: (listener: (drag: PagerDrag<T>) => void) => () => void
}

const PILL_MS = 220
const PILL_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

interface OptionBox {
  x: number
  width: number
}

/**
 * Puts the pill under an option, or part of the way to another (`fraction`, during a drag); `ms`
 * animates it there. Moved by transform; its width follows by size, a small box on its own. The
 * boxes come measured, so a drag only writes styles.
 */
function placePill(pill: HTMLElement, from: OptionBox | undefined, to: OptionBox | undefined, fraction: number, ms: number) {
  if (!from) {
    pill.style.opacity = '0'
    return
  }
  const between = (a: number, b: number) => a + (b - a) * fraction
  const x = to ? between(from.x, to.x) : from.x
  const width = to ? between(from.width, to.width) : from.width
  pill.style.transition = ms > 0 ? `transform ${ms}ms ${PILL_EASE}, width ${ms}ms ${PILL_EASE}` : 'none'
  pill.style.transform = `translateX(${x}px)`
  pill.style.width = `${width}px`
  pill.style.opacity = '1'
}

/**
 * Options side by side, the chosen one on a pill that slides to the next choice. With `follow`
 * (PageTabs), the pill also follows a drag between the tab pages.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  follow,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
  follow?: PillFeed<T>
}) {
  const group = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const latest = useRef(value)
  const placed = useRef(false)
  const boxes = useRef(new Map<string, OptionBox>())

  /** Where each option sits, read once per change of choice or size. */
  const measure = () => {
    boxes.current = new Map(
      [...(group.current?.querySelectorAll<HTMLElement>('[data-option]') ?? [])].map((button) => [
        button.dataset.option!,
        { x: button.offsetLeft, width: button.offsetWidth },
      ]),
    )
  }
  const box = (key: T | undefined) => (key === undefined ? undefined : boxes.current.get(key))

  // A new choice slides the pill over; the first one just puts it there. Only then: other renders
  // (one during a drag, say) leave it where it is.
  const labels = options.map((option) => `${option.value}:${option.label}`).join('|')
  useLayoutEffect(() => {
    latest.current = value
    measure()
    if (!pill.current) return
    placePill(pill.current, box(value), undefined, 0, placed.current ? PILL_MS : 0)
    placed.current = true
  }, [value, labels])

  // Labels that change size (a wider screen, text that wraps) move the options under it.
  useEffect(() => {
    const element = group.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      measure()
      if (pill.current) placePill(pill.current, box(latest.current), undefined, 0, 0)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(
    () =>
      follow?.subscribe((drag) => {
        if (pill.current) placePill(pill.current, box(latest.current), box(drag.to), drag.fraction, drag.settleMs ?? 0)
      }),
    [follow],
  )

  return (
    <div ref={group} role="radiogroup" aria-label={label} className="relative inline-flex max-w-full rounded-xl bg-surface-2 p-1">
      <span ref={pill} aria-hidden className="pointer-events-none absolute top-1 bottom-1 left-0 rounded-lg bg-pill opacity-0 shadow-sm" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          data-option={option.value}
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            'relative h-9 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
            option.value === value ? 'text-accent-ink' : 'text-ink-2 hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** On/off toggle. The label is what screen readers hear; show it next to the switch too. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-baseline',
      )}
    >
      <span
        className={cx(
          'inline-block size-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5.5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

/** Progress toward a goal: a fill on a lighter step of the same color (blue, or the section's). */
export function Meter({ value, max, label, tone }: { value: number; max: number; label: string; tone?: Tone }) {
  const percent = max > 0 ? Math.min(value / max, 1) * 100 : 0
  const color = tone && toneColor(tone)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-3 overflow-hidden rounded-full bg-series-1-track"
      style={color ? { background: `color-mix(in oklab, ${color} 20%, var(--surface-2))` } : undefined}
    >
      <div
        className="h-full rounded-full bg-series-1 transition-[width] duration-700 ease-out"
        style={{ width: `${percent}%`, ...(color && { background: color }) }}
      />
    </div>
  )
}

/** Stat tile: label, value (proportional figures), optional note. */
export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {note && <p className="truncate text-xs text-muted">{note}</p>}
    </div>
  )
}

/**
 * A gray shape where content is still loading, so the screen neither flashes empty nor jumps. It also
 * holds the screen back until its data is there (`data-loading`, see reveal.ts).
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden data-loading className={cx('animate-pulse rounded-lg bg-surface-2', className)} />
}

/** Holds the screen back while a part that shows nothing meanwhile (a banner, a hint) is loading. */
export const Pending = () => <span hidden data-loading />

/** A card-sized placeholder: a title line and a few lines of content. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  const fill = useContext(CardFill)
  return (
    <section
      aria-busy="true"
      aria-label="Carregando"
      className={cx('rounded-2xl border border-line bg-surface p-4', fill && 'h-full overflow-hidden', className)}
    >
      <Skeleton className="mb-4 h-4 w-1/3" />
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={cx('h-4', i % 3 === 2 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </section>
  )
}

/** Lines of placeholder inside a card that is already showing (its title loaded). */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando" className="space-y-3">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cx('h-4', i % 3 === 2 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>
}

/** Collapsible table twin for a chart, so no value is only reachable by hovering. */
export function TableView({ summary = 'Ver tabela', children }: { summary?: string; children: ReactNode }) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="cursor-pointer text-ink-2 select-none hover:text-ink">{summary}</summary>
      <div className="scroll-fade-y mt-2 max-h-72 overflow-y-auto">{children}</div>
    </details>
  )
}
