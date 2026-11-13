import { Trash2, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { useRemoveWithUndo } from '../../components/SwipeToDelete'
import { Button, DecimalInput, Empty, Field, IconButton, TextInput } from '../../components/ui'
import { save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Food, Nutrients, RecipeIngredient } from '../../db/types'
import { formatNumber, parseDecimal } from '../../lib/format'
import { newId } from '../../lib/ids'
import { FoodAvatar } from './FoodAvatar'
import { buildIndex, searchFoods, useFoodCatalog, useFoodPrefs, weighed, type FoodItem } from './foods'
import { multiply } from './nutrition'
import { ingredientsWeight, recipePer100, recipeTotal } from './recipes'

interface Row {
  key: string
  ingredient: RecipeIngredient
  /** As typed, so "12," survives while typing. */
  gramsText: string
}

const asText = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',')
const toRow = (ingredient: RecipeIngredient): Row => ({ key: newId(), ingredient, gramsText: asText(ingredient.grams) })

const summary = (n: Nutrients) =>
  `${formatNumber(n.kcal, 0)} kcal · C ${formatNumber(n.carbs, 0)} g · P ${formatNumber(n.protein, 0)} g · G ${formatNumber(n.fat, 0)} g`

/** A dish made of other foods; once saved it is searched and logged like any food. */
export function RecipeForm({
  recipe,
  onClose,
  onSaved,
}: {
  recipe?: Food | null
  onClose: () => void
  onSaved?: (food: Food) => void
}) {
  const removeWithUndo = useRemoveWithUndo()
  const catalog = useFoodCatalog()
  const prefs = useFoodPrefs()
  // A recipe can't go inside itself.
  // Ingredients go in by weight, so foods measured in portions stay out.
  const index = useMemo(() => buildIndex(weighed(catalog).filter((item) => item.id !== recipe?.id)), [catalog, recipe?.id])
  const images = useMemo(() => new Map(catalog.flatMap((item) => (item.imageUrl ? [[item.id, item.imageUrl] as const] : []))), [catalog])
  const [name, setName] = useState(recipe?.name ?? '')
  const [rows, setRows] = useState<Row[]>(() => (recipe?.ingredients ?? []).map(toRow))
  const [readyText, setReadyText] = useState(recipe?.yieldGrams ? asText(recipe.yieldGrams) : '')
  const [servingsText, setServingsText] = useState(() => {
    const portion = recipe?.portions?.[0]
    const weight = recipe?.yieldGrams ?? ingredientsWeight(recipe?.ingredients ?? [])
    return portion && weight > 0 ? String(Math.round(weight / portion.grams)) : ''
  })
  const [query, setQuery] = useState('')
  const results = useMemo(() => (query.trim() ? searchFoods(index, query, prefs, 8) : []), [index, query, prefs])

  const ingredients = rows.map((row) => row.ingredient)
  const readyGrams = parseDecimal(readyText)
  const ready = readyGrams !== undefined && readyGrams > 0 ? readyGrams : undefined
  const weight = ready ?? ingredientsWeight(ingredients)
  const servings = parseDecimal(servingsText)
  const perServing = servings !== undefined && servings >= 1 ? weight / servings : undefined
  const total = recipeTotal(ingredients)
  const per100 = recipePer100(ingredients, ready)
  const valid =
    name.trim() !== '' &&
    rows.length > 0 &&
    ingredients.every((ingredient) => ingredient.grams > 0) &&
    weight > 0 &&
    (servingsText.trim() === '' || perServing !== undefined)

  function add(item: FoodItem) {
    const grams = prefs.get(item.id)?.lastGrams ?? item.portions[0]?.grams ?? 100
    setRows((current) => [...current, toRow({ foodId: item.id, name: item.name, grams, per100: item.per100 })])
    setQuery('')
  }

  function setGrams(key: string, text: string) {
    const grams = parseDecimal(text) ?? 0
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, gramsText: text, ingredient: { ...row.ingredient, grams } } : row)),
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    const saved = await save(db.foods, {
      id: recipe?.id,
      name: name.trim(),
      per100,
      portions: perServing ? [{ label: '1 porção', grams: Math.round(perServing) }] : undefined,
      source: 'recipe',
      ingredients,
      yieldGrams: ready,
      // Still says which values the user confirmed: it only counts while they're the same.
      checked: recipe?.checked,
    })
    onSaved?.(saved)
    onClose()
  }

  // Past logs keep their own copy of the name and values, so undoing is all a mistaken tap needs.
  function onDelete() {
    if (!recipe) return
    removeWithUndo(db.foods, recipe.id, 'Receita apagada')
    onClose()
  }

  return (
    <Modal open title={recipe ? 'Editar receita' : 'Nova receita'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <TextInput
            autoFocus={!recipe}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Frango com batata-doce"
          />
        </Field>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-2">Ingredientes</legend>
          {rows.length === 0 ? (
            <Empty>Busque abaixo e toque para adicionar.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <li key={row.key} className="flex items-center gap-2 py-1.5">
                  <FoodAvatar
                    name={row.ingredient.name}
                    pref={prefs.get(row.ingredient.foodId)}
                    imageUrl={images.get(row.ingredient.foodId)}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{row.ingredient.name}</span>
                  <DecimalInput
                    aria-label={`Gramas de ${row.ingredient.name}`}
                    value={row.gramsText}
                    onChange={(e) => setGrams(row.key, e.target.value)}
                    className="h-9 w-20 px-2 text-center"
                  />
                  <span className="text-xs text-muted">g</span>
                  <IconButton
                    label={`Tirar ${row.ingredient.name}`}
                    className="size-9"
                    onClick={() => setRows((current) => current.filter((other) => other.key !== row.key))}
                  >
                    <X size={16} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <TextInput
            type="search"
            className="mt-2"
            aria-label="Buscar ingrediente"
            placeholder="Adicionar ingrediente: arroz, frango…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <ul className="scroll-fade-y mt-1 max-h-48 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => add(item)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
                  >
                    <FoodAvatar name={item.name} pref={prefs.get(item.id)} imageUrl={item.imageUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                    <span className="shrink-0 text-xs text-muted">{formatNumber(item.per100.kcal, 0)} kcal/100 g</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Peso pronto (g)" hint="Se mudar no preparo">
            <DecimalInput
              value={readyText}
              onChange={(e) => setReadyText(e.target.value)}
              placeholder={formatNumber(ingredientsWeight(ingredients), 0)}
            />
          </Field>
          <Field label="Rende (porções)" hint="Opcional">
            <DecimalInput value={servingsText} onChange={(e) => setServingsText(e.target.value)} placeholder="—" />
          </Field>
        </div>

        {rows.length > 0 && (
          <dl className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-ink-2">Receita inteira ({formatNumber(weight, 0)} g)</dt>
              <dd className="text-right">{summary(total)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-2">Por 100 g</dt>
              <dd className="text-right">{summary(per100)}</dd>
            </div>
            {perServing !== undefined && (
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">Por porção ({formatNumber(perServing, 0)} g)</dt>
                <dd className="text-right">{summary(multiply(per100, perServing / 100))}</dd>
              </div>
            )}
          </dl>
        )}

        <div className="flex gap-2">
          {recipe && (
            <Button variant="danger" onClick={onDelete}>
              <Trash2 size={16} /> Apagar
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>
            Salvar receita
          </Button>
        </div>
      </form>
    </Modal>
  )
}
