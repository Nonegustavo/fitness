import { Pencil, Star } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button, cx, DecimalInput, Field, Select } from '../../components/ui'
import { db } from '../../db/schema'
import type { Food, FoodLog, MealKey } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'
import { FoodForm } from './FoodForm'
import { fromCustom, logFood, toggleFavorite, type FoodItem } from './foods'
import { amountLabel, MEALS, nutrientsFor } from './nutrition'
import { RecipeForm } from './RecipeForm'

const SOURCE: Record<FoodItem['source'], string> = {
  taco: 'Tabela TACO',
  custom: 'Meu alimento',
  openfoodfacts: 'Open Food Facts',
  recipe: 'Minha receita',
  'health-connect': 'Do Health Connect',
}

const QUICK_GRAMS = [50, 100, 150, 200]
const QUICK_PORTIONS = [0.5, 1, 1.5, 2]

/** How much of a food (grams, or portions for a food without a weight), in which meal; shows the nutrients as you type. */
export function PortionModal({
  item,
  initialMeal,
  date,
  lastGrams,
  favorite,
  onClose,
  onLogged,
  onEdited,
}: {
  item: FoodItem
  initialMeal: MealKey
  date: DayKey
  lastGrams?: number
  favorite: boolean
  onClose: () => void
  onLogged: (log: FoodLog) => void
  /** The food as saved after an edit (or the user's new version of a TACO food). */
  onEdited?: (item: FoodItem) => void
}) {
  const inPortions = item.unit === 'portion'
  const [gramsText, setGramsText] = useState(() =>
    String(lastGrams ?? (inPortions ? 1 : (item.portions[0]?.grams ?? 100))).replace('.', ','),
  )
  const [meal, setMeal] = useState(initialMeal)
  // `food: null` edits a TACO food, which becomes the user's own version.
  const [editing, setEditing] = useState<{ food: Food | null } | null>(null)
  const grams = parseDecimal(gramsText)
  const valid = grams !== undefined && grams > 0 && grams <= 5000
  const amount = nutrientsFor(item.per100, valid ? grams : 0, item.unit)
  const per100 = item.per100

  async function add() {
    if (!valid) return
    onLogged(await logFood(item, grams, meal, date))
    onClose()
  }

  async function editFood() {
    if (item.source === 'taco') return setEditing({ food: null })
    const food = await db.foods.get(item.id)
    if (food) setEditing({ food })
  }
  const edited = (food: Food) => onEdited?.(fromCustom(food))

  return (
    <Modal open title={item.name} onClose={onClose}>
      <p className="-mt-1 mb-4 text-xs text-muted">
        {SOURCE[item.source]} · {inPortions ? 'por porção' : 'por 100 g'}: {formatNumber(per100.kcal, 0)} kcal · P{' '}
        {formatNumber(per100.protein)} · C {formatNumber(per100.carbs)} · G {formatNumber(per100.fat)}
      </p>
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Field label={inPortions ? 'Porções' : 'Quantidade (g)'}>
          <DecimalInput autoFocus value={gramsText} onChange={(e) => setGramsText(e.target.value)} />
        </Field>
        <Button
          aria-pressed={favorite}
          aria-label={favorite ? 'Tirar dos favoritos' : 'Favoritar'}
          title={favorite ? 'Tirar dos favoritos' : 'Favoritar'}
          onClick={() => void toggleFavorite(item.id)}
        >
          <Star size={18} className={cx(favorite && 'fill-current text-accent-ink')} />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {inPortions
          ? QUICK_PORTIONS.map((value) => (
              <Button key={value} size="sm" onClick={() => setGramsText(String(value).replace('.', ','))}>
                {amountLabel(value, 'portion')}
              </Button>
            ))
          : [
              ...item.portions.map((portion) => (
                <Button key={portion.label} size="sm" onClick={() => setGramsText(String(portion.grams).replace('.', ','))}>
                  {portion.label} · {formatNumber(portion.grams)} g
                </Button>
              )),
              ...QUICK_GRAMS.map((value) => (
                <Button key={value} size="sm" onClick={() => setGramsText(String(value))}>
                  {value} g
                </Button>
              )),
            ]}
      </div>

      <dl className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-surface-2 p-3 text-center">
        {(
          [
            ['kcal', formatNumber(amount.kcal, 0)],
            ['Proteína', `${formatNumber(amount.protein)} g`],
            ['Carbo', `${formatNumber(amount.carbs)} g`],
            ['Gordura', `${formatNumber(amount.fat)} g`],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dd className="font-semibold tabular-nums">{value}</dd>
            <dt className="text-xs text-ink-2">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <Field label="Refeição">
          <Select value={meal} onChange={(e) => setMeal(e.target.value as MealKey)}>
            {MEALS.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={() => void editFood()} title={item.source === 'taco' ? 'Criar sua versão deste alimento' : undefined}>
          <Pencil size={16} /> {item.source === 'taco' ? 'Minha versão' : 'Editar'}
        </Button>
        <Button variant="primary" className="flex-1" disabled={!valid} onClick={() => void add()}>
          Adicionar
        </Button>
      </div>
      {editing &&
        (editing.food?.source === 'recipe' ? (
          <RecipeForm recipe={editing.food} onClose={() => setEditing(null)} onSaved={edited} />
        ) : (
          <FoodForm
            food={editing.food}
            initial={editing.food ? undefined : { name: item.name, per100: item.per100, source: 'custom', basedOn: item.id }}
            onClose={() => setEditing(null)}
            onSaved={edited}
          />
        ))}
    </Modal>
  )
}
