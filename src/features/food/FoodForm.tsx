import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, DecimalInput, Field, TextInput } from '../../components/ui'
import { remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Food, Nutrients, Portion } from '../../db/types'
import { formatNumber, parseDecimal } from '../../lib/format'
import { kcalFromMacros } from './nutrition'

/** What a scan or a search hands to the form before it becomes a saved food. */
export interface FoodDraft {
  name?: string
  brand?: string
  barcode?: string
  per100?: Nutrients
  portion?: Portion
  source?: Food['source']
  /** A TACO food being replaced by the user's own version of it. */
  basedOn?: string
}

const FIELDS = [
  { key: 'kcal', label: 'Calorias (kcal)' },
  { key: 'protein', label: 'Proteína (g)' },
  { key: 'carbs', label: 'Carboidratos (g)' },
  { key: 'fat', label: 'Gorduras (g)' },
  { key: 'fiber', label: 'Fibras (g)' },
] as const

type NutrientKey = (typeof FIELDS)[number]['key']

const asText = (value: number | undefined) =>
  value === undefined ? '' : String(Math.round(value * 10) / 10).replace('.', ',')

export function FoodForm({
  food,
  initial,
  onClose,
  onSaved,
}: {
  food?: Food | null
  initial?: FoodDraft
  onClose: () => void
  onSaved?: (food: Food) => void
}) {
  const start: FoodDraft = food
    ? {
        name: food.name,
        brand: food.brand,
        barcode: food.barcode,
        per100: food.per100,
        portion: food.portions?.[0],
        source: food.source,
        basedOn: food.basedOn,
      }
    : (initial ?? {})
  const [name, setName] = useState(start.name ?? '')
  const [brand, setBrand] = useState(start.brand ?? '')
  const [barcode, setBarcode] = useState(start.barcode ?? '')
  const [texts, setTexts] = useState(
    () => Object.fromEntries(FIELDS.map(({ key }) => [key, asText(start.per100?.[key])])) as Record<NutrientKey, string>,
  )
  const [portionLabel, setPortionLabel] = useState(start.portion?.label ?? '')
  const [portionGrams, setPortionGrams] = useState(asText(start.portion?.grams))

  const values = Object.fromEntries(FIELDS.map(({ key }) => [key, parseDecimal(texts[key])])) as Record<
    NutrientKey,
    number | undefined
  >
  const required = (['kcal', 'protein', 'carbs', 'fat'] as const).every((key) => (values[key] ?? -1) >= 0)
  const grams = parseDecimal(portionGrams)
  const portionValid = portionLabel.trim() === '' || (grams !== undefined && grams > 0)
  const valid = name.trim() !== '' && required && portionValid
  const fromMacros =
    values.protein !== undefined && values.carbs !== undefined && values.fat !== undefined
      ? kcalFromMacros({ protein: values.protein, carbs: values.carbs, fat: values.fat })
      : undefined

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    const saved = await save(db.foods, {
      id: food?.id,
      name: name.trim(),
      brand: brand.trim() || undefined,
      barcode: barcode.trim() || undefined,
      per100: {
        kcal: values.kcal!,
        protein: values.protein!,
        carbs: values.carbs!,
        fat: values.fat!,
        fiber: values.fiber,
      },
      portions: portionLabel.trim() && grams ? [{ label: portionLabel.trim(), grams }] : undefined,
      source: start.source ?? 'custom',
      basedOn: start.basedOn,
    })
    // A new version of a TACO food keeps its favorite star and last amount.
    if (!food && start.basedOn) {
      const pref = await db.foodPrefs.get(start.basedOn)
      if (pref && !pref.deleted) {
        await save(db.foodPrefs, { id: saved.id, favorite: pref.favorite, lastGrams: pref.lastGrams, lastUsedAt: pref.lastUsedAt })
      }
    }
    onSaved?.(saved)
    onClose()
  }

  async function onDelete() {
    if (!food) return
    await remove(db.foods, food.id)
    onClose()
  }

  return (
    <Modal
      open
      title={start.basedOn && !food ? 'Minha versão' : food ? 'Editar alimento' : 'Novo alimento'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        {start.basedOn && (
          <p className="-mt-1 text-xs text-muted">
            Fica no lugar do alimento da TACO nas buscas. Os registros antigos não mudam.
          </p>
        )}
        <Field label="Nome">
          <TextInput autoFocus={!start.name} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pão de forma integral" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca">
            <TextInput value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="Código de barras">
            <TextInput inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-2">Valores por 100 g (ou 100 ml)</legend>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(({ key, label }) => (
              <Field key={key} label={label}>
                <DecimalInput value={texts[key]} onChange={(e) => setTexts({ ...texts, [key]: e.target.value })} />
              </Field>
            ))}
          </div>
          {fromMacros !== undefined && (
            <p className="mt-1 text-xs text-muted">Pelos macros: {formatNumber(fromMacros, 0)} kcal</p>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-2">Porção (opcional)</legend>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <TextInput
              aria-label="Nome da porção"
              value={portionLabel}
              onChange={(e) => setPortionLabel(e.target.value)}
              placeholder="Ex.: 1 fatia"
            />
            <DecimalInput aria-label="Gramas da porção" value={portionGrams} onChange={(e) => setPortionGrams(e.target.value)} placeholder="g" />
          </div>
        </fieldset>

        <div className="flex gap-2">
          {food && (
            <Button variant="danger" onClick={() => void onDelete()}>
              <Trash2 size={16} /> Excluir
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
