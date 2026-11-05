import { LoaderCircle, ScanText, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, DecimalInput, Field, Segmented, TextInput } from '../../components/ui'
import { remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Food, FoodUnit, Nutrients, Portion } from '../../db/types'
import { formatNumber, parseDecimal } from '../../lib/format'
import { useSyncState } from '../../sync/controller'
import { CameraCapture } from './Camera'
import { updatePref } from './foods'
import { LookButton, type Look } from './LookEditor'
import { fillFromLabel, readLabel } from './label'
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
  /** The product's picture from Open Food Facts. */
  imageUrl?: string
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
  labelPhoto,
  look: startLook,
  onClose,
  onSaved,
}: {
  food?: Food | null
  initial?: FoodDraft
  /** A photo of the package's nutrition table, read as soon as the form opens. */
  labelPhoto?: Blob
  /** The food's photo and emoji as they are (a TACO food's, for the user's version of it). */
  look?: Look
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
        imageUrl: food.imageUrl,
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
  // Saved with the food, in its prefs; the photo itself is kept as soon as it's taken.
  const [look, setLook] = useState<Look>({ photoId: startLook?.photoId, emoji: startLook?.emoji })
  const sync = useSyncState()
  const canRead = sync.configured && !!sync.email && !inPortions
  const [camera, setCamera] = useState(false)
  const [reading, setReading] = useState(false)
  const [labelNotes, setLabelNotes] = useState<string[]>([])
  const [labelError, setLabelError] = useState<string>()

  /** Fills the form from a photo of the nutrition table; nothing is saved until "Salvar". */
  async function applyLabel(file: Blob) {
    setReading(true)
    setLabelError(undefined)
    setLabelNotes([])
    try {
      const fill = fillFromLabel(await readLabel(file))
      if (!fill) {
        setLabelError('Não achei a tabela nutricional na foto. Tente mais perto, reta e com luz.')
        return
      }
      setName((current) => current.trim() || fill.name)
      setBrand((current) => current.trim() || fill.brand)
      setBasis(fill.basis)
      setTexts(Object.fromEntries(FIELDS.map(({ key }) => [key, asText(fill.values[key])])) as Record<NutrientKey, string>)
      if (fill.portion) {
        setPortionLabel(fill.portion.label)
        setPortionGrams(asText(fill.portion.grams))
      }
      setLabelNotes(fill.notes)
    } catch (error) {
      setLabelError(error instanceof Error ? error.message : 'Não foi possível ler a tabela.')
    } finally {
      setReading(false)
    }
  }

  // The photo taken before opening the form is read once (StrictMode runs effects twice in development).
  const readStarted = useRef(false)
  useEffect(() => {
    if (!labelPhoto || readStarted.current) return
    readStarted.current = true
    void applyLabel(labelPhoto)
    // Only on open.
  }, [labelPhoto])

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
      imageUrl: start.imageUrl,
    })
    // A new version of a TACO food keeps its favorite star, last amount, photo and emoji.
    const base = !food && start.basedOn ? await db.foodPrefs.get(start.basedOn) : undefined
    if (base && !base.deleted) {
      await updatePref(saved.id, { favorite: base.favorite, lastGrams: base.lastGrams, lastUsedAt: base.lastUsedAt, ...look })
    } else if (look.photoId !== startLook?.photoId || look.emoji !== startLook?.emoji) {
      await updatePref(saved.id, look)
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
        {canRead && (
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-ink-2">Tem a embalagem aí?</span>
              <Button size="sm" disabled={reading} onClick={() => setCamera(true)}>
                {reading ? <LoaderCircle size={16} className="animate-spin" /> : <ScanText size={16} />}
                {reading ? 'Lendo a tabela…' : 'Ler a tabela por foto'}
              </Button>
            </div>
            {labelError && <p className="mt-2 text-xs text-critical">{labelError}</p>}
            {labelNotes.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-ink-2">
                {labelNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
            {!reading && !labelError && labelNotes.length === 0 && (
              <p className="mt-1 text-xs text-muted">O Claude lê os valores e preenche o formulário; confira antes de salvar.</p>
            )}
          </div>
        )}
        <div className="flex items-end gap-3">
          <LookButton
            name={name.trim() || 'Novo alimento'}
            look={look}
            imageUrl={start.imageUrl}
            onChange={(change) => setLook((current) => ({ ...current, ...change }))}
          />
          <div className="min-w-0 flex-1">
            <Field label="Nome">
              <TextInput autoFocus={!start.name && !labelPhoto} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pão de forma integral" />
            </Field>
          </div>
        </div>
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
      {camera && (
        <CameraCapture
          title="Tabela nutricional"
          hint="A tabela inteira, reta e com luz."
          onCapture={(picture) => {
            setCamera(false)
            void applyLabel(picture)
          }}
          onClose={() => setCamera(false)}
        />
      )}
    </Modal>
  )
}
