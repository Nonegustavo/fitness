import { ChevronLeft, type LucideIcon } from 'lucide-react'
import { createContext, useContext, type ButtonHTMLAttributes, type ComponentProps, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Link } from 'react-router'
import { IconTile, toneColor, type Tone } from './tone'

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
  return (
    <div className="mx-auto w-full max-w-3xl animate-enter px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-36 lg:px-8 lg:pt-8 lg:pb-12">
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
}

/**
 * Set by the "Em foco" carousel: a card fills its page's fixed height, and a body longer than that
 * scrolls inside the card.
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
  return (
    <section className={cx('rounded-2xl border border-line bg-surface p-4', fill && 'flex h-full flex-col', className)}>
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
      {fill ? <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{children}</div> : children}
    </section>
  )
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

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full rounded-xl bg-surface-2 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            'h-9 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition',
            option.value === value ? 'bg-pill text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
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

/** A gray shape where content is still loading, so the screen neither flashes empty nor jumps. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-lg bg-surface-2', className)} />
}

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
      <div className="mt-2 max-h-72 overflow-y-auto">{children}</div>
    </details>
  )
}
