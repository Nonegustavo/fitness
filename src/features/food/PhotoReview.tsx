import { LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button, cx, Field, IconButton, Select, TextInput } from '../../components/ui'
import type { FoodPref, MealKey } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { logFood, searchFoods, type SearchEntry } from './foods'
import { MEALS, scale, sumNutrients } from './nutrition'
import { analyzePhoto, matchItems, preparePhoto, type ReviewItem } from './photo'

const CONFIDENCE_LABEL = { alta: 'confiança alta', media: 'confiança média', baixa: 'confiança baixa' }

/**
 * Sends the photo for analysis, then lets you fix each item (which food, how many grams)
 * before anything is logged: the AI suggests, you confirm.
 */
export function PhotoReview({
  file,
  initialMeal,
  date,
  index,
  prefs,
  onClose,
  onDone,
}: {
  file: Blob
  initialMeal: MealKey
  date: DayKey
  index: SearchEntry[]
  prefs: Map<string, FoodPref>
  onClose: () => void
  onDone: (count: number, meal: MealKey) => void
}) {
  const [preview, setPreview] = useState<string>()
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string>()
  const [meal, setMeal] = useState(initialMeal)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const photo = await preparePhoto(file)
        if (cancelled) return
        setPreview(photo.preview)
        const analysis = await analyzePhoto(photo)
        if (cancelled) return
        setItems(matchItems(analysis, index, prefs))
        setNotes(analysis.notes)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => {
      cancelled = true
    }
    // One analysis per photo: later changes to the food index don't re-run it.
  }, [file])

  const update = (key: string, change: Partial<ReviewItem>) =>
    setItems((current) => current && current.map((item) => (item.key === key ? { ...item, ...change } : item)))

  const searchAgain = (key: string, search: string) => {
    const candidates = searchFoods(index, search, prefs, 6)
    update(key, { search, candidates, foodId: candidates[0]?.id })
  }

  const chosen = (items ?? []).flatMap((item) => {
    const food = item.candidates.find((candidate) => candidate.id === item.foodId)
    return food && item.grams > 0 ? [{ item, food }] : []
  })
  const totals = sumNutrients(chosen.map(({ item, food }) => scale(food.per100, item.grams)))

  async function addAll() {
    setSaving(true)
    for (const { item, food } of chosen) await logFood(food, item.grams, meal, date)
    onDone(chosen.length, meal)
    onClose()
  }

  return (
    <Modal open title="Foto do prato" onClose={onClose}>
      {preview && <img src={preview} alt="Foto do prato" className="mb-3 max-h-48 w-full rounded-xl object-cover" />}

      {error ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">{error}</p>
      ) : !items ? (
        <p className="flex items-center gap-2 py-6 text-sm text-ink-2">
          <LoaderCircle size={18} className="animate-spin" /> Analisando a foto… leva alguns segundos.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">{notes || 'Nenhum alimento identificado.'}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            Estimativas a partir da foto: confira o alimento e os gramas de cada item antes de adicionar.
          </p>
          <ul className="space-y-3">
            {items.map((item) => (
              <ReviewRow
                key={item.key}
                item={item}
                onChange={(change) => update(item.key, change)}
                onSearch={(search) => searchAgain(item.key, search)}
                onRemove={() => setItems(items.filter((i) => i.key !== item.key))}
              />
            ))}
          </ul>
          {notes && <p className="mt-3 text-xs text-ink-2">{notes}</p>}

          <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">
            <span className="font-semibold">{formatNumber(totals.kcal, 0)} kcal</span>
            <span className="text-ink-2">
              {' '}
              · P {formatNumber(totals.protein, 0)} g · C {formatNumber(totals.carbs, 0)} g · G{' '}
              {formatNumber(totals.fat, 0)} g
            </span>
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
          <Button
            variant="primary"
            className="mt-4 w-full"
            disabled={chosen.length === 0 || saving}
            onClick={() => void addAll()}
          >
            Adicionar {chosen.length} {chosen.length === 1 ? 'item' : 'itens'}
          </Button>
        </>
      )}
    </Modal>
  )
}

function ReviewRow({
  item,
  onChange,
  onSearch,
  onRemove,
}: {
  item: ReviewItem
  onChange: (change: Partial<ReviewItem>) => void
  onSearch: (search: string) => void
  onRemove: () => void
}) {
  const [searching, setSearching] = useState(item.candidates.length === 0)
  const food = item.candidates.find((candidate) => candidate.id === item.foodId)
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-medium">{item.name}</p>
        <span className={cx('flex shrink-0 items-center gap-1 text-xs', item.confidence === 'baixa' ? 'text-ink' : 'text-muted')}>
          {item.confidence === 'baixa' && <TriangleAlert size={12} />}
          {CONFIDENCE_LABEL[item.confidence]}
        </span>
        <IconButton label={`Remover ${item.name}`} className="size-8" onClick={onRemove}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
        <Select
          aria-label={`Alimento da tabela para ${item.name}`}
          value={item.foodId ?? ''}
          onChange={(e) => onChange({ foodId: e.target.value || undefined })}
          className="text-sm"
        >
          {item.candidates.length === 0 && <option value="">Nada parecido na tabela</option>}
          {item.candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </Select>
        <TextInput
          inputMode="numeric"
          aria-label={`Gramas de ${item.name}`}
          value={item.grams ? String(item.grams) : ''}
          onChange={(e) => onChange({ grams: Number(e.target.value.replace(/\D/g, '')) || 0 })}
          className="text-center"
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          {food
            ? `${formatNumber(scale(food.per100, item.grams).kcal, 0)} kcal em ${formatNumber(item.grams, 0)} g`
            : 'Escolha um alimento ou remova o item'}
        </span>
        {!searching && (
          <button type="button" className="font-medium text-accent-ink" onClick={() => setSearching(true)}>
            Buscar outro
          </button>
        )}
      </div>
      {searching && <SearchAgain initial={item.search} onSearch={onSearch} />}
    </li>
  )
}

/** Retypes the search words for one item when the suggested foods aren't right. */
function SearchAgain({ initial, onSearch }: { initial: string; onSearch: (search: string) => void }) {
  const [text, setText] = useState(initial)
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (text.trim()) onSearch(text)
      }}
    >
      <TextInput value={text} onChange={(e) => setText(e.target.value)} aria-label="Buscar outro alimento" className="h-9 text-sm" />
      <Button type="submit" size="sm">
        Buscar
      </Button>
    </form>
  )
}
