import { ChevronDown, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { useRemoveWithUndo } from '../../components/SwipeToDelete'
import { Button, cx, DecimalInput, Field, TextInput } from '../../components/ui'
import { save } from '../../db/repo'
import { db } from '../../db/schema'
import type { WeightEntry } from '../../db/types'
import { dayKey, dayTime, formatTime } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'

/** The other numbers the Mi Body Composition Scale 2 shows in Zepp Life. */
const EXTRA_FIELDS = [
  { key: 'muscleMassKg', label: 'Massa muscular (kg)' },
  { key: 'leanMassKg', label: 'Massa magra (kg)' },
  { key: 'bodyWaterPct', label: 'Água corporal (%)' },
  { key: 'visceralFat', label: 'Gordura visceral' },
  { key: 'boneMassKg', label: 'Massa óssea (kg)' },
  { key: 'bmrKcal', label: 'Metabolismo basal (kcal)' },
] as const

type ExtraKey = (typeof EXTRA_FIELDS)[number]['key']

const toInput = (value: number | undefined): string => (value === undefined ? '' : String(value).replace('.', ','))

/**
 * Why a typed number can't be saved, or undefined when it can. An empty field has nothing to say:
 * whether it may stay empty is the caller's call.
 */
function rangeProblem(text: string, min: number, max: number, unit = ''): string | undefined {
  if (text.trim() === '') return undefined
  const value = parseDecimal(text)
  if (value !== undefined && value >= min && value <= max) return undefined
  return `Entre ${formatNumber(min)} e ${formatNumber(max)}${unit}.`
}

/** The reason in red, under the field. */
const problemHint = (problem: string | undefined) => problem && <span className="text-critical">{problem}</span>

export function WeightModal({ entry, onClose }: { entry: WeightEntry | null; onClose: () => void }) {
  const today = dayKey()
  const [date, setDate] = useState(entry?.date ?? today)
  const [time, setTime] = useState(formatTime(entry?.time ?? Date.now()))
  const [weight, setWeight] = useState(toInput(entry?.weightKg))
  const [fat, setFat] = useState(toInput(entry?.bodyFatPct))
  const [extras, setExtras] = useState(
    () => Object.fromEntries(EXTRA_FIELDS.map(({ key }) => [key, toInput(entry?.[key])])) as Record<ExtraKey, string>,
  )
  const [showExtras, setShowExtras] = useState(EXTRA_FIELDS.some(({ key }) => entry?.[key] !== undefined))
  const [note, setNote] = useState(entry?.note ?? '')

  const removeWithUndo = useRemoveWithUndo()

  // The rules, each with the reason shown under its field.
  const weightKg = parseDecimal(weight)
  const problems = {
    weight: rangeProblem(weight, 20, 400, ' kg'),
    fat: rangeProblem(fat, 1, 80, '%'),
    date: date === '' ? 'Escolha a data.' : date > today ? 'A data não pode ser no futuro.' : undefined,
    ...(Object.fromEntries(EXTRA_FIELDS.map(({ key }) => [key, rangeProblem(extras[key], 0, 10000)])) as Record<
      ExtraKey,
      string | undefined
    >),
  }
  const extrasProblem = EXTRA_FIELDS.some(({ key }) => problems[key])
  const extrasOpen = showExtras || extrasProblem
  const valid = weightKg !== undefined && Object.values(problems).every((problem) => problem === undefined)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || weightKg === undefined) return
    const extraValues = Object.fromEntries(EXTRA_FIELDS.map(({ key }) => [key, parseDecimal(extras[key])]))
    await save(db.weights, {
      id: entry?.id,
      date,
      time: dayTime(date, time),
      weightKg,
      bodyFatPct: parseDecimal(fat),
      ...extraValues,
      source: entry?.source ?? 'manual',
      note: note.trim() || undefined,
    })
    onClose()
  }

  function onDelete() {
    if (!entry) return
    removeWithUndo(db.weights, entry.id, 'Pesagem apagada')
    onClose()
  }

  return (
    <Modal open title={entry ? 'Editar pesagem' : 'Registrar pesagem'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Peso (kg)" hint={problemHint(problems.weight)}>
            <DecimalInput autoFocus={!entry} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="82,4" />
          </Field>
          <Field label="Gordura (%)" hint={problemHint(problems.fat)}>
            <DecimalInput value={fat} onChange={(e) => setFat(e.target.value)} placeholder="18,5" />
          </Field>
          <Field label="Data" hint={problemHint(problems.date)}>
            <TextInput type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Hora">
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>

        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium text-ink-2"
          aria-expanded={extrasOpen}
          onClick={() => setShowExtras((open) => !open)}
        >
          <ChevronDown size={16} className={cx('transition', extrasOpen && 'rotate-180')} />
          Mais dados da balança
        </button>
        {/* Kept open while one of them is wrong, so the reason stays in sight. */}
        {extrasOpen && (
          <div className="grid grid-cols-2 gap-3">
            {EXTRA_FIELDS.map(({ key, label }) => (
              <Field key={key} label={label} hint={problemHint(problems[key])}>
                <DecimalInput value={extras[key]} onChange={(e) => setExtras({ ...extras, [key]: e.target.value })} />
              </Field>
            ))}
          </div>
        )}

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

/** "Músculo 35,2 kg · Água 55%" for the list of weigh-ins. */
export function describeExtras(entry: WeightEntry): string {
  const parts: string[] = []
  if (entry.muscleMassKg !== undefined) parts.push(`Músculo ${formatNumber(entry.muscleMassKg)} kg`)
  if (entry.leanMassKg !== undefined) parts.push(`Massa magra ${formatNumber(entry.leanMassKg)} kg`)
  if (entry.bodyWaterPct !== undefined) parts.push(`Água ${formatNumber(entry.bodyWaterPct)}%`)
  if (entry.visceralFat !== undefined) parts.push(`Visceral ${formatNumber(entry.visceralFat)}`)
  if (entry.boneMassKg !== undefined) parts.push(`Ossos ${formatNumber(entry.boneMassKg)} kg`)
  if (entry.bmrKcal !== undefined) parts.push(`TMB ${formatNumber(entry.bmrKcal, 0)} kcal`)
  return parts.join(' · ')
}
