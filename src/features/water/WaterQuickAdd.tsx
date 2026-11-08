import { CircleCheck, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { celebrate } from '../../components/celebrate'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { toneColor } from '../../components/tone'
import { Button, DecimalInput, Field, Meter, Pending, TextInput } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { alive, remove } from '../../db/repo'
import { db } from '../../db/schema'
import type { WaterContainer } from '../../db/types'
import { dayKey, formatTime, relativeDay, type DayKey } from '../../lib/dates'
import { formatMl, parseDecimal } from '../../lib/format'
import { CONTAINER_ICONS } from './containerIcons'
import { addWater, CLOCK, sumMl, useContainers } from './water'
import { tapFeedback } from '../../lib/haptics'

/** The day's water against the goal; `past` for a day that's over ("faltaram"). */
export function WaterSummary({ totalMl, goalMl, past = false }: { totalMl: number; goalMl: number; past?: boolean }) {
  const remaining = goalMl - totalMl
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <p>
          <span className="text-3xl font-semibold">{formatMl(totalMl)}</span>{' '}
          <span className="text-ink-2">de {formatMl(goalMl)}</span>
        </p>
        {remaining > 0 ? (
          <p className="text-sm text-ink-2">
            {past ? 'Faltaram' : 'Faltam'} {formatMl(remaining)}
          </p>
        ) : (
          <p className="flex items-center gap-1 text-sm font-medium text-good">
            <CircleCheck size={16} /> Meta batida
          </p>
        )}
      </div>
      <Meter value={totalMl} max={goalMl} label={past ? 'Água bebida no dia' : 'Água bebida hoje'} tone="water" />
    </div>
  )
}

/**
 * Adds water with the usual feedback: a tap, a toast to undo it, and a small party on reaching the goal.
 * With `date`, on that day (at this time of day, or at the `clock` given); the party is today's only.
 */
export function useAddWater(date?: DayKey): (ml: number, container?: WaterContainer, clock?: string) => Promise<void> {
  const settings = useSettings()
  const toast = useToast()
  return async (ml, container, clock) => {
    tapFeedback()
    const today = dayKey()
    const day = date ?? today
    const before = sumMl(alive(await db.waterLogs.where('date').equals(day).toArray()))
    const log = await addWater(ml, container?.id, day, clock)
    const added = `+${formatMl(ml)} de água${container ? ` (${container.name.toLowerCase()})` : ''}`
    // The glass that crosses the goal gets a small party.
    const reached = day === today && before < settings.waterGoalMl && before + ml >= settings.waterGoalMl
    if (reached) celebrate()
    toast({
      message: reached
        ? `Meta de água batida! 💧 +${formatMl(ml)}`
        : day === today
          ? added
          : `${added} · ${relativeDay(day, today)} às ${formatTime(log.time)}`,
      action: { label: 'Desfazer', onClick: () => void remove(db.waterLogs, log.id) },
    })
  }
}

/**
 * One-tap buttons for the favorite containers, plus a custom amount. `simple` (the Hoje card)
 * leaves out the "+" marks and the custom amount, which stays on the water screen. With `date`, the
 * water goes on that day.
 */
export function WaterQuickAdd({ simple = false, date }: { simple?: boolean; date?: DayKey }) {
  const containers = useContainers()
  const add = useAddWater(date)
  const [customOpen, setCustomOpen] = useState(false)
  // The screen waits for the buttons, instead of showing them a moment after the rest.
  if (!containers) return <Pending />
  const favorites = containers.filter((container) => container.favorite === 1)

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {favorites.map((container) => {
          const Icon = CONTAINER_ICONS[container.icon].icon
          return (
            <button
              key={container.id}
              type="button"
              aria-label={`Adicionar ${container.name}, ${formatMl(container.ml)}`}
              onClick={() => void add(container.ml, container)}
              className="flex min-h-14 items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-left transition active:scale-[0.97]"
            >
              <Icon size={22} className="shrink-0" style={{ color: toneColor('water') }} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{container.name}</span>
                <span className="block text-xs text-ink-2">{formatMl(container.ml)}</span>
              </span>
              {!simple && <Plus size={18} className="ml-auto shrink-0 text-muted" />}
            </button>
          )
        })}
        {!simple && (
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-dashed border-baseline px-3 py-2 text-left text-sm text-ink-2 transition active:scale-[0.97]"
          >
            <Plus size={20} className="shrink-0" />
            Outro valor
          </button>
        )}
      </div>
      {customOpen && (
        <CustomAmountModal
          date={date}
          onClose={() => setCustomOpen(false)}
          onAdd={(ml, clock) => void add(ml, undefined, clock)}
        />
      )}
    </>
  )
}

function CustomAmountModal({
  date,
  onClose,
  onAdd,
}: {
  date?: DayKey
  onClose: () => void
  onAdd: (ml: number, clock: string) => void
}) {
  const [text, setText] = useState('')
  const [clock, setClock] = useState(() => formatTime(Date.now()))
  const ml = parseDecimal(text)
  const valid = ml !== undefined && ml > 0 && ml <= 5000 && (clock === '' || CLOCK.test(clock))
  const today = dayKey()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    onAdd(Math.round(ml), clock)
    onClose()
  }

  return (
    <Modal open title={date && date !== today ? `Água de ${relativeDay(date, today)}` : 'Registrar água'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade (ml)">
            <DecimalInput autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: 400" />
          </Field>
          <Field label="Hora">
            <TextInput type="time" value={clock} onChange={(e) => setClock(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          {[150, 200, 300, 400, 750, 1000].map((preset) => (
            <Button key={preset} size="sm" onClick={() => setText(String(preset))}>
              {formatMl(preset)}
            </Button>
          ))}
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={!valid}>
          Adicionar
        </Button>
      </form>
    </Modal>
  )
}
