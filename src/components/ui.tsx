import { ChevronLeft } from 'lucide-react'
import type { ButtonHTMLAttributes, ComponentProps, ReactNode, SelectHTMLAttributes } from 'react'
import { Link } from 'react-router'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function Page({
  title,
  subtitle,
  back,
  actions,
  children,
}: {
  title: string
  subtitle?: ReactNode
  /** Link to the parent screen, shown above the title. */
  back?: { to: string; label: string }
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-28 lg:px-8 lg:pt-8 lg:pb-12">
      {back && (
        <Link to={back.to} className="mb-1 inline-flex items-center gap-0.5 text-sm text-ink-2 hover:text-ink">
          <ChevronLeft size={16} />
          {back.label}
        </Link>
      )}
      <header className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-ink-2 first-letter:uppercase">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('rounded-2xl border border-line bg-surface p-4', className)}>
      {(title || action) && (
        <div className="mb-3 flex min-h-8 items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink-2">{title}</h2>}
          {action}
        </div>
      )}
      {children}
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
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:pointer-events-none disabled:opacity-50',
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
        'inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-2 transition hover:bg-surface-2 disabled:opacity-40',
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

/** Progress toward a goal: blue fill on a lighter step of the same blue. */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(value / max, 1) * 100 : 0
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-3 overflow-hidden rounded-full bg-series-1-track"
    >
      <div className="h-full rounded-full bg-series-1 transition-[width] duration-500" style={{ width: `${percent}%` }} />
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
