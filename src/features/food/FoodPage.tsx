import { Bookmark, Dumbbell, Plus, Repeat, Target, Trash2, Utensils } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { DailyBars } from '../../components/DailyBars'
import { DayNav } from '../../components/DayNav'
import { Modal } from '../../components/Modal'
import { SwipeToDelete, useRemoveWithUndo } from '../../components/SwipeToDelete'
import { useToast } from '../../components/Toast'
import { Button, Card, DecimalInput, Field, Page, Select, TextInput } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { save } from '../../db/repo'
import { db } from '../../db/schema'
import type { FoodLog, MealKey, Nutrients } from '../../db/types'
import { dayRange, formatDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'
import { GoalsModal } from './GoalsModal'
import { amountLabel, goalsFor, logItems, MEAL_LABEL, MEALS, sumNutrients, useFoodLogs, useTrainingDays } from './nutrition'
import { NutritionSummary } from './NutritionSummary'
import { PhotoThumb } from './PhotoThumb'

const kcal = (value: number) => `${formatNumber(value, 0)} kcal`

export default function FoodPage() {
  const today = useToday()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const date = params.get('data') ?? today
  const settings = useSettings()
  const logs = useFoodLogs(shiftDay(date, -1), date)
  const trainingDay = useTrainingDays(date, date)?.has(date) ?? false
  const [goalsOpen, setGoalsOpen] = useState(false)

  const dayLogs = (logs ?? []).filter((log) => log.date === date)
  const yesterday = (logs ?? []).filter((log) => log.date !== date)
  const totals = sumNutrients(dayLogs.map((log) => log.nutrients))
  const goals = goalsFor(settings, trainingDay)
  const setDate = (next: DayKey) => setParams(next === today ? {} : { data: next }, { replace: true })

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
      <Card>
        <DayNav date={date} today={today} onChange={setDate} />
        {trainingDay && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-ink-2">
            <Dumbbell size={14} /> Dia de treino{settings.nutrition?.training ? ': metas de treino' : ''}
          </p>
        )}
        <NutritionSummary totals={totals} goals={goals} />
      </Card>

      {MEALS.map(({ key }) => (
        <MealCard
          key={key}
          meal={key}
          date={date}
          entries={dayLogs.filter((log) => log.meal === key)}
          yesterday={yesterday.filter((log) => log.meal === key)}
          onAdd={() => navigate(`/alimentacao/adicionar?refeicao=${key}&data=${date}`)}
        />
      ))}

      <Card title="Últimos 14 dias">
        <FoodHistory today={today} />
      </Card>

      {goalsOpen && <GoalsModal onClose={() => setGoalsOpen(false)} />}
    </Page>
  )
}

function MealCard({
  meal,
  date,
  entries,
  yesterday,
  onAdd,
}: {
  meal: MealKey
  date: DayKey
  entries: FoodLog[]
  yesterday: FoodLog[]
  onAdd: () => void
}) {
  const toast = useToast()
  const removeWithUndo = useRemoveWithUndo()
  const [editing, setEditing] = useState<FoodLog | null>(null)
  const [saving, setSaving] = useState(false)
  const total = sumNutrients(entries.map((entry) => entry.nutrients))
  const photoIds = [...new Set(entries.flatMap((entry) => (entry.photoId ? [entry.photoId] : [])))]

  async function repeatYesterday() {
    await logItems(yesterday, meal, date)
    toast({ message: `${MEAL_LABEL[meal]} de ontem repetido` })
  }

  return (
    <Card
      title={
        <>
          {MEAL_LABEL[meal]}
          {entries.length > 0 && <span className="font-normal text-muted"> · {kcal(total.kcal)}</span>}
        </>
      }
      action={
        <Button size="sm" variant="ghost" onClick={onAdd}>
          <Plus size={16} /> Adicionar
        </Button>
      }
    >
      {entries.length === 0 ? (
        yesterday.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => void repeatYesterday()}>
            <Repeat size={16} /> Repetir de ontem ({yesterday.length} {yesterday.length === 1 ? 'item' : 'itens'})
          </Button>
        ) : (
          <p className="text-sm text-muted">Nada registrado.</p>
        )
      ) : (
        <>
          {photoIds.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto">
              {photoIds.map((id) => (
                <PhotoThumb key={id} id={id} />
              ))}
            </div>
          )}
          <ul className="divide-y divide-line">
            {entries.map((entry) => (
              <SwipeToDelete key={entry.id} onDelete={() => removeWithUndo(db.foodLogs, entry.id, `${entry.name} removido`)}>
                <button type="button" onClick={() => setEditing(entry)} className="flex w-full items-center gap-3 py-2 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{entry.name}</p>
                    <p className="text-xs text-muted">
                      {amountLabel(entry.grams, entry.unit)} · P {formatNumber(entry.nutrients.protein, 0)} · C{' '}
                      {formatNumber(entry.nutrients.carbs, 0)} · G {formatNumber(entry.nutrients.fat, 0)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">{kcal(entry.nutrients.kcal)}</span>
                </button>
              </SwipeToDelete>
            ))}
          </ul>
          <Button size="sm" variant="ghost" className="mt-1" onClick={() => setSaving(true)}>
            <Bookmark size={16} /> Salvar como refeição
          </Button>
        </>
      )}
      {editing && <EntryModal entry={editing} onClose={() => setEditing(null)} />}
      {saving && <SaveMealModal meal={meal} date={date} entries={entries} onClose={() => setSaving(false)} />}
    </Card>
  )
}

const VALUE_FIELDS = [
  { key: 'kcal', label: 'Calorias (kcal)' },
  { key: 'protein', label: 'Proteína (g)' },
  { key: 'carbs', label: 'Carboidratos (g)' },
  { key: 'fat', label: 'Gorduras (g)' },
] as const

type ValueKey = (typeof VALUE_FIELDS)[number]['key']

const asText = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',')

/**
 * Changes a logged food: amount, meal, name, and its values when the table or the estimate was off.
 * A new amount scales the values, keeping any that were typed.
 */
function EntryModal({ entry, onClose }: { entry: FoodLog; onClose: () => void }) {
  const removeWithUndo = useRemoveWithUndo()
  const [name, setName] = useState(entry.name)
  const [gramsText, setGramsText] = useState(asText(entry.grams))
  const [meal, setMeal] = useState(entry.meal)
  const [perGram, setPerGram] = useState(
    () => Object.fromEntries(VALUE_FIELDS.map(({ key }) => [key, entry.nutrients[key] / entry.grams])) as Record<ValueKey, number>,
  )
  const [texts, setTexts] = useState(
    () => Object.fromEntries(VALUE_FIELDS.map(({ key }) => [key, asText(entry.nutrients[key])])) as Record<ValueKey, string>,
  )
  const [editingValues, setEditingValues] = useState(false)
  const grams = parseDecimal(gramsText)
  const valid =
    name.trim() !== '' &&
    grams !== undefined &&
    grams > 0 &&
    grams <= 5000 &&
    VALUE_FIELDS.every(({ key }) => (parseDecimal(texts[key]) ?? -1) >= 0)

  function changeGrams(text: string) {
    setGramsText(text)
    const next = parseDecimal(text)
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
    const { id, date, time, foodId, photoId, unit } = entry
    const nutrients: Nutrients = {
      kcal: perGram.kcal * grams,
      protein: perGram.protein * grams,
      carbs: perGram.carbs * grams,
      fat: perGram.fat * grams,
      fiber: entry.nutrients.fiber === undefined ? undefined : (entry.nutrients.fiber / entry.grams) * grams,
    }
    await save(db.foodLogs, { id, date, time, foodId, photoId, name: name.trim(), meal, grams, unit, nutrients })
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
          <Field label={entry.unit === 'portion' ? 'Porções' : 'Quantidade (g)'}>
            <DecimalInput value={gramsText} onChange={(e) => changeGrams(e.target.value)} />
          </Field>
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
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-2">
            <span>
              {texts.kcal} kcal · P {texts.protein} g · C {texts.carbs} g · G {texts.fat} g
            </span>
            <button type="button" className="font-medium text-accent-ink" onClick={() => setEditingValues(true)}>
              Corrigir valores
            </button>
          </p>
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
      items: entries.map(({ foodId, name: food, grams, unit, nutrients }) => ({ foodId, name: food, grams, unit, nutrients })),
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

function FoodHistory({ today }: { today: DayKey }) {
  const settings = useSettings()
  const from = shiftDay(today, -13)
  const logs = useFoodLogs(from, today)
  const trainingDays = useTrainingDays(from, today)
  const days = useMemo(() => dayRange(from, today), [from, today])

  const totals = useMemo(() => {
    const byDay = new Map<DayKey, Nutrients[]>()
    for (const log of logs ?? []) byDay.set(log.date, [...(byDay.get(log.date) ?? []), log.nutrients])
    return days.map((day) => (byDay.has(day) ? sumNutrients(byDay.get(day)!) : undefined))
  }, [logs, days])
  const values = useMemo(() => totals.map((total) => total?.kcal ?? 0), [totals])
  const goals = useMemo(
    () =>
      settings.nutrition ? days.map((day) => goalsFor(settings, trainingDays?.has(day) ?? false)?.kcal) : undefined,
    [settings, days, trainingDays],
  )

  // Averages over the days that have anything logged, today excluded (it isn't over yet).
  const logged = totals.slice(0, -1).filter((total): total is Nutrients => total !== undefined)
  const average = logged.length > 0 ? sumNutrients(logged) : undefined
  const n = logged.length

  return (
    <>
      <DailyBars
        days={days}
        values={values}
        goals={goals}
        format={kcal}
        axisFormat={(value) => formatNumber(value, 0)}
        valueLabel="consumidas"
        label="Calorias por dia nos últimos 14 dias"
        step={500}
      />
      {average && (
        <p className="mt-2 text-xs text-ink-2">
          Média de {n} {n === 1 ? 'dia' : 'dias'} com registro: {kcal(average.kcal / n)} · P{' '}
          {formatNumber(average.protein / n, 0)} g · C {formatNumber(average.carbs / n, 0)} g · G{' '}
          {formatNumber(average.fat / n, 0)} g
        </p>
      )}
    </>
  )
}
