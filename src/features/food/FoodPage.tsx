import { Bookmark, Dumbbell, Plus, Repeat, Target, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { DailyBars } from '../../components/DailyBars'
import { DayNav } from '../../components/DayNav'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, Card, DecimalInput, Field, Page, Select, TextInput } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { FoodLog, MealKey, Nutrients } from '../../db/types'
import { dayRange, formatDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'
import { GoalsModal } from './GoalsModal'
import { goalsFor, logItems, MEAL_LABEL, MEALS, sumNutrients, useFoodLogs, useTrainingDays } from './nutrition'
import { NutritionSummary } from './NutritionSummary'

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
  const [editing, setEditing] = useState<FoodLog | null>(null)
  const [saving, setSaving] = useState(false)
  const total = sumNutrients(entries.map((entry) => entry.nutrients))

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
          <ul className="divide-y divide-line">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={() => setEditing(entry)} className="flex w-full items-center gap-3 py-2 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{entry.name}</p>
                    <p className="text-xs text-muted">
                      {formatNumber(entry.grams, 0)} g · P {formatNumber(entry.nutrients.protein, 0)} · C{' '}
                      {formatNumber(entry.nutrients.carbs, 0)} · G {formatNumber(entry.nutrients.fat, 0)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">{kcal(entry.nutrients.kcal)}</span>
                </button>
              </li>
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

/** Changes the amount or meal of a logged food; nutrients scale from what was logged. */
function EntryModal({ entry, onClose }: { entry: FoodLog; onClose: () => void }) {
  const [gramsText, setGramsText] = useState(String(entry.grams).replace('.', ','))
  const [meal, setMeal] = useState(entry.meal)
  const grams = parseDecimal(gramsText)
  const valid = grams !== undefined && grams > 0 && grams <= 5000

  const scaled = (ratio: number): Nutrients => ({
    kcal: entry.nutrients.kcal * ratio,
    protein: entry.nutrients.protein * ratio,
    carbs: entry.nutrients.carbs * ratio,
    fat: entry.nutrients.fat * ratio,
    fiber: entry.nutrients.fiber === undefined ? undefined : entry.nutrients.fiber * ratio,
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    const { id, date, time, foodId, name } = entry
    await save(db.foodLogs, { id, date, time, foodId, name, meal, grams, nutrients: scaled(grams / entry.grams) })
    onClose()
  }

  return (
    <Modal open title={entry.name} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade (g)">
            <DecimalInput autoFocus value={gramsText} onChange={(e) => setGramsText(e.target.value)} />
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
        {valid && <p className="text-sm text-ink-2">{kcal(entry.nutrients.kcal * (grams / entry.grams))}</p>}
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => void remove(db.foodLogs, entry.id).then(onClose)}>
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
      items: entries.map(({ foodId, name: food, grams, nutrients }) => ({ foodId, name: food, grams, nutrients })),
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
