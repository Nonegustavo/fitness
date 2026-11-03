import { CircleCheck, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, DecimalInput, Field, Meter } from '../../components/ui'
import { remove } from '../../db/repo'
import { db } from '../../db/schema'
import type { WaterContainer } from '../../db/types'
import { formatMl, parseDecimal } from '../../lib/format'
import { CONTAINER_ICONS } from './containerIcons'
import { addWater, useContainers } from './water'

export function WaterSummary({ totalMl, goalMl }: { totalMl: number; goalMl: number }) {
  const remaining = goalMl - totalMl
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <p>
          <span className="text-3xl font-semibold">{formatMl(totalMl)}</span>{' '}
          <span className="text-ink-2">de {formatMl(goalMl)}</span>
        </p>
        {remaining > 0 ? (
          <p className="text-sm text-ink-2">Faltam {formatMl(remaining)}</p>
        ) : (
          <p className="flex items-center gap-1 text-sm font-medium text-good">
            <CircleCheck size={16} /> Meta batida
          </p>
        )}
      </div>
      <Meter value={totalMl} max={goalMl} label="Água bebida hoje" />
    </div>
  )
}

/** One-tap buttons for the favorite containers, plus a custom amount. */
export function WaterQuickAdd() {
  const containers = useContainers()
  const toast = useToast()
  const [customOpen, setCustomOpen] = useState(false)
  const favorites = (containers ?? []).filter((container) => container.favorite === 1)

  async function add(ml: number, container?: WaterContainer) {
    const log = await addWater(ml, container?.id)
    toast({
      message: `+${formatMl(ml)} de água`,
      action: { label: 'Desfazer', onClick: () => void remove(db.waterLogs, log.id) },
    })
  }

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
              <Icon size={22} className="shrink-0 text-series-1" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{container.name}</span>
                <span className="block text-xs text-ink-2">{formatMl(container.ml)}</span>
              </span>
              <Plus size={18} className="ml-auto shrink-0 text-muted" />
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="flex min-h-14 items-center gap-3 rounded-xl border border-dashed border-baseline px-3 py-2 text-left text-sm text-ink-2 transition active:scale-[0.97]"
        >
          <Plus size={20} className="shrink-0" />
          Outro valor
        </button>
      </div>
      {customOpen && (
        <CustomAmountModal onClose={() => setCustomOpen(false)} onAdd={(ml) => void add(ml)} />
      )}
    </>
  )
}

function CustomAmountModal({ onClose, onAdd }: { onClose: () => void; onAdd: (ml: number) => void }) {
  const [text, setText] = useState('')
  const ml = parseDecimal(text)
  const valid = ml !== undefined && ml > 0 && ml <= 5000

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    onAdd(Math.round(ml))
    onClose()
  }

  return (
    <Modal open title="Registrar água" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Quantidade (ml)">
          <DecimalInput autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: 400" />
        </Field>
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
