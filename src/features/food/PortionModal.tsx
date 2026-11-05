import { Pencil, Star } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button, cx, DecimalInput, Field, Segmented, Select } from '../../components/ui'
import { db } from '../../db/schema'
import type { Food, FoodLog, FoodPref, MealKey } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'
import { FoodForm } from './FoodForm'
import { LookButton } from './LookEditor'
import { fromCustom, logFood, toggleFavorite, updatePref, weighFood, type FoodItem } from './foods'
import { MacroBalance, MacroGrams, MacroLine, OtherNutrients } from './MacroViews'
import { amountLabel, MEALS, nutrientsFor, portionCount, useDayGoals } from './nutrition'
import { RecipeForm } from './RecipeForm'

const SOURCE: Record<FoodItem['source'], string> = {
  taco: 'Tabela TACO',
  custom: 'Meu alimento',
  openfoodfacts: 'Open Food Facts',
  recipe: 'Minha receita',
  'health-connect': 'Do Health Connect',
  ai: 'Análise por IA',
}

const QUICK_GRAMS = [50, 100, 150, 200]
const asText = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',')
const QUICK_PORTIONS = [0.5, 1, 1.5, 2]

/**
 * How much of a food (grams, or portions for a food without a weight), in which meal; shows the nutrients
 * as you type. A food without a weight can be logged in grams too, once you say what a portion weighs.
 * Its photo and emoji are changed here too, for any food.
 */
export function PortionModal({
  item,
  initialMeal,
  date,
  time,
  pref,
  onClose,
  onLogged,
  onEdited,
}: {
  item: FoodItem
  initialMeal: MealKey
  date: DayKey
  /** When it was eaten ("12:30"); now when unset. */
  time?: string
  /** The food's preferences: favorite, last amount, photo and emoji. */
  pref?: FoodPref
  onClose: () => void
  onLogged: (log: FoodLog) => void
  /** The food as saved after an edit (or the user's new version of a TACO food). */
  onEdited?: (item: FoodItem) => void
}) {
  const lastGrams = pref?.lastGrams
  const favorite = pref?.favorite === 1
  const inPortions = item.unit === 'portion'
  // A food with a weight and a portion ("1 fatia", 25 g) is counted in portions, or in grams on request.
  const portion = inPortions ? undefined : item.portions[0]
  // A food that was measured in portions keeps a plain "porção": no need to repeat the word.
  const plainPortion = portion?.label === 'porção'
  const [byPortion, setByPortion] = useState(!!portion)
  // A food measured in portions typed in grams, given what one portion weighs. Logging it that way saves
  // the weight in the food, which is measured in grams from then on.
  const [inGrams, setInGrams] = useState(false)
  const knownWeight = inPortions ? item.portions.find((p) => p.grams > 0)?.grams : undefined
  const [weightText, setWeightText] = useState('')
  const typedWeight = knownWeight ?? parseDecimal(weightText)
  const portionWeight = typedWeight !== undefined && typedWeight > 0 && typedWeight <= 5000 ? typedWeight : undefined
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
  // The amount for the food as it is now: grams, or portions for a food measured in portions.
  const grams =
    typed === undefined
      ? undefined
      : inGrams
        ? portionWeight && typed / portionWeight
        : byPortion && portion
          ? typed * portion.grams
          : typed
  const valid = grams !== undefined && grams > 0 && grams <= 5000 && (!inGrams || (typed ?? 0) <= 5000)
  const amount = nutrientsFor(item.per100, valid ? grams : 0, item.unit)
  const per100 = item.per100
  const reference = portion && byPortion ? nutrientsFor(per100, portion.grams) : per100

  function switchUnit(toPortions: boolean) {
    const known = grams !== undefined && grams > 0
    if (inPortions) {
      if (toPortions === !inGrams) return
      setInGrams(!toPortions)
      // Without the weight of a portion, the grams are typed anew.
      if (toPortions) setAmountText(asText(known ? grams : 1))
      else setAmountText(known && portionWeight ? String(Math.round(grams * portionWeight)) : '')
      return
    }
    if (!portion || toPortions === byPortion) return
    setByPortion(toPortions)
    if (known) setAmountText(asText(toPortions ? portionCount(grams, portion) : Math.round(grams)))
  }

  async function add() {
    if (!valid) return
    if (inGrams && portionWeight && typed !== undefined) {
      // In grams: the food keeps what a portion weighs, then the grams are logged like any weighed food.
      onLogged(await logFood(await weighFood(item, portionWeight), typed, { meal, date, time }))
    } else {
      onLogged(await logFood(item, grams, { meal, date, time, portion: byPortion ? portion : undefined }))
    }
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
      <div className="-mt-1 mb-4 flex items-center gap-3">
        <LookButton name={item.name} look={pref} imageUrl={item.imageUrl} onChange={(change) => void updatePref(item.id, change)} />
        <p className="flex min-w-0 flex-1 flex-wrap gap-x-2 text-xs text-muted">
          <span>
            {SOURCE[item.source]} ·{' '}
            {inPortions
              ? `por porção${portionWeight ? ` (${formatNumber(portionWeight)} g)` : ''}`
              : portion && byPortion
                ? `por ${portion.label} (${formatNumber(portion.grams)} g)`
                : 'por 100 g'}
            : {formatNumber(reference.kcal, 0)} kcal
          </span>
          <MacroLine nutrients={reference} />
        </p>
      </div>
      {(portion || inPortions) && (
        <div className="mb-3">
          <Segmented
            label="Medir em"
            value={(inPortions ? !inGrams : byPortion) ? 'portion' : 'grams'}
            onChange={(value) => switchUnit(value === 'portion')}
            options={[
              { value: 'portion', label: portion && !plainPortion ? `Porções (${portion.label})` : 'Porções' },
              { value: 'grams', label: 'Gramas' },
            ]}
          />
        </div>
      )}
      {inGrams && knownWeight === undefined && (
        <div className="mb-3">
          <Field label="Quanto pesa 1 porção? (g)">
            <DecimalInput autoFocus value={weightText} onChange={(e) => setWeightText(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Field
          label={
            inPortions && !inGrams
              ? 'Porções'
              : byPortion && portion
                ? plainPortion
                  ? 'Quantas porções'
                  : `Quantas vezes ${portion.label}`
                : 'Quantidade (g)'
          }
          hint={
            inGrams
              ? valid
                ? amountLabel(grams, 'portion')
                : undefined
              : byPortion && portion && valid
                ? `${formatNumber(grams, 0)} g`
                : undefined
          }
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
        {(inPortions && !inGrams) || (portion && byPortion)
          ? QUICK_PORTIONS.map((value) => (
              <Button key={value} size="sm" onClick={() => setAmountText(asText(value))}>
                {inPortions ? amountLabel(value, 'portion') : `${formatNumber(value)}×`}
              </Button>
            ))
          : [
              ...(inPortions ? (portionWeight ? [{ label: '1 porção', grams: portionWeight }] : []) : item.portions).map(
                (p) => (
                  <Button key={p.label} size="sm" onClick={() => setAmountText(asText(p.grams))}>
                    {p.label} · {formatNumber(p.grams)} g
                  </Button>
                ),
              ),
              ...QUICK_GRAMS.map((value) => (
                <Button key={value} size="sm" onClick={() => setAmountText(String(value))}>
                  {value} g
                </Button>
              )),
            ]}
      </div>
      {inGrams && (
        <p className="mt-2 text-xs text-muted">
          Ao adicionar em gramas, o peso da porção fica salvo e o alimento passa a ser medido em gramas.
        </p>
      )}

      <div className="mt-4 space-y-3">
        <MacroGrams nutrients={amount} goals={goals} />
        <OtherNutrients nutrients={amount} />
        {valid && <MacroBalance nutrients={amount} />}
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
            look={pref}
            onClose={() => setEditing(null)}
            onSaved={edited}
          />
        ))}
    </Modal>
  )
}
