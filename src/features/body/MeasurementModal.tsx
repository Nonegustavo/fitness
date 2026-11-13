import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { useRemoveWithUndo } from '../../components/SwipeToDelete'
import { Button, DecimalInput, Field, TextInput } from '../../components/ui'
import { save } from '../../db/repo'
import { db } from '../../db/schema'
import type { MeasurementEntry, MeasurementSite } from '../../db/types'
import { dayKey } from '../../lib/dates'
import { parseDecimal } from '../../lib/format'

export function MeasurementModal({
  entry,
  sites,
  onClose,
}: {
  entry: MeasurementEntry | null
  sites: MeasurementSite[]
  onClose: () => void
}) {
  const today = dayKey()
  const removeWithUndo = useRemoveWithUndo()
  const [date, setDate] = useState(entry?.date ?? today)
  const [note, setNote] = useState(entry?.note ?? '')
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      sites.map(({ key }) => [key, entry?.values[key] === undefined ? '' : String(entry.values[key]).replace('.', ',')]),
    ),
  )

  const filled = Object.entries(texts).filter(([, text]) => text.trim() !== '')
  const parsed = filled.map(([key, text]) => [key, parseDecimal(text)] as const)
  const valid =
    parsed.length > 0 && parsed.every(([, value]) => value !== undefined && value > 0 && value < 300) && date <= today

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    // Keep values of sites that were removed from the list since this session was recorded.
    const hidden = Object.fromEntries(
      Object.entries(entry?.values ?? {}).filter(([key]) => !sites.some((site) => site.key === key)),
    )
    await save(db.measurements, {
      id: entry?.id,
      date,
      values: { ...hidden, ...Object.fromEntries(parsed as (readonly [string, number])[]) },
      note: note.trim() || undefined,
    })
    onClose()
  }

  function onDelete() {
    if (!entry) return
    removeWithUndo(db.measurements, entry.id, 'Medição apagada')
    onClose()
  }

  return (
    <Modal open title={entry ? 'Editar medição' : 'Nova medição'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Data">
          <TextInput type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <p className="text-xs text-muted">Em centímetros. Preencha só o que mediu.</p>
        <div className="grid grid-cols-2 gap-3">
          {sites.map(({ key, label }) => (
            <Field key={key} label={label}>
              <DecimalInput value={texts[key] ?? ''} onChange={(e) => setTexts({ ...texts, [key]: e.target.value })} />
            </Field>
          ))}
        </div>
        <Field label="Observação">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </Field>
        <div className="flex gap-2">
          {entry && (
            <Button variant="danger" onClick={onDelete}>
              <Trash2 size={16} /> Apagar
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
