import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, DecimalInput, Field, TextInput } from '../../components/ui'
import { save } from '../../db/repo'
import { db } from '../../db/schema'
import type { FoodLog, MealKey } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'
import { MEAL_LABEL } from './nutrition'
import { QUICK_NAME, quickLog, quickNutrients } from './quick'

const FIELDS = [
  { key: 'kcal', label: 'Calorias (kcal)' },
  { key: 'carbs', label: 'Carboidratos (g)' },
  { key: 'protein', label: 'Proteína (g)' },
  { key: 'fat', label: 'Gorduras (g)' },
] as const

type Key = (typeof FIELDS)[number]['key']

/**
 * Calories and macros straight into the day, with no food ("lanche na rua, uns 450 kcal"), in the meal
 * and at the time chosen on the page. Either the calories or the macros are enough.
 */
export function QuickEntryModal({
  meal,
  date,
  time,
  initialName = '',
  onClose,
  onLogged,
}: {
  meal: MealKey
  date: DayKey
  /** "12:30"; now when unset. */
  time?: string
  initialName?: string
  onClose: () => void
  onLogged: (log: FoodLog) => void
}) {
  const [name, setName] = useState(initialName)
  const [texts, setTexts] = useState<Record<Key, string>>({ kcal: '', carbs: '', protein: '', fat: '' })
  const values = Object.fromEntries(FIELDS.map(({ key }) => [key, parseDecimal(texts[key])])) as Record<Key, number | undefined>
  const nutrients = quickNutrients(values)
  // A field with text that isn't a number would otherwise be taken as empty without a word.
  const unreadable = FIELDS.some(({ key }) => texts[key].trim() !== '' && values[key] === undefined)
  const valid = !!nutrients && !unreadable

  async function submit(event: FormEvent) {
    event.preventDefault()
    const draft = valid ? quickLog({ name, ...values }, { meal, date, time }) : undefined
    if (!draft) return
    onLogged(await save(db.foodLogs, draft))
    onClose()
  }

  return (
    <Modal open title="Registro rápido" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="-mt-1 text-xs text-muted">
          {MEAL_LABEL[meal]}
          {time ? ` · ${time}` : ''}. Só os números, sem criar um alimento: as calorias bastam, e sem elas vêm dos macros.
        </p>
        <Field label="Nome">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={QUICK_NAME} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(({ key, label }) => (
            <Field
              key={key}
              label={label}
              hint={
                key === 'kcal' && values.kcal === undefined && nutrients && nutrients.kcal > 0
                  ? `Pelos macros: ${formatNumber(nutrients.kcal, 0)} kcal`
                  : undefined
              }
            >
              <DecimalInput
                autoFocus={key === 'kcal'}
                value={texts[key]}
                onChange={(e) => setTexts({ ...texts, [key]: e.target.value })}
                placeholder={key === 'kcal' ? 'Dos macros' : '0'}
              />
            </Field>
          ))}
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={!valid}>
          Adicionar
        </Button>
      </form>
    </Modal>
  )
}
