import { Camera, CookingPot, MessageSquareText, Plus, ScanBarcode, ScanText, Star, Trash2, Utensils, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Modal } from '../../components/Modal'
import { PageTabs } from '../../components/PageTabs'
import { SwipeToDelete, useRemoveWithUndo } from '../../components/SwipeToDelete'
import { useToast } from '../../components/Toast'
import { Button, Card, Empty, Field, IconButton, Page, Select, TextInput } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { remove } from '../../db/repo'
import { db } from '../../db/schema'
import type { FoodLog, FoodPref, MealKey, SavedMeal } from '../../db/types'
import { formatTime, shiftDay } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { useSyncState } from '../../sync/controller'
import { suggestFoodEmojis } from './aiEmojis'
import { BarcodeScanner } from './BarcodeScanner'
import { CameraCapture } from './Camera'
import { FoodAvatar } from './FoodAvatar'
import { FoodForm, type FoodDraft } from './FoodForm'
import { buildIndex, fromCustom, logFood, recentForMeal, searchFoods, usualAmount, TACO_SOURCE, useFoodCatalog, useFoodPrefs, type FoodItem } from './foods'
import { amountLabel, logItems, MEAL_LABEL, mealAt, MEALS, nutrientsFor, sumNutrients, useFoodLogs, useSavedMeals } from './nutrition'
import { fetchProduct } from './openFoodFacts'
import type { MealSource } from './photo'
import { PhotoReview } from './PhotoReview'
import { PortionModal } from './PortionModal'
import { RecipeForm } from './RecipeForm'

type Tab = 'favorites' | 'meals' | 'recent'

const LISTS: { value: Tab; label: string }[] = [
  { value: 'favorites', label: 'Favoritos' },
  { value: 'meals', label: 'Refeições' },
  { value: 'recent', label: 'Recentes' },
]

/** What the camera button photographs: the plate, a barcode, or a nutrition table. */
type CameraMode = 'plate' | 'barcode' | 'label'

const isMeal = (value: string | null): value is MealKey => MEALS.some((meal) => meal.key === value)

export default function AddFoodPage() {
  const toast = useToast()
  const removeWithUndo = useRemoveWithUndo()
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const date = params.get('data') ?? today
  const requested = params.get('refeicao')
  const [meal, setMeal] = useState<MealKey>(isMeal(requested) ? requested : mealAt(new Date()))
  // When it was eaten; null follows the clock (logged now).
  const [time, setTime] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('favorites')
  const [selected, setSelected] = useState<FoodItem | null>(null)
  const [draft, setDraft] = useState<FoodDraft | null>(null)
  const [review, setReview] = useState<MealSource | null>(null)
  const [describing, setDescribing] = useState(false)
  const [creatingRecipe, setCreatingRecipe] = useState(false)
  const [labelPhoto, setLabelPhoto] = useState<Blob | null>(null)
  const sync = useSyncState()
  // The analysis runs in a Supabase function, so it needs the sync set up and a login.
  const canAnalyze = sync.configured && !!sync.email
  // "?camera=prato" (the "+" menu's plate photo) opens the camera right away. The login is checked once
  // the photo is taken: right after the app opens, it may not be known yet.
  const fromMenu = params.get('camera') === 'prato'
  const [choosing, setChoosing] = useState(false)
  const [camera, setCamera] = useState<CameraMode | null>(fromMenu ? 'plate' : null)
  const [analysisHelp, setAnalysisHelp] = useState(false)

  useEffect(() => {
    suggestFoodEmojis()
    // Once: going back to this page later shouldn't open the camera again.
    if (fromMenu) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('camera')
          return next
        },
        { replace: true },
      )
    }
  }, [])

  const catalog = useFoodCatalog()
  const prefs = useFoodPrefs()
  const savedMeals = useSavedMeals()
  const lastMonth = useFoodLogs(shiftDay(today, -30), today)
  const index = useMemo(() => buildIndex(catalog), [catalog])
  const byId = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog])
  const results = useMemo(() => searchFoods(index, query, prefs), [index, query, prefs])

  const fromPrefs = (keep: (pref: FoodPref) => boolean, order: (a: FoodPref, b: FoodPref) => number) =>
    [...prefs.values()]
      .filter(keep)
      .sort(order)
      .flatMap((pref) => byId.get(pref.id) ?? [])
  const byRecency = fromPrefs((p) => !!p.lastUsedAt, (a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)).map((item) => item.id)
  // What's usually eaten in this meal comes first: bread in the morning, rice at lunch.
  const recent = recentForMeal(lastMonth ?? [], meal, byRecency)
    .flatMap((id) => byId.get(id) ?? [])
    .slice(0, 30)
  const favorites = fromPrefs((p) => p.favorite === 1, (a, b) => (byId.get(a.id)?.name ?? '').localeCompare(byId.get(b.id)?.name ?? ''))
  const recipes = catalog.filter((item) => item.source === 'recipe').sort((a, b) => a.name.localeCompare(b.name))

  // The search keeps no focus: the keyboard only comes up when the field is tapped.
  const onLogged = (log: FoodLog) => {
    toast({
      message: `${log.name} · ${amountLabel(log.grams, log.unit, log.portion).split(' · ')[0]} · ${MEAL_LABEL[log.meal]}`,
      action: { label: 'Desfazer', onClick: () => void remove(db.foodLogs, log.id) },
    })
    setQuery('')
  }

  /** The "+" of a list: the usual amount, without opening the food. */
  async function quickAdd(item: FoodItem) {
    const { grams, portion } = usualAmount(item, prefs.get(item.id)?.lastGrams)
    onLogged(await logFood(item, grams, { meal, date, time: time ?? undefined, portion }))
  }

  const onBarcode = useCallback(
    async (code: string) => {
      setCamera(null)
      const known = await db.foods.where('barcode').equals(code).filter((food) => food.deleted === 0).first()
      if (known) {
        setSelected(fromCustom(known))
        return
      }
      toast({ message: 'Buscando o produto…' })
      try {
        const product = await fetchProduct(code)
        if (product) {
          setDraft({ ...product, barcode: code, source: 'openfoodfacts' })
        } else {
          toast({ message: 'Produto não encontrado. Preencha com a tabela da embalagem.' })
          setDraft({ barcode: code })
        }
      } catch {
        toast({ message: 'Sem conexão com o Open Food Facts. Preencha com a tabela da embalagem.' })
        setDraft({ barcode: code })
      }
    },
    [toast],
  )

  /** The camera for what was picked; the plate and the label are read by Claude, which needs the login. */
  function openCamera(mode: CameraMode) {
    setChoosing(false)
    if (mode !== 'barcode' && !canAnalyze) setAnalysisHelp(true)
    else setCamera(mode)
  }

  async function addSavedMeal(saved: SavedMeal) {
    await logItems(saved.items, meal, date, time ?? undefined)
    toast({ message: `${saved.name} · ${MEAL_LABEL[meal]}` })
  }

  const list = (items: FoodItem[], empty: string) =>
    items.length === 0 ? (
      <Empty>{empty}</Empty>
    ) : (
      <FoodList items={items} prefs={prefs} onSelect={setSelected} onAdd={(item) => void quickAdd(item)} />
    )

  return (
    <Page title="Adicionar alimento" back={{ to: date === today ? '/alimentacao' : `/alimentacao?data=${date}`, label: 'Alimentação' }}>
      <Card>
        <div className="flex gap-2">
          <TextInput
            type="search"
            placeholder="Buscar: arroz, frango grelhado…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <IconButton label="Câmera: prato, código de barras ou tabela" className="size-11 border border-line" onClick={() => setChoosing(true)}>
            <Camera size={20} />
          </IconButton>
          <IconButton
            label="Descrever o que comi"
            className="size-11 border border-line"
            onClick={() => (canAnalyze ? setDescribing(true) : setAnalysisHelp(true))}
          >
            <MessageSquareText size={20} />
          </IconButton>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_8.5rem] gap-3">
          <Field label="Refeição">
            <Select value={meal} onChange={(e) => setMeal(e.target.value as MealKey)}>
              {MEALS.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hora">
            <TextInput
              type="time"
              value={time ?? formatTime(Date.now())}
              onChange={(e) => setTime(e.target.value || null)}
            />
          </Field>
        </div>
      </Card>

      {query.trim() ? (
        <Card title={`${results.length === 60 ? 'Primeiros 60' : results.length} resultados`}>
          {list(results, 'Nada encontrado.')}
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setDraft({ name: query.trim() })}>
            <Plus size={16} /> Criar “{query.trim()}”
          </Button>
        </Card>
      ) : (
        <Card>
          <PageTabs label="Lista" value={tab} onChange={setTab} options={LISTS} bleed={false} gap="space-y-3">
            {(shown) => (
              <>
                {shown === 'favorites' && list(favorites, 'Toque na estrela de um alimento para favoritá-lo.')}
                {shown === 'meals' && (
                  <>
                    {savedMeals?.length ? (
                      <ul className="divide-y divide-line">
                        {savedMeals.map((saved) => {
                          const onDelete = () => removeWithUndo(db.savedMeals, saved.id, `${saved.name} apagada`)
                          return (
                            <SwipeToDelete key={saved.id} onDelete={onDelete}>
                              <div className="flex items-center gap-2 py-2">
                                <button type="button" onClick={() => void addSavedMeal(saved)} className="min-w-0 flex-1 text-left">
                                  <span className="block truncate text-sm font-medium">{saved.name}</span>
                                  <span className="block truncate text-xs text-muted">
                                    {formatNumber(sumNutrients(saved.items.map((i) => i.nutrients)).kcal, 0)} kcal ·{' '}
                                    {saved.items.map((i) => i.name.split(',')[0]).join(', ')}
                                  </span>
                                </button>
                                <IconButton label={`Apagar ${saved.name}`} onClick={onDelete}>
                                  <Trash2 size={16} />
                                </IconButton>
                              </div>
                            </SwipeToDelete>
                          )
                        })}
                      </ul>
                    ) : (
                      <Empty>Abra uma refeição do dia e toque em “Salvar como refeição” para reaproveitá-la aqui.</Empty>
                    )}
                    <h3 className="mt-4 mb-1 text-sm font-semibold text-ink-2">Receitas</h3>
                    {list(recipes, 'Monte uma receita com os ingredientes e registre por porção ou em gramas.')}
                  </>
                )}
                {shown === 'recent' && (
                  <>
                    {recent.length > 0 && (
                      <p className="mb-1 text-xs text-muted">Os mais comuns no {MEAL_LABEL[meal].toLowerCase()} primeiro.</p>
                    )}
                    {list(recent, 'Os alimentos que você registrar aparecem aqui.')}
                  </>
                )}
              </>
            )}
          </PageTabs>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => setDraft({})}>
              <Plus size={16} /> Criar alimento
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreatingRecipe(true)}>
              <CookingPot size={16} /> Criar receita
            </Button>
          </div>
        </Card>
      )}

      <p className="px-1 text-xs text-muted">
        Dados de composição: {TACO_SOURCE}. Produtos por código de barras: Open Food Facts (ODbL).
      </p>

      {selected && (
        <PortionModal
          key={selected.id}
          item={selected}
          initialMeal={meal}
          date={date}
          time={time ?? undefined}
          pref={prefs.get(selected.id)}
          onClose={() => setSelected(null)}
          onLogged={onLogged}
          onEdited={setSelected}
        />
      )}
      {creatingRecipe && (
        <RecipeForm onClose={() => setCreatingRecipe(false)} onSaved={(food) => setSelected(fromCustom(food))} />
      )}
      {describing && (
        <DescribeModal
          onClose={() => setDescribing(false)}
          onSubmit={(text) => {
            setDescribing(false)
            setReview({ kind: 'text', text })
          }}
        />
      )}
      {draft && (
        <FoodForm
          initial={draft}
          labelPhoto={labelPhoto ?? undefined}
          onClose={() => {
            setDraft(null)
            setLabelPhoto(null)
          }}
          onSaved={(food) => setSelected(fromCustom(food))}
        />
      )}
      {choosing && <CameraChoice onChoose={openCamera} onClose={() => setChoosing(false)} />}
      {camera === 'plate' && (
        <CameraCapture
          title="Foto do prato"
          hint="O prato inteiro, de cima."
          onClose={() => setCamera(null)}
          onCapture={(file) => {
            setCamera(null)
            if (canAnalyze) setReview({ kind: 'photo', file })
            else setAnalysisHelp(true)
          }}
        />
      )}
      {camera === 'label' && (
        <CameraCapture
          title="Tabela nutricional"
          hint="A tabela inteira, reta e com luz."
          onClose={() => setCamera(null)}
          onCapture={(file) => {
            setCamera(null)
            setLabelPhoto(file)
            setDraft({})
          }}
        />
      )}
      {camera === 'barcode' && <BarcodeScanner onClose={() => setCamera(null)} onDetected={onBarcode} />}
      {review && (
        <PhotoReview
          source={review}
          initialMeal={meal}
          date={date}
          time={time ?? undefined}
          onClose={() => setReview(null)}
          onDone={(count, logged) =>
            toast({ message: `${count} ${count === 1 ? 'item adicionado' : 'itens adicionados'} · ${MEAL_LABEL[logged]}` })
          }
        />
      )}
      {analysisHelp && (
        <Modal open title="Análise da refeição" onClose={() => setAnalysisHelp(false)}>
          <p className="text-sm text-ink-2">
            A análise da foto ou do texto roda num servidor seu (Supabase), que guarda a chave da IA com segurança.
            Ligue a sincronização e entre na sua conta em Ajustes; o passo a passo está no README do projeto.
          </p>
          <Link to="/ajustes" className="mt-4 inline-block font-medium text-accent-ink">
            Abrir Ajustes
          </Link>
        </Modal>
      )}
    </Page>
  )
}

const CAMERA_CHOICES: { mode: CameraMode; label: string; detail: string; icon: LucideIcon }[] = [
  { mode: 'plate', label: 'Prato', detail: 'A IA lista os alimentos e os gramas', icon: Utensils },
  { mode: 'barcode', label: 'Código de barras', detail: 'O produto no Open Food Facts', icon: ScanBarcode },
  { mode: 'label', label: 'Tabela nutricional', detail: 'A IA lê os valores da embalagem', icon: ScanText },
]

/** What to photograph: each choice opens the in-app camera for it. */
function CameraChoice({ onChoose, onClose }: { onChoose: (mode: CameraMode) => void; onClose: () => void }) {
  return (
    <Modal open title="Câmera" onClose={onClose}>
      <ul className="space-y-2">
        {CAMERA_CHOICES.map(({ mode, label, detail, icon: Icon }) => (
          <li key={mode}>
            <button
              type="button"
              onClick={() => onChoose(mode)}
              className="flex w-full items-center gap-3 rounded-xl bg-surface-2 p-3 text-left transition hover:brightness-110 active:scale-[0.98]"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-ink-2">
                <Icon size={20} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block truncate text-xs text-muted">{detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/** "2 ovos mexidos", "1 pão francês": the list of what was eaten, which goes straight to the macros. */
function DescribeModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <Modal open title="Descrever o que comi" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim()) onSubmit(text.trim())
        }}
      >
        <textarea
          autoFocus
          rows={5}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Ex.:\n2 ovos mexidos\n1 pão francês com manteiga\n1 xícara de café com leite'}
          className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent/30"
        />
        <p className="text-xs text-muted">
          Um item por linha, com a quantidade quando souber (“200 g de frango”, “1 concha de feijão”); sem ela, vale uma
          porção comum. Você confere os gramas e os macros antes de adicionar.
        </p>
        <Button type="submit" variant="primary" className="w-full" disabled={!text.trim()}>
          Calcular os macros
        </Button>
      </form>
    </Modal>
  )
}

/** "120 kcal/2 fatias" for a food with a portion, "128 kcal/100 g" otherwise. */
function kcalPer(item: FoodItem): string {
  const portion = item.unit === 'portion' ? undefined : item.portions[0]
  if (portion) return `${formatNumber((item.per100.kcal * portion.grams) / 100, 0)} kcal/${portion.label}`
  return `${formatNumber(item.per100.kcal, 0)} kcal/${item.unit === 'portion' ? 'porção' : '100 g'}`
}

function FoodList({
  items,
  prefs,
  onSelect,
  onAdd,
}: {
  items: FoodItem[]
  prefs: Map<string, FoodPref>
  onSelect: (item: FoodItem) => void
  /** The "+": logs the usual amount right away. */
  onAdd: (item: FoodItem) => void
}) {
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => {
        const pref = prefs.get(item.id)
        const usual = usualAmount(item, pref?.lastGrams)
        const usualLabel = amountLabel(usual.grams, item.unit, usual.portion).split(' · ')[0]
        return (
          <li key={item.id} className="flex items-center gap-1">
            <button type="button" onClick={() => onSelect(item)} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
              <FoodAvatar name={item.name} pref={pref} imageUrl={item.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.name}</p>
                <p className="truncate text-xs text-muted">{item.detail}</p>
              </div>
              {pref?.favorite === 1 && <Star size={14} className="shrink-0 fill-current text-accent-ink" />}
              <span className="shrink-0 text-right text-xs text-ink-2 tabular-nums">
                {pref?.lastGrams !== undefined ? (
                  <>
                    <span className="block">{formatNumber(nutrientsFor(item.per100, usual.grams, item.unit).kcal, 0)} kcal</span>
                    <span className="block text-muted">{usualLabel}</span>
                  </>
                ) : (
                  kcalPer(item)
                )}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Adicionar ${usualLabel} de ${item.name}`}
              title={`Adicionar ${usualLabel}`}
              onClick={() => onAdd(item)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink transition hover:brightness-110 active:scale-90"
            >
              <Plus size={18} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
