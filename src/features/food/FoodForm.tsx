import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, DecimalInput, Field, Segmented, TextInput } from '../../components/ui'
import { remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Food, FoodUnit, Nutrients, Portion } from '../../db/types'
import { formatNumber, parseDecimal } from '../../lib/format'
import { MacroBalance } from './MacroViews'
import { kcalFromMacros, multiply } from './nutrition'

/** What a scan or a search hands to the form before it becomes a saved food. */
export interface FoodDraft {
  name?: string
  brand?: string
  barcode?: string
  per100?: Nutrients
  portion?: Portion
  unit?: FoodUnit
  /** The values in `per100` are per `portion`, as typed from the label (only while a draft). */
  perPortion?: boolean
  source?: Food['source']
  /** A TACO food being replaced by the user's own version of it. */
  basedOn?: string
}

const FIELDS = [
  { key: 'kcal', label: 'Calorias (kcal)' },
  { key: 'carbs', label: 'Carboidratos (g)' },
  { key: 'protein', label: 'Proteína (g)' },
  { key: 'fat', label: 'Gorduras (g)' },
  { key: 'fiber', label: 'Fibras (g)' },
  { key: 'sugar', label: 'Açúcares (g)' },
  { key: 'saturatedFat', label: 'Gord. saturadas (g)' },
  { key: 'sodium', label: 'Sódio (mg)' },
] as const

/** What the typed values refer to: 100 g, or a portion as the label puts it ("1 fatia", 25 g). */
type Basis = '100g' | 'portion'

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
        unit: food.unit,
        source: food.source,
        basedOn: food.basedOn,
        // Shown per portion again, as it was typed.
        ...(food.labelPerPortion && food.portions?.[0] && food.unit !== 'portion'
          ? { per100: multiply(food.per100, food.portions[0].grams / 100), perPortion: true }
          : {}),
      }
    : (initial ?? {})
  const inPortions = start.unit === 'portion'
  // A new food starts per portion: that's how the package labels show it.
  const [basis, setBasis] = useState<Basis>(start.perPortion || (!food && !start.per100 && !inPortions) ? 'portion' : '100g')
  const perPortion = basis === 'portion' && !inPortions
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
  const portionValid = perPortion
    ? grams !== undefined && grams > 0
    : portionLabel.trim() === '' || (grams !== undefined && grams > 0)
  const valid = name.trim() !== '' && required && portionValid
  const fromMacros =
    values.protein !== undefined && values.carbs !== undefined && values.fat !== undefined
      ? kcalFromMacros({ protein: values.protein, carbs: values.carbs, fat: values.fat })
      : undefined

  /** Switching what the values refer to converts them, when the portion's weight is known. */
  function changeBasis(next: Basis) {
    if (next === basis) return
    setBasis(next)
    if (!grams || grams <= 0) return
    const factor = next === 'portion' ? grams / 100 : 100 / grams
    setTexts(
      Object.fromEntries(
        FIELDS.map(({ key }) => [key, values[key] === undefined ? texts[key] : asText(values[key]! * factor)]),
      ) as Record<NutrientKey, string>,
    )
  }

  // A plain function, not a component, so the inputs keep focus between renders.
  const portionFields = () => (
    <div className="grid grid-cols-[1fr_6rem] gap-3">
      <Field label={perPortion ? 'Porção' : 'Nome'}>
        <TextInput
          aria-label="Nome da porção"
          value={portionLabel}
          onChange={(e) => setPortionLabel(e.target.value)}
          placeholder="Ex.: 2 fatias"
        />
      </Field>
      <Field label="Gramas">
        <DecimalInput
          aria-label="Gramas da porção"
          value={portionGrams}
          onChange={(e) => setPortionGrams(e.target.value)}
          placeholder="g"
        />
      </Field>
    </div>
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    const typed: Nutrients = {
      kcal: values.kcal!,
      protein: values.protein!,
      carbs: values.carbs!,
      fat: values.fat!,
      fiber: values.fiber,
      sugar: values.sugar,
      saturatedFat: values.saturatedFat,
      sodium: values.sodium,
    }
    const label = portionLabel.trim() || (perPortion ? '1 porção' : '')
    const saved = await save(db.foods, {
      id: food?.id,
      name: name.trim(),
      brand: brand.trim() || undefined,
      barcode: barcode.trim() || undefined,
      // Kept per 100 g, whatever was typed, so everything else keeps working in grams.
      per100: perPortion && grams ? multiply(typed, 100 / grams) : typed,
      portions: label && grams ? [{ label, grams }] : undefined,
      unit: start.unit,
      labelPerPortion: perPortion || undefined,
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

        {inPortions ? (
          <p className="text-xs text-muted">Veio sem o peso, então é medido em porções.</p>
        ) : (
          <Field label="Valores da tabela" group>
            <Segmented
              label="Valores da tabela"
              value={basis}
              onChange={changeBasis}
              options={[
                { value: 'portion', label: 'Por porção' },
                { value: '100g', label: 'Por 100 g' },
              ]}
            />
          </Field>
        )}

        {perPortion && portionFields()}

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-2">
            {inPortions
              ? 'Valores por porção'
              : perPortion
                ? `Valores por ${portionLabel.trim() || 'porção'}${grams ? ` (${formatNumber(grams)} g)` : ''}`
                : 'Valores por 100 g (ou 100 ml)'}
          </legend>
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

        {required && (
          <MacroBalance nutrients={{ kcal: values.kcal!, carbs: values.carbs!, protein: values.protein!, fat: values.fat! }} />
        )}

        {!inPortions && !perPortion && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink-2">Porção (opcional)</legend>
            {portionFields()}
          </fieldset>
        )}

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
