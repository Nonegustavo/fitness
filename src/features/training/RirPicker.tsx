import { cx } from '../../components/ui'
import { formatRir } from './catalog'

/** 0 to 3 reps in reserve, and 4 standing for "4 or more". */
const VALUES = [0, 1, 2, 3, 4]

/**
 * "RIR 2" under a checked working set, or a faint "RIR" before one is told; opens the picker. It
 * keeps to the height of the line under the set (the rows are all one height), and its ::after
 * makes the spot to tap taller than what shows.
 */
export function RirToggle({
  rir,
  open,
  label,
  onToggle,
}: {
  rir: number | undefined
  open: boolean
  /** The set's label ("1", "2"). */
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`Repetições na reserva da série ${label}${rir === undefined ? '' : `: ${formatRir(rir)}`}`}
      onClick={onToggle}
      className={cx(
        'relative mx-auto block h-3.5 rounded px-1 text-[11px] leading-none whitespace-nowrap tabular-nums transition after:absolute after:-inset-x-1.5 after:-top-1 after:-bottom-1.5',
        rir === undefined ? 'text-muted' : 'font-semibold text-ink-2',
        open && 'bg-surface-2',
      )}
    >
      {rir === undefined ? 'RIR' : formatRir(rir)}
    </button>
  )
}

/** The reps in reserve of a checked set, a line of its own: tap a value to set it, the same again to clear it. */
export function RirPicker({
  rir,
  label,
  onChange,
}: {
  rir: number | undefined
  label: string
  onChange: (rir: number | undefined) => void
}) {
  return (
    <div
      role="group"
      aria-label={`Repetições na reserva da série ${label}`}
      className="col-span-full flex items-center justify-end gap-1 pt-0.5"
    >
      <span className="mr-1 text-[11px] text-muted">Reps na reserva</span>
      {VALUES.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={rir === value}
          onClick={() => onChange(rir === value ? undefined : value)}
          className={cx(
            'h-7 min-w-8 rounded-lg px-1.5 text-xs font-medium tabular-nums transition active:scale-95',
            rir === value ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2 hover:text-ink',
          )}
        >
          {value === 4 ? '4+' : value}
        </button>
      ))}
    </div>
  )
}
