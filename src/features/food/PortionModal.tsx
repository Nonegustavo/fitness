import { Pencil, Star } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button, cx, DecimalInput, Field, Select } from '../../components/ui'
import { db } from '../../db/schema'
import type { Food, FoodLog, MealKey } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'
import { FoodForm } from './FoodForm'
import { logFood, toggleFavorite, type FoodItem } from './foods'
import { MEALS, scale } from './nutrition'

const SOURCE: Record<FoodItem['source'], string> = {
  taco: 'Tabela TACO',
  custom: 'Meu alimento',
  openfoodfacts: 'Open Food Facts',
}

const QUICK_GRAMS = [50, 100, 150, 200]

/** How much of a food, in which meal; shows the nutrients as you type. */
export function PortionModal({
  item,
  initialMeal,
  date,
  lastGrams,
  favorite,
  onClose,
  onLogged,
}: {
  item: FoodItem
  initialMeal: MealKey
  date: DayKey
  lastGrams?: number
  favorite: boolean
  onClose: () => void
  onLogged: (log: FoodLog) => void
}) {
  const [gramsText, setGramsText] = useState(() =>
    String(lastGrams ?? item.portions[0]?.grams ?? 100).replace('.', ','),
  )
  const [meal, setMeal] = useState(initialMeal)
  const [editing, setEditing] = useState<Food | null>(null)
  const grams = parseDecimal(gramsText)
  const valid = grams !== undefined && grams > 0 && grams <= 5000
  const amount = scale(item.per100, valid ? grams : 0)
  const per100 = item.per100

  async function add() {
    if (!valid) return
    onLogged(await logFood(item, grams, meal, date))
    onClose()
  }

  async function editFood() {
    const food = await db.foods.get(item.id)
    if (food) setEditing(food)
  }

  return (
    <Modal open title={item.name} onClose={onClose}>
      <p className="-mt-1 mb-4 text-xs text-muted">
        {SOURCE[item.source]} · por 100 g: {formatNumber(per100.kcal, 0)} kcal · P {formatNumber(per100.protein)} · C{' '}
        {formatNumber(per100.carbs)} · G {formatNumber(per100.fat)}
      </p>
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Field label="Quantidade (g)">
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
        {item.portions.map((portion) => (
          <Button key={portion.label} size="sm" onClick={() => setGramsText(String(portion.grams).replace('.', ','))}>
            {portion.label} · {formatNumber(portion.grams)} g
          </Button>
        ))}
        {QUICK_GRAMS.map((value) => (
          <Button key={value} size="sm" onClick={() => setGramsText(String(value))}>
            {value} g
          </Button>
        ))}
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
        {item.source !== 'taco' && (
          <Button onClick={() => void editFood()}>
            <Pencil size={16} /> Editar
          </Button>
        )}
        <Button variant="primary" className="flex-1" disabled={!valid} onClick={() => void add()}>
          Adicionar
        </Button>
      </div>
      {editing && <FoodForm food={editing} onClose={() => setEditing(null)} />}
    </Modal>
  )
}
