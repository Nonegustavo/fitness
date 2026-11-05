import type { Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useToday } from '../db/hooks'
import type { Synced } from '../db/types'
import type { DayKey } from '../lib/dates'
import {
  canGoBack,
  canGoForward,
  countLabel,
  defaultChoice,
  GRAINS,
  LENGTHS,
  parseChoice,
  periodWindow,
  shiftWindow,
  windowTitle,
  type DayRange,
  type Grain,
  type PeriodChoice,
  type PeriodWindow,
} from '../lib/periods'
import { Modal } from './Modal'
import { Button, cx, Field, IconButton, Segmented, TextInput } from './ui'

const STORAGE_PREFIX = 'fitness.period.'

function loadChoice(screen: string, grain: Grain): PeriodChoice {
  const fallback = defaultChoice(grain)
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + screen)
    return saved ? parseChoice(JSON.parse(saved), fallback) : fallback
  } catch {
    return fallback
  }
}

function saveChoice(screen: string, choice: PeriodChoice) {
  try {
    localStorage.setItem(STORAGE_PREFIX + screen, JSON.stringify(choice))
  } catch {
    // Storage blocked: the choice lasts while the screen is open.
  }
}

export interface Period {
  choice: PeriodChoice
  window: PeriodWindow
  canBack: boolean
  canForward: boolean
  setGrain: (grain: Grain) => void
  /** The latest `length` periods of the current grain. */
  setLength: (length: number) => void
  /** A picked range, or undefined for the latest periods again (every year, in the year view). */
  setRange: (range: DayRange | undefined) => void
  /** One window back (−1) or forward (1). */
  move: (steps: -1 | 1) => void
}

/**
 * The period a screen's charts show: grouped by day, week, month or year and moved with the arrows. The grain
 * and the window length (or a picked range) are remembered per `screen`; where the arrows went is not.
 * `earliest`, the first day with data, starts the year view and stops the ‹ arrow.
 */
export function usePeriod(screen: string, { grain = 'day', earliest }: { grain?: Grain; earliest?: DayKey } = {}): Period {
  const today = useToday()
  const [choice, setChoice] = useState(() => loadChoice(screen, grain))
  // Where the arrows moved the window to; undefined is where the choice puts it.
  const [end, setEnd] = useState<DayKey>()
  const shown = useMemo(() => periodWindow(choice, today, end, earliest), [choice, today, end, earliest])

  const update = (next: PeriodChoice) => {
    setChoice(next)
    saveChoice(screen, next)
  }
  return {
    choice,
    window: shown,
    canBack: canGoBack(shown, earliest),
    canForward: canGoForward(shown),
    // A new grain keeps the window where the arrows left it, to look at the same months another way.
    setGrain: (next) => update({ ...choice, grain: next }),
    setLength: (length) => {
      if (choice.grain === 'year') return
      update({ grain: choice.grain, lengths: { ...choice.lengths, [choice.grain]: length } })
      setEnd(undefined)
    },
    setRange: (range) => {
      update(range ? { ...choice, custom: range } : { grain: choice.grain, lengths: choice.lengths })
      setEnd(undefined)
    },
    move: (steps) => setEnd(shiftWindow(shown, steps)),
  }
}

/**
 * The first day a table has data on, through a day field that is also an index; with `has`, the first row
 * that has the metric. Pass a `has` defined once (module level), so the query isn't remade each render.
 */
export function useFirstDay<T extends Synced>(
  table: Table<T, string>,
  field: keyof T & string,
  has?: (row: T) => boolean,
): DayKey | undefined {
  return useLiveQuery(async () => {
    const row = await table
      .orderBy(field)
      .filter((item) => !item.deleted && (!has || has(item)))
      .first()
    return row?.[field] as DayKey | undefined
  }, [table, field, has])
}

/**
 * Dia · Semana · Mês · Ano, the window's dates between ‹ and ›, and "Intervalo" for its length or a range of
 * dates. Above the charts it drives.
 */
export function PeriodControl({ period, className }: { period: Period; className?: string }) {
  const [picking, setPicking] = useState(false)
  const { title, detail } = windowTitle(period.window, period.choice.custom !== undefined)
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className ?? 'mb-3')}>
      <Segmented label="Agrupar por" value={period.choice.grain} onChange={period.setGrain} options={GRAINS} />
      <div className="flex min-w-68 flex-1 items-center gap-1">
        <IconButton label="Período anterior" disabled={!period.canBack} onClick={() => period.move(-1)}>
          <ChevronLeft size={20} />
        </IconButton>
        {/* A range across two years can take two lines on a phone rather than lose its end. */}
        <p className="min-w-0 flex-1 text-center leading-tight" aria-live="polite">
          <span className="block text-sm font-medium text-balance">{title}</span>
          <span className="block truncate text-xs text-muted">{detail}</span>
        </p>
        <IconButton label="Próximo período" disabled={!period.canForward} onClick={() => period.move(1)}>
          <ChevronRight size={20} />
        </IconButton>
        <Button size="sm" className="px-2.5" onClick={() => setPicking(true)}>
          Intervalo
        </Button>
      </div>
      {picking && <IntervalSheet period={period} onClose={() => setPicking(false)} />}
    </div>
  )
}

/** The window's length for the grain (or every year), or a range between two dates. */
function IntervalSheet({ period, onClose }: { period: Period; onClose: () => void }) {
  const { choice } = period
  const { grain } = choice
  const { today } = period.window
  // Starts from the dates on screen, so a range is a tweak of what is shown.
  const [from, setFrom] = useState(period.window.from)
  const [to, setTo] = useState(period.window.to)
  const valid = from !== '' && to !== '' && from <= to && to <= today
  const pick = (action: () => void) => {
    action()
    onClose()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (valid) pick(() => period.setRange({ from, to }))
  }

  return (
    <Modal open title="Intervalo" onClose={onClose}>
      <p className="mb-2 text-sm font-medium text-ink-2">
        {grain === 'year' ? 'Mostrar' : grain === 'week' ? 'Mostrar as últimas' : 'Mostrar os últimos'}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {grain === 'year' ? (
          <Button
            variant={choice.custom ? 'secondary' : 'primary'}
            className="col-span-full"
            onClick={() => pick(() => period.setRange(undefined))}
          >
            Todos os anos
          </Button>
        ) : (
          LENGTHS[grain].map((length) => {
            const selected = !choice.custom && choice.lengths[grain] === length
            return (
              <Button
                key={length}
                variant={selected ? 'primary' : 'secondary'}
                aria-pressed={selected}
                onClick={() => pick(() => period.setLength(length))}
              >
                {countLabel(grain, length)}
              </Button>
            )
          })
        )}
      </div>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <p className="text-sm font-medium text-ink-2">Ou de uma data até outra</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="De">
            <TextInput type="date" required value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Até">
            <TextInput type="date" required value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={!valid}>
          Ver esse intervalo
        </Button>
      </form>
    </Modal>
  )
}
