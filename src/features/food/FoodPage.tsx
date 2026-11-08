import { Bookmark, ChevronRight, Copy, Dumbbell, Flame, Pencil, Plus, Target, Trash2, Utensils } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PeriodBars } from '../../components/PeriodBars'
import { PeriodControl, useFirstDay, usePeriod, type Period } from '../../components/PeriodControl'
import { DayNav, DayPager } from '../../components/DayNav'
import { Modal } from '../../components/Modal'
import { useRemoveWithUndo } from '../../components/SwipeToDelete'
import { useToast } from '../../components/Toast'
import { Button, Card, DecimalInput, Field, Page, Select, SkeletonCard, SkeletonLines, TextInput } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { FoodLog, MacroGoals, MealKey, Nutrients } from '../../db/types'
import { dayRange, dayTime, formatDay, formatTime, type DayKey } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'
import type { DayValue } from '../../lib/stats'
import { useDailyHealth } from '../garmin/recovery'
import { logFood, useFoodCatalog, useFoodPrefs } from './foods'
import { closeTheDay, remainingOf, type Suggestion } from './closeDay'
import { CheckInCard } from './CheckInCard'
import { GoalsModal } from './GoalsModal'
import { useExpenditure } from './useExpenditure'
import { amountLabel, goalsFor, groupMeals, mealAt, multiply, OPTIONAL_NUTRIENTS, logItems, MEAL_LABEL, MEALS, sumNutrients, useFoodLogs, useTrainingDays } from './nutrition'
import { MacroBalance, MacroGrams, MacroLine, OtherNutrients, SplitBar } from './MacroViews'
import { DayProgress } from './DayProgress'
import { FoodAvatar, useFoodLooks, type FoodLook } from './FoodAvatar'
import { PhotoThumb } from './PhotoThumb'

const kcal = (value: number) => `${formatNumber(value, 0)} kcal`
/** Defined once: a new function each time would redraw the history chart on every render. */
const kcalAxis = (value: number) => formatNumber(value, 0)

export default function FoodPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const date = params.get('data') ?? today
  const looks = useFoodLooks()
  const [goalsOpen, setGoalsOpen] = useState(false)
  const setDate = (next: DayKey) => setParams(next === today ? {} : { data: next }, { replace: true })
  const history = useFoodHistory(today)

  return (
    <Page
      title="Alimentação"
      icon={Utensils}
      tone="food"
      actions={
        <Button size="sm" variant="ghost" onClick={() => setGoalsOpen(true)}>
          <Target size={16} /> Metas
        </Button>
      }
    >
      {/* All of the screen is the day's page: dragged sideways, everything moves with the finger. */}
      <DayPager date={date} today={today} onChange={setDate} className="space-y-4">
        {(day) => (
          <>
            <FoodDay date={day} today={today} looks={looks} onDate={setDate} />
            <Card title="Histórico">
              <FoodHistory history={history} />
            </Card>
          </>
        )}
      </DayPager>

      {goalsOpen && <GoalsModal onClose={() => setGoalsOpen(false)} />}
    </Page>
  )
}

/** One day: its totals against the goals, the cards that help close today, and the meals. */
function FoodDay({
  date,
  today,
  looks,
  onDate,
}: {
  date: DayKey
  today: DayKey
  looks: (foodId: string) => FoodLook
  onDate: (date: DayKey) => void
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const settings = useSettings()
  const logs = useFoodLogs(date, date)
  const trainingDay = useTrainingDays(date, date)?.has(date) ?? false

  const dayLogs = logs ?? []
  const totals = sumNutrients(dayLogs.map((log) => log.nutrients))
  const goals = goalsFor(settings, trainingDay)
  async function copyDay() {
    for (const { key } of MEALS) await logItems(dayLogs.filter((log) => log.meal === key), key, today)
    toast({ message: `${dayLogs.length} ${dayLogs.length === 1 ? 'item copiado' : 'itens copiados'} para hoje` })
  }

  return (
    <>
      <Card>
        <DayNav date={date} today={today} onChange={onDate} />
        {trainingDay && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-ink-2">
            <Dumbbell size={14} /> Dia de treino{settings.nutrition?.training ? ': metas de treino' : ''}
          </p>
        )}
        {logs ? (
          <DayProgress totals={totals} goals={goals} date={date} today={today}>
            {!goals && <p className="mt-3 text-xs text-muted">Defina as metas de calorias e macros em Metas.</p>}
            <EnergyLine date={date} today={today} />
          </DayProgress>
        ) : (
          <SkeletonLines lines={5} />
        )}
        {date !== today && dayLogs.length > 0 && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => void copyDay()}>
            <Copy size={16} /> Copiar o dia todo para hoje
          </Button>
        )}
      </Card>

      {date === today && <CheckInCard />}
      {logs && date === today && goals && <CloseDayCard date={date} eaten={totals} goals={goals} />}

      {!logs && <SkeletonCard lines={3} />}
      {logs && groupMeals(dayLogs).map((group) =>
        group.entries.length > 0 ? (
          <MealCard
            key={group.meals[0]}
            meal={group.meals[0]}
            date={date}
            entries={group.entries}
            goals={goals}
            looks={looks}
            onAdd={() => navigate(`/alimentacao/adicionar?refeicao=${group.meals[0]}&data=${date}`)}
          />
        ) : (
          <EmptyMeals
            key={group.meals.join()}
            meals={group.meals}
            onAdd={(meal) => navigate(`/alimentacao/adicionar?refeicao=${meal}&data=${date}`)}
          />
        ),
      )}
    </>
  )
}

/**
 * What's left of the day and a few ways to close it with the user's own foods (favorites and the
 * ones eaten before), each added in one tap.
 */
function CloseDayCard({ date, eaten, goals }: { date: DayKey; eaten: Nutrients; goals: MacroGoals }) {
  const toast = useToast()
  const prefs = useFoodPrefs()
  const catalog = useFoodCatalog()
  const left = remainingOf(goals, eaten)
  const suggestions = useMemo(() => {
    const byId = new Map(catalog.map((item) => [item.id, item]))
    // The 40 foods used most recently, plus the favorites.
    const foods = [...prefs.values()]
      .filter((pref) => pref.favorite || pref.lastUsedAt)
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
      .slice(0, 40)
      .flatMap((pref) => {
        const item = byId.get(pref.id)
        return item ? [{ item, lastGrams: pref.lastGrams }] : []
      })
    return closeTheDay(foods, left)
    // A new `left` object comes with every render; its values are what matter.
  }, [prefs, catalog, left.kcal, left.protein, left.carbs, left.fat])

  // The last stretch of the day: with more than that left, it's still meals ahead, not a gap to close.
  if (left.kcal < 150 || left.kcal > 900 || suggestions.length === 0) return null

  async function add(suggestion: Suggestion) {
    const meal = mealAt(new Date())
    const logs: FoodLog[] = []
    for (const pick of suggestion.picks) logs.push(await logFood(pick.item, pick.grams, { meal, date, portion: pick.portion }))
    toast({
      message: `${suggestion.picks.length === 1 ? '1 item' : `${suggestion.picks.length} itens`} · ${MEAL_LABEL[meal]}`,
      action: { label: 'Desfazer', onClick: () => logs.forEach((log) => void remove(db.foodLogs, log.id)) },
    })
  }

  return (
    <Card title="Para fechar o dia" icon={Target} tone="food">
      <p className="mb-2 text-sm text-ink-2">
        Faltam <span className="font-semibold text-ink tabular-nums">{formatNumber(left.kcal, 0)} kcal</span>
        {left.protein >= 5 && (
          <>
            {' '}
            e <span className="font-semibold tabular-nums" style={{ color: 'var(--macro-protein)' }}>{formatNumber(left.protein, 0)} g de proteína</span>
          </>
        )}
        . Com o que você costuma comer:
      </p>
      <ul className="divide-y divide-line">
        {suggestions.map((suggestion) => (
          <li key={suggestion.picks.map((pick) => pick.item.id + pick.grams).join()} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {suggestion.picks
                  .map((pick) => `${pick.item.name.split(',')[0]} (${amountLabel(pick.grams, pick.item.unit, pick.portion).split(' · ')[0]})`)
                  .join(' + ')}
              </p>
              <p className="flex flex-wrap gap-x-2 text-xs text-muted">
                <span>{kcal(suggestion.total.kcal)}</span>
                <MacroLine nutrients={suggestion.total} />
              </p>
            </div>
            <Button size="sm" onClick={() => void add(suggestion)}>
              <Plus size={16} /> Adicionar
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** What the body spent: the watch's count for the day, and the estimate from logs and weight. */
function EnergyLine({ date, today }: { date: DayKey; today: DayKey }) {
  const health = useDailyHealth(date, date)?.[0]
  const expenditure = useExpenditure(today)
  const calories = health?.calories
  if (!calories?.total && !expenditure) return null
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-ink-2">
      <Flame size={14} className="text-(--tone-training)" aria-hidden />
      {calories?.total ? (
        <span>
          Garmin: <span className="font-medium text-ink tabular-nums">{formatNumber(calories.total, 0)}</span> kcal gastas
          {calories.active ? ` (${formatNumber(calories.active, 0)} ativas)` : ''}
        </span>
      ) : null}
      {expenditure && (
        <span>
          Gasto real estimado: <span className="font-medium text-ink tabular-nums">{formatNumber(expenditure.kcal, 0)}</span>{' '}
          kcal/dia
        </span>
      )}
    </p>
  )
}

/** Meals with nothing logged: one line each, with "+". */
function EmptyMeals({ meals, onAdd }: { meals: MealKey[]; onAdd: (meal: MealKey) => void }) {
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
      {meals.map((meal) => (
        <li key={meal} className="flex min-h-12 items-center gap-2 py-1.5">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-2">{MEAL_LABEL[meal]}</p>
          <Button size="sm" variant="ghost" aria-label={`Adicionar em ${MEAL_LABEL[meal]}`} onClick={() => onAdd(meal)}>
            <Plus size={16} /> Adicionar
          </Button>
        </li>
      ))}
    </ul>
  )
}

function MealCard({
  meal,
  date,
  entries,
  goals,
  looks,
  onAdd,
}: {
  meal: MealKey
  date: DayKey
  entries: FoodLog[]
  goals?: MacroGoals
  looks: (foodId: string) => FoodLook
  onAdd: () => void
}) {
  const [editing, setEditing] = useState<FoodLog | null>(null)
  const [viewing, setViewing] = useState(false)
  const total = sumNutrients(entries.map((entry) => entry.nutrients))
  const photoIds = [...new Set(entries.flatMap((entry) => (entry.photoId ? [entry.photoId] : [])))]

  return (
    <Card
      title={
        <button type="button" onClick={() => setViewing(true)} className="block text-left hover:text-ink">
          <span className="flex items-center gap-1">
            {MEAL_LABEL[meal]}
            <ChevronRight size={16} className="text-muted" />
          </span>
          <span className="block text-xs font-normal text-muted tabular-nums">
            {formatTime(Math.min(...entries.map((entry) => entry.time)))} · {kcal(total.kcal)}
          </span>
        </button>
      }
      action={
        <Button size="sm" variant="ghost" onClick={onAdd}>
          <Plus size={16} /> Adicionar
        </Button>
      }
    >
      <>
        <button type="button" onClick={() => setViewing(true)} className="mb-2 block w-full" aria-label={`Ver ${MEAL_LABEL[meal]}`}>
          <SplitBar nutrients={total} />
        </button>
        {photoIds.length > 0 && (
          <div className="scroll-fade-x relative mb-2 flex gap-2 overflow-x-auto">
            {photoIds.map((id) => (
              <PhotoThumb key={id} id={id} />
            ))}
          </div>
        )}
        {/* No swipe to delete here: a sideways drag changes the day. "Remover" is in the food's sheet. */}
        <ul className="divide-y divide-line">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => setEditing(entry)} className="flex w-full items-center gap-3 py-2 text-left">
                <FoodAvatar name={entry.name} {...looks(entry.foodId)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{entry.name}</p>
                  <p className="flex flex-wrap gap-x-2 text-xs text-muted">
                    <span>{amountLabel(entry.grams, entry.unit, entry.portion)}</span>
                    <MacroLine nutrients={entry.nutrients} />
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums">{kcal(entry.nutrients.kcal)}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
      {editing && <EntryModal entry={editing} goals={goals} onClose={() => setEditing(null)} />}
      {viewing && (
        <MealModal
          meal={meal}
          date={date}
          entries={entries}
          goals={goals}
          looks={looks}
          onClose={() => setViewing(false)}
          onEdit={(entry) => {
            setViewing(false)
            setEditing(entry)
          }}
        />
      )}
    </Card>
  )
}

/**
 * A meal at a glance: its calories and macros against the day's goal and where its energy comes from,
 * with what can be done to the whole meal (its time and amounts, saving it, copying it to today).
 */
function MealModal({
  meal,
  date,
  entries,
  goals,
  looks,
  onClose,
  onEdit,
}: {
  meal: MealKey
  date: DayKey
  entries: FoodLog[]
  goals?: MacroGoals
  looks: (foodId: string) => FoodLook
  onClose: () => void
  onEdit: (entry: FoodLog) => void
}) {
  const toast = useToast()
  const today = useToday()
  const [saving, setSaving] = useState(false)
  const [amounts, setAmounts] = useState<Record<string, string> | null>(null)
  const [clock, setClock] = useState(() => formatTime(Math.min(...entries.map((entry) => entry.time))))

  /** One time for the whole meal, as it was eaten together. */
  async function changeClock(value: string) {
    setClock(value)
    if (!/^\d{2}:\d{2}$/.test(value)) return
    for (const entry of entries) await save(db.foodLogs, { ...entry, time: dayTime(entry.date, value) })
  }
  // While editing, the totals follow the amounts as they're typed.
  const shown = entries.map((entry) => {
    const grams = amounts ? gramsFromText(entry, amounts[entry.id]) : undefined
    return grams && grams !== entry.grams ? rescaled(entry, grams) : entry
  })
  const total = sumNutrients(shown.map((entry) => entry.nutrients))
  const valid = !amounts || entries.every((entry) => (gramsFromText(entry, amounts[entry.id]) ?? 0) > 0)

  async function saveAll() {
    if (!amounts || !valid) return
    for (const [i, entry] of entries.entries()) {
      if (shown[i] !== entry) await save(db.foodLogs, shown[i])
    }
    setAmounts(null)
  }

  async function copyToToday() {
    await logItems(entries, meal, today)
    toast({ message: `${MEAL_LABEL[meal]} copiado para hoje` })
    onClose()
  }

  return (
    <Modal open title={`${MEAL_LABEL[meal]} · ${kcal(total.kcal)}`} onClose={onClose}>
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-2">Hora da refeição</span>
          <span className="w-32 shrink-0">
            <TextInput type="time" value={clock} onChange={(e) => void changeClock(e.target.value)} />
          </span>
        </label>
        <MacroBalance nutrients={total} />
        <MacroGrams nutrients={total} goals={goals} />
        <OtherNutrients nutrients={total} />
        <ul className="divide-y divide-line">
          {shown.map((entry, i) => (
            <li key={entry.id}>
              {amounts ? (
                <div className="flex items-center gap-3 py-2">
                  <FoodAvatar name={entry.name} {...looks(entry.foodId)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{entry.name}</p>
                    <p className="text-xs text-muted tabular-nums">
                      {kcal(entry.nutrients.kcal)} · {amountUnit(entries[i])}
                    </p>
                  </div>
                  <div className="w-24 shrink-0">
                    <DecimalInput
                      aria-label={`Quantidade de ${entry.name}`}
                      className="text-right"
                      value={amounts[entry.id]}
                      onChange={(e) => setAmounts({ ...amounts, [entry.id]: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => onEdit(entries[i])} className="flex w-full items-start gap-3 py-2 text-left">
                  <FoodAvatar name={entry.name} {...looks(entry.foodId)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm">{entry.name}</p>
                      <span className="shrink-0 text-sm tabular-nums">{kcal(entry.nutrients.kcal)}</span>
                    </div>
                    <p className="flex flex-wrap gap-x-2 text-xs text-muted">
                      <span>{amountLabel(entry.grams, entry.unit, entry.portion)}</span>
                      <MacroLine nutrients={entry.nutrients} />
                    </p>
                    <SplitBar nutrients={entry.nutrients} className="mt-1.5 h-1" />
                  </div>
                </button>
              )}
            </li>
          ))}
        </ul>
        {amounts ? (
          <div className="flex gap-2">
            <Button onClick={() => setAmounts(null)}>Cancelar</Button>
            <Button variant="primary" className="flex-1" disabled={!valid} onClick={() => void saveAll()}>
              Salvar quantidades
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            <Button
              className="w-full"
              onClick={() => setAmounts(Object.fromEntries(entries.map((entry) => [entry.id, amountText(entry)])))}
            >
              <Pencil size={16} /> Editar quantidades
            </Button>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={() => setSaving(true)}>
                <Bookmark size={16} /> Salvar como refeição
              </Button>
              {date !== today && (
                <Button size="sm" variant="ghost" onClick={() => void copyToToday()}>
                  <Copy size={16} /> Copiar para hoje
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      {saving && <SaveMealModal meal={meal} date={date} entries={entries} onClose={() => setSaving(false)} />}
    </Modal>
  )
}

/** The portion an entry is counted by, when it was logged by one. */
const countedBy = (entry: FoodLog) =>
  entry.unit !== 'portion' && entry.portion && entry.portion.grams > 0 ? entry.portion : undefined

/** What the amount field holds: grams, portions, or a count of the logged portion. */
const amountUnit = (entry: FoodLog) =>
  entry.unit === 'portion' ? 'porções' : countedBy(entry) ? `× ${countedBy(entry)!.label}` : 'g'

const amountText = (entry: FoodLog) => asText(entry.grams / (countedBy(entry)?.grams ?? 1))

function gramsFromText(entry: FoodLog, text: string | undefined): number | undefined {
  const value = text === undefined ? undefined : parseDecimal(text)
  return value === undefined ? undefined : value * (countedBy(entry)?.grams ?? 1)
}

/** The entry in another amount, every value scaled with it. */
const rescaled = (entry: FoodLog, grams: number): FoodLog => ({
  ...entry,
  grams,
  nutrients: multiply(entry.nutrients, grams / entry.grams),
})

const VALUE_FIELDS = [
  { key: 'kcal', label: 'Calorias (kcal)' },
  { key: 'carbs', label: 'Carboidratos (g)' },
  { key: 'protein', label: 'Proteína (g)' },
  { key: 'fat', label: 'Gorduras (g)' },
] as const

type ValueKey = (typeof VALUE_FIELDS)[number]['key']

const asText = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',')

/**
 * Changes a logged food: amount, meal, name, and its values when the table or the estimate was off.
 * A new amount scales the values, keeping any that were typed.
 */
function EntryModal({ entry, goals, onClose }: { entry: FoodLog; goals?: MacroGoals; onClose: () => void }) {
  const removeWithUndo = useRemoveWithUndo()
  const toast = useToast()
  const today = useToday()
  const [name, setName] = useState(entry.name)
  // Logged by a portion: the amount is typed as a count of it.
  const portion = entry.unit !== 'portion' && entry.portion && entry.portion.grams > 0 ? entry.portion : undefined
  const unitGrams = portion?.grams ?? 1
  const [gramsText, setGramsText] = useState(asText(entry.grams / unitGrams))
  const [meal, setMeal] = useState(entry.meal)
  const [clock, setClock] = useState(formatTime(entry.time))
  const [perGram, setPerGram] = useState(
    () => Object.fromEntries(VALUE_FIELDS.map(({ key }) => [key, entry.nutrients[key] / entry.grams])) as Record<ValueKey, number>,
  )
  const [texts, setTexts] = useState(
    () => Object.fromEntries(VALUE_FIELDS.map(({ key }) => [key, asText(entry.nutrients[key])])) as Record<ValueKey, string>,
  )
  const [editingValues, setEditingValues] = useState(false)
  const typed = parseDecimal(gramsText)
  const grams = typed === undefined ? undefined : typed * unitGrams
  const valid =
    name.trim() !== '' &&
    grams !== undefined &&
    grams > 0 &&
    grams <= 5000 &&
    VALUE_FIELDS.every(({ key }) => (parseDecimal(texts[key]) ?? -1) >= 0)

  const amount = grams && grams > 0 ? grams : entry.grams
  const current: Nutrients = {
    kcal: perGram.kcal * amount,
    carbs: perGram.carbs * amount,
    protein: perGram.protein * amount,
    fat: perGram.fat * amount,
  }

  function changeGrams(text: string) {
    setGramsText(text)
    const count = parseDecimal(text)
    const next = count === undefined ? undefined : count * unitGrams
    if (next && next > 0) setTexts(Object.fromEntries(VALUE_FIELDS.map(({ key }) => [key, asText(perGram[key] * next)])) as Record<ValueKey, string>)
  }

  function changeValue(key: ValueKey, text: string) {
    setTexts({ ...texts, [key]: text })
    const value = parseDecimal(text)
    if (value !== undefined && value >= 0 && grams && grams > 0) setPerGram({ ...perGram, [key]: value / grams })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    const { id, date, foodId, photoId, unit, portion: loggedBy } = entry
    const time = /^\d{2}:\d{2}$/.test(clock) ? dayTime(date, clock) : entry.time
    const nutrients: Nutrients = {
      kcal: perGram.kcal * grams,
      protein: perGram.protein * grams,
      carbs: perGram.carbs * grams,
      fat: perGram.fat * grams,
    }
    // The values not on the form follow the new amount.
    for (const key of OPTIONAL_NUTRIENTS) {
      const value = entry.nutrients[key]
      if (value !== undefined) nutrients[key] = (value / entry.grams) * grams
    }
    await save(db.foodLogs, { id, date, time, foodId, photoId, name: name.trim(), meal, grams, unit, portion: loggedBy, nutrients })
    onClose()
  }

  return (
    <Modal open title={entry.name} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {entry.photoId && <PhotoThumb id={entry.photoId} className="h-40 w-full" />}
        <Field label="Nome">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={entry.unit === 'portion' ? 'Porções' : portion ? `Vezes ${portion.label}` : 'Quantidade (g)'}
            hint={portion && grams ? `${formatNumber(grams, 0)} g` : undefined}
          >
            <DecimalInput value={gramsText} onChange={(e) => changeGrams(e.target.value)} />
          </Field>
          <Field label="Hora">
            <TextInput type="time" value={clock} onChange={(e) => setClock(e.target.value)} />
          </Field>
        </div>
        <Field label="Refeição">
          <Select value={meal} onChange={(e) => setMeal(e.target.value as MealKey)}>
            {MEALS.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {editingValues ? (
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink-2">Valores desta porção</legend>
            <div className="grid grid-cols-2 gap-3">
              {VALUE_FIELDS.map(({ key, label }) => (
                <Field key={key} label={label}>
                  <DecimalInput value={texts[key]} onChange={(e) => changeValue(key, e.target.value)} />
                </Field>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="space-y-3">
            <MacroGrams nutrients={current} goals={goals} />
            <MacroBalance nutrients={current} />
            <button type="button" className="text-sm font-medium text-accent-ink" onClick={() => setEditingValues(true)}>
              Corrigir valores
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={() => {
              removeWithUndo(db.foodLogs, entry.id, `${entry.name} removido`)
              onClose()
            }}
          >
            <Trash2 size={16} /> Remover
          </Button>
          <Button
            title={entry.date === today ? 'Adicionar de novo' : 'Adicionar hoje, na mesma refeição'}
            onClick={async () => {
              await logItems([entry], entry.meal, today)
              toast({ message: entry.date === today ? `${entry.name} duplicado` : `${entry.name} copiado para hoje` })
              onClose()
            }}
          >
            <Copy size={16} /> {entry.date === today ? 'Duplicar' : 'Hoje'}
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function SaveMealModal({ meal, date, entries, onClose }: { meal: MealKey; date: DayKey; entries: FoodLog[]; onClose: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(`${MEAL_LABEL[meal]} de ${formatDay(date, 'd/M')}`)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    await save(db.savedMeals, {
      name: name.trim(),
      items: entries.map(({ foodId, name: food, grams, unit, portion, nutrients }) => ({
        foodId,
        name: food,
        grams,
        unit,
        portion,
        nutrients,
      })),
    })
    toast({ message: 'Refeição salva: ela aparece em Adicionar' })
    onClose()
  }

  return (
    <Modal open title="Salvar refeição" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-2">
          {entries.length} {entries.length === 1 ? 'item' : 'itens'} para adicionar de uma vez em outros dias.
        </p>
        <Field label="Nome">
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={!name.trim()}>
          Salvar
        </Button>
      </form>
    </Modal>
  )
}

interface FoodHistoryData {
  period: Period
  today: DayKey
  /** Undefined while the logs load. */
  values?: DayValue[]
  goals?: DayValue[]
  /** The totals of the days with logs (today excluded), over `n` days. */
  average?: Nutrients
  n: number
}

/**
 * The history's period and data, read once for the screen: each day's page draws the same chart, so
 * the one coming in during a drag shows it at once, with the period picked.
 */
function useFoodHistory(today: DayKey): FoodHistoryData {
  const settings = useSettings()
  const earliest = useFirstDay(db.foodLogs, 'date')
  const period = usePeriod('alimentacao', { earliest })
  const { from, to } = period.window
  const logs = useFoodLogs(from, to)
  const trainingDays = useTrainingDays(from, to)

  const values = useMemo(() => logs?.map((log) => ({ date: log.date, value: log.nutrients.kcal })), [logs])
  // Each day's goal follows whether it had a workout; a longer period's is their average over its days with logs.
  const goals = useMemo(
    () =>
      settings.nutrition
        ? dayRange(from, to).flatMap((day) => {
            const goal = goalsFor(settings, trainingDays?.has(day) ?? false)?.kcal
            return goal === undefined ? [] : [{ date: day, value: goal }]
          })
        : undefined,
    [settings, from, to, trainingDays],
  )

  // Averages over the days of the period that have anything logged, today excluded (it isn't over yet).
  const { average, n } = useMemo(() => {
    const counted = (logs ?? []).filter((log) => log.date !== today)
    const days = new Set(counted.map((log) => log.date)).size
    return { average: days > 0 ? sumNutrients(counted.map((log) => log.nutrients)) : undefined, n: days }
  }, [logs, today])

  return { period, today, values, goals, average, n }
}

/** Calories against the goals over the period picked: each day, or the average per day of a week, month or year. */
function FoodHistory({ history }: { history: FoodHistoryData }) {
  const { period, today, values, goals, average, n } = history
  return (
    <>
      <PeriodControl period={period} />
      {values ? (
        <PeriodBars
          periods={period.window}
          values={values}
          how="perDay"
          unfinished={today}
          goal={goals}
          format={kcal}
          axisFormat={kcalAxis}
          valueLabel="consumidas"
          legend="Consumido"
          label="Calorias consumidas por dia"
          step={500}
        />
      ) : (
        <SkeletonLines lines={5} />
      )}
      {average && (
        <p className="mt-2 text-xs text-ink-2">
          Média de {n} {n === 1 ? 'dia' : 'dias'} com registro: {kcal(average.kcal / n)} · C{' '}
          {formatNumber(average.carbs / n, 0)} g · P {formatNumber(average.protein / n, 0)} g · G{' '}
          {formatNumber(average.fat / n, 0)} g
        </p>
      )}
    </>
  )
}
