import { Pencil, Star, Zap } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button, cx, DecimalInput, Field, Segmented, Select, Switch } from '../../components/ui'
import { db } from '../../db/schema'
import type { Food, FoodLog, MealKey, QuickAmount } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'
import { FoodForm } from './FoodForm'
import { fromCustom, logFood, setQuick, toggleFavorite, type FoodItem } from './foods'
import { MacroBalance, MacroGrams, MacroLine, OtherNutrients } from './MacroViews'
import { amountLabel, MEALS, nutrientsFor, portionCount, useDayGoals } from './nutrition'
import { RecipeForm } from './RecipeForm'

const SOURCE: Record<FoodItem['source'], string> = {
  taco: 'Tabela TACO',
  custom: 'Meu alimento',
  openfoodfacts: 'Open Food Facts',
  recipe: 'Minha receita',
  'health-connect': 'Do Health Connect',
}

const QUICK_GRAMS = [50, 100, 150, 200]
const asText = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',')
const QUICK_PORTIONS = [0.5, 1, 1.5, 2]

/** How much of a food (grams, or portions for a food without a weight), in which meal; shows the nutrients as you type. */
export function PortionModal({
  item,
  initialMeal,
  date,
  lastGrams,
  favorite,
  quick,
  onClose,
  onLogged,
  onEdited,
}: {
  item: FoodItem
  initialMeal: MealKey
  date: DayKey
  lastGrams?: number
  favorite: boolean
  /** The 1-tap shortcut's amount, when the food is one. */
  quick?: QuickAmount
  onClose: () => void
  onLogged: (log: FoodLog) => void
  /** The food as saved after an edit (or the user's new version of a TACO food). */
  onEdited?: (item: FoodItem) => void
}) {
  const inPortions = item.unit === 'portion'
  // A food with a weight and a portion ("1 fatia", 25 g) is counted in portions, or in grams on request.
  const portion = inPortions ? undefined : item.portions[0]
  const [byPortion, setByPortion] = useState(!!portion)
  const [amountText, setAmountText] = useState(() => {
    if (inPortions) return asText(lastGrams ?? 1)
    if (portion) return asText(lastGrams ? portionCount(lastGrams, portion) : 1)
    return asText(lastGrams ?? 100)
  })
  const [meal, setMeal] = useState(initialMeal)
  // `food: null` edits a TACO food, which becomes the user's own version.
  const [editing, setEditing] = useState<{ food: Food | null } | null>(null)
  const goals = useDayGoals(date)
  const typed = parseDecimal(amountText)
  const grams = typed !== undefined && byPortion && portion ? typed * portion.grams : typed
  const valid = grams !== undefined && grams > 0 && grams <= 5000
  const amount = nutrientsFor(item.per100, valid ? grams : 0, item.unit)
  const per100 = item.per100
  const reference = portion && byPortion ? nutrientsFor(per100, portion.grams) : per100

  function switchUnit(next: boolean) {
    if (!portion || next === byPortion) return
    setByPortion(next)
    if (grams !== undefined && grams > 0) setAmountText(asText(next ? portionCount(grams, portion) : Math.round(grams)))
  }

  async function add() {
    if (!valid) return
    onLogged(await logFood(item, grams, meal, date, undefined, byPortion ? portion : undefined))
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
      <p className="-mt-1 mb-4 flex flex-wrap gap-x-2 text-xs text-muted">
        <span>
          {SOURCE[item.source]} ·{' '}
          {inPortions
            ? 'por porção'
            : portion && byPortion
              ? `por ${portion.label} (${formatNumber(portion.grams)} g)`
              : 'por 100 g'}
          : {formatNumber(reference.kcal, 0)} kcal
        </span>
        <MacroLine nutrients={reference} />
      </p>
      {portion && (
        <div className="mb-3">
          <Segmented
            label="Medir em"
            value={byPortion ? 'portion' : 'grams'}
            onChange={(value) => switchUnit(value === 'portion')}
            options={[
              { value: 'portion', label: `Porções (${portion.label})` },
              { value: 'grams', label: 'Gramas' },
            ]}
          />
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Field
          label={inPortions ? 'Porções' : byPortion && portion ? `Quantas vezes ${portion.label}` : 'Quantidade (g)'}
          hint={byPortion && portion && valid ? `${formatNumber(grams, 0)} g` : undefined}
        >
          <DecimalInput autoFocus value={amountText} onChange={(e) => setAmountText(e.target.value)} />
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
        {inPortions || (portion && byPortion)
          ? QUICK_PORTIONS.map((value) => (
              <Button key={value} size="sm" onClick={() => setAmountText(asText(value))}>
                {inPortions ? amountLabel(value, 'portion') : `${formatNumber(value)}×`}
              </Button>
            ))
          : [
              ...item.portions.map((p) => (
                <Button key={p.label} size="sm" onClick={() => setAmountText(asText(p.grams))}>
                  {p.label} · {formatNumber(p.grams)} g
                </Button>
              )),
              ...QUICK_GRAMS.map((value) => (
                <Button key={value} size="sm" onClick={() => setAmountText(String(value))}>
                  {value} g
                </Button>
              )),
            ]}
      </div>

      <div className="mt-4 space-y-3">
        <MacroGrams nutrients={amount} goals={goals} />
        <OtherNutrients nutrients={amount} />
        {valid && <MacroBalance nutrients={amount} goals={goals} />}
      </div>

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

      <label className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2">
          <Zap size={16} className="text-accent-ink" aria-hidden />
          <span>
            Atalho de 1 toque
            <span className="block text-xs text-muted">
              {quick
                ? `Na tela de alimentação, com ${amountLabel(quick.grams, item.unit, quick.portion)}`
                : 'Para suplementos e o que se repete todo dia, com esta quantidade'}
            </span>
          </span>
        </span>
        <Switch
          label="Atalho de 1 toque"
          checked={!!quick}
          disabled={!quick && !valid}
          onChange={(on) =>
            void setQuick(item.id, on && valid ? { grams, portion: byPortion ? portion : undefined } : undefined)
          }
        />
      </label>

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
