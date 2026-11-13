import { useLiveQuery } from 'dexie-react-hooks'
import { LoaderCircle, Pencil, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, Field, IconButton, Select, Switch, TextInput } from '../../components/ui'
import { db } from '../../db/schema'
import type { MealKey } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { FoodAvatar } from './FoodAvatar'
import { fromCustom, logFood, useFoodPrefs } from './foods'
import { MacroLine } from './MacroViews'
import { MEALS } from './nutrition'
import {
  analyzeMacros,
  analyzePhoto,
  findAiFood,
  itemsToText,
  macroKcal,
  preparePhoto,
  saveAiFood,
  unsureNames,
  withGrams,
  type MacroItem,
  type MealSource,
} from './photo'
import { keepPhoto } from './photos'

/** Reading the photo, the list to correct, the macros being calculated, or their result. */
type Step = 'reading' | 'list' | 'calculating' | 'result'

/** An item of the result: the numbers as calculated, and the grams as the user left them. */
interface Row {
  key: string
  item: MacroItem
  grams: number
}

/** "Feijão, Farofa e Ovo". */
const names = new Intl.ListFormat('pt-BR', { type: 'conjunction' })

const messageOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

/**
 * A meal in two steps, both by Claude. A photo first becomes the list of what's on the plate, one item per
 * line with its grams, for you to correct (a description already is that list). Then the list becomes the
 * grams and macros of each item, which you check before anything is logged. Every item is kept as a food
 * of your own ("Análise por IA"), never matched to the TACO table.
 */
export function PhotoReview({
  source,
  initialMeal,
  date,
  time,
  onClose,
  onDone,
}: {
  source: MealSource
  initialMeal: MealKey
  date: DayKey
  /** When it was eaten ("12:30"); now when unset. */
  time?: string
  onClose: () => void
  onDone: (count: number, meal: MealKey) => void
}) {
  const toast = useToast()
  const fromPhoto = source.kind === 'photo'
  const [step, setStep] = useState<Step>(fromPhoto ? 'reading' : 'calculating')
  const [preview, setPreview] = useState<string>()
  // The list the macros come from: what the photo showed (as corrected), or the description as typed.
  const [text, setText] = useState(source.kind === 'text' ? source.text : '')
  // What the photo step adds to the list: the model's remarks and the items it wasn't sure about.
  const [photoNotes, setPhotoNotes] = useState('')
  const [unsure, setUnsure] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string>()
  const [meal, setMeal] = useState(initialMeal)
  const [keep, setKeep] = useState(true)
  const [saving, setSaving] = useState(false)
  // An item already among the AI foods shows that food's photo or emoji.
  const foods = useLiveQuery(() => db.foods.toArray())
  const prefs = useFoodPrefs()

  async function calculate(list: string) {
    setError(undefined)
    setStep('calculating')
    try {
      const analysis = await analyzeMacros(list)
      if (analysis.items.length === 0) {
        setError(analysis.notes || 'Nenhum alimento na lista. Escreva um item por linha.')
        setStep('list')
        return
      }
      setRows(analysis.items.map((item, i) => ({ key: String(i), item, grams: item.grams })))
      setNotes(analysis.notes)
      setStep('result')
    } catch (cause) {
      setError(messageOf(cause))
      setStep('list')
    }
  }

  // Once, on open (StrictMode runs effects twice in development): the photo is read, or the description
  // goes straight to the macros.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (source.kind === 'text') {
      void calculate(source.text)
      return
    }
    void (async () => {
      try {
        const photo = await preparePhoto(source.file)
        setPreview(photo.preview)
        const analysis = await analyzePhoto(photo)
        setText(itemsToText(analysis.items))
        setPhotoNotes(analysis.notes || (analysis.items.length === 0 ? 'Nenhum alimento identificado na foto.' : ''))
        setUnsure(unsureNames(analysis.items))
      } catch (cause) {
        setError(messageOf(cause))
      }
      setStep('list')
    })()
    // Only on open: one analysis per photo or description.
  }, [source])

  const ready = rows.filter((row) => row.grams > 0)
  const eaten = ready.map((row) => withGrams(row.item, row.grams))
  const total = {
    carbs: eaten.reduce((sum, item) => sum + item.carbs, 0),
    protein: eaten.reduce((sum, item) => sum + item.protein, 0),
    fat: eaten.reduce((sum, item) => sum + item.fat, 0),
  }

  const setGrams = (key: string, grams: number) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, grams } : row)))

  async function addAll() {
    setSaving(true)
    // A photo that fails to keep shouldn't stop the meal from being logged, but the user is told.
    let photoId: string | undefined
    if (source.kind === 'photo' && keep) {
      photoId = await keepPhoto(source.file).catch(() => undefined)
      if (!photoId) toast({ message: 'A foto não pôde ser guardada; a refeição foi registrada sem ela.' })
    }
    for (const row of ready) {
      const food = await saveAiFood(row.item)
      await logFood(fromCustom(food), row.grams, { meal, date, time, photoId })
    }
    onDone(ready.length, meal)
    onClose()
  }

  const busy = (message: string) => (
    <p className="flex items-center gap-2 py-6 text-sm text-ink-2">
      <LoaderCircle size={18} className="animate-spin" />
      {message}
    </p>
  )

  return (
    <Modal open title={fromPhoto ? 'Foto do prato' : 'Refeição descrita'} onClose={onClose}>
      {preview && <img src={preview} alt="Foto do prato" className="mb-3 max-h-48 w-full rounded-xl object-cover" />}

      {step === 'reading' && busy('Identificando os alimentos da foto… leva alguns segundos.')}

      {step === 'calculating' && (
        <>
          <blockquote className="rounded-xl border-l-4 border-accent-ink bg-surface-2 px-3 py-2 text-sm text-ink-2 whitespace-pre-line">
            {text.trim()}
          </blockquote>
          {busy('Calculando os macros de cada item…')}
        </>
      )}

      {step === 'list' && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (text.trim()) void calculate(text.trim())
          }}
        >
          {error && <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">{error}</p>}
          <Field
            label={fromPhoto ? 'O que tem no prato' : 'O que você comeu'}
            hint="Um item por linha, com a quantidade (gramas, unidades, colheres…). Corrija os nomes e as quantidades antes de calcular."
          >
            <textarea
              rows={Math.min(Math.max(text.split('\n').length + 1, 4), 12)}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Arroz branco: 150 g\nFeijão carioca: 1 concha\nFrango grelhado: 120 g'}
              className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent/30"
            />
          </Field>
          {unsure.length > 0 && (
            <p className="flex gap-1.5 text-xs text-ink">
              <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden />
              <span>Confira com atenção: {names.format(unsure)} (a foto deixou dúvida).</span>
            </p>
          )}
          {photoNotes && <p className="text-xs text-ink-2">{photoNotes}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={!text.trim()}>
            Calcular os macros
          </Button>
        </form>
      )}

      {step === 'result' && (
        <>
          <p className="mb-2 text-xs text-muted">
            Estimativas da IA: ajuste os gramas ou tire o que não comeu. Cada item fica salvo nos seus alimentos.
          </p>
          <ul className="space-y-2">
            {rows.map((row) => {
              const amount = withGrams(row.item, row.grams)
              const known = findAiFood(foods ?? [], row.item.name)
              return (
                <li key={row.key} className="rounded-xl border border-line p-3">
                  <div className="flex items-center gap-2">
                    <FoodAvatar name={row.item.name} pref={known && prefs.get(known.id)} emoji={row.item.emoji} size="sm" />
                    <p className="min-w-0 flex-1 truncate font-medium">{row.item.name}</p>
                    <TextInput
                      inputMode="numeric"
                      maxLength={4}
                      aria-label={`Gramas de ${row.item.name}`}
                      value={row.grams ? String(row.grams) : ''}
                      onChange={(e) => setGrams(row.key, Number(e.target.value.replace(/\D/g, '')) || 0)}
                      className="h-9 w-20 px-2 text-center"
                    />
                    <span className="text-xs text-muted">g</span>
                    <IconButton
                      label={`Remover ${row.item.name}`}
                      className="size-8"
                      onClick={() => setRows((current) => current.filter((other) => other.key !== row.key))}
                    >
                      <X size={16} />
                    </IconButton>
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-ink-2">
                    <span className="font-semibold text-ink tabular-nums">{formatNumber(macroKcal(amount), 0)} kcal</span>
                    <MacroLine nutrients={amount} digits={1} />
                  </p>
                </li>
              )
            })}
          </ul>
          {notes && <p className="mt-3 text-xs text-ink-2">{notes}</p>}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-surface-2 p-3 text-sm">
            <span className="font-semibold tabular-nums">Total: {formatNumber(macroKcal(total), 0)} kcal</span>
            <MacroLine nutrients={total} className="text-ink-2" />
          </div>
          <div className="mt-3">
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
          {fromPhoto && (
            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span>Guardar a foto com a refeição</span>
              <Switch checked={keep} onChange={setKeep} label="Guardar a foto com a refeição" />
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button disabled={saving} onClick={() => setStep('list')}>
              <Pencil size={16} /> Editar a lista
            </Button>
            <Button variant="primary" className="flex-1" disabled={ready.length === 0 || saving} onClick={() => void addAll()}>
              Adicionar {ready.length} {ready.length === 1 ? 'item' : 'itens'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
