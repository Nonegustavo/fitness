import { Camera, Plus, ScanBarcode, Star, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, Card, Empty, Field, IconButton, Page, Segmented, Select, TextInput } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { remove } from '../../db/repo'
import { db } from '../../db/schema'
import type { FoodLog, FoodPref, MealKey, SavedMeal } from '../../db/types'
import { formatNumber } from '../../lib/format'
import { useSyncState } from '../../sync/controller'
import { BarcodeScanner } from './BarcodeScanner'
import { FoodForm, type FoodDraft } from './FoodForm'
import { buildIndex, fromCustom, searchFoods, TACO_SOURCE, useFoodCatalog, useFoodPrefs, type FoodItem } from './foods'
import { logItems, MEAL_LABEL, mealAt, MEALS, sumNutrients, useSavedMeals } from './nutrition'
import { fetchProduct } from './openFoodFacts'
import { PhotoReview } from './PhotoReview'
import { PortionModal } from './PortionModal'

type Tab = 'recent' | 'favorites' | 'meals'

const isMeal = (value: string | null): value is MealKey => MEALS.some((meal) => meal.key === value)

export default function AddFoodPage() {
  const toast = useToast()
  const today = useToday()
  const [params] = useSearchParams()
  const date = params.get('data') ?? today
  const requested = params.get('refeicao')
  const [meal, setMeal] = useState<MealKey>(isMeal(requested) ? requested : mealAt(new Date()))
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('recent')
  const [selected, setSelected] = useState<FoodItem | null>(null)
  const [draft, setDraft] = useState<FoodDraft | null>(null)
  const [scanning, setScanning] = useState(false)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoHelp, setPhotoHelp] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const sync = useSyncState()
  // The analysis runs in a Supabase function, so it needs the sync set up and a login.
  const canAnalyze = sync.configured && !!sync.email

  const catalog = useFoodCatalog()
  const prefs = useFoodPrefs()
  const savedMeals = useSavedMeals()
  const index = useMemo(() => buildIndex(catalog), [catalog])
  const byId = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog])
  const results = useMemo(() => searchFoods(index, query, prefs), [index, query, prefs])

  const fromPrefs = (keep: (pref: FoodPref) => boolean, order: (a: FoodPref, b: FoodPref) => number) =>
    [...prefs.values()]
      .filter(keep)
      .sort(order)
      .flatMap((pref) => byId.get(pref.id) ?? [])
  const recent = fromPrefs((p) => !!p.lastUsedAt, (a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)).slice(0, 30)
  const favorites = fromPrefs((p) => p.favorite === 1, (a, b) => (byId.get(a.id)?.name ?? '').localeCompare(byId.get(b.id)?.name ?? ''))

  const onLogged = (log: FoodLog) => {
    toast({ message: `${log.name} · ${MEAL_LABEL[log.meal]}`, action: { label: 'Desfazer', onClick: () => void remove(db.foodLogs, log.id) } })
    setQuery('')
    search.current?.focus()
  }

  const onBarcode = useCallback(
    async (code: string) => {
      setScanning(false)
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

  async function addSavedMeal(saved: SavedMeal) {
    await logItems(saved.items, meal, date)
    toast({ message: `${saved.name} · ${MEAL_LABEL[meal]}` })
  }

  const list = (items: FoodItem[], empty: string) =>
    items.length === 0 ? <Empty>{empty}</Empty> : <FoodList items={items} prefs={prefs} onSelect={setSelected} />

  return (
    <Page title="Adicionar alimento" back={{ to: date === today ? '/alimentacao' : `/alimentacao?data=${date}`, label: 'Alimentação' }}>
      <Card>
        <div className="flex gap-2">
          <TextInput
            ref={search}
            type="search"
            autoFocus
            placeholder="Buscar: arroz, frango grelhado…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <IconButton label="Ler código de barras" className="size-11 border border-line" onClick={() => setScanning(true)}>
            <ScanBarcode size={20} />
          </IconButton>
          <IconButton
            label="Foto do prato"
            className="size-11 border border-line"
            onClick={() => (canAnalyze ? photoInput.current?.click() : setPhotoHelp(true))}
          >
            <Camera size={20} />
          </IconButton>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) setPhoto(file)
              event.target.value = ''
            }}
          />
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
          <Segmented
            label="Lista"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'recent', label: 'Recentes' },
              { value: 'favorites', label: 'Favoritos' },
              { value: 'meals', label: 'Refeições' },
            ]}
          />
          <div className="mt-3">
            {tab === 'recent' && list(recent, 'Os alimentos que você registrar aparecem aqui.')}
            {tab === 'favorites' && list(favorites, 'Toque na estrela de um alimento para favoritá-lo.')}
            {tab === 'meals' &&
              (savedMeals?.length ? (
                <ul className="divide-y divide-line">
                  {savedMeals.map((saved) => (
                    <li key={saved.id} className="flex items-center gap-2 py-2">
                      <button type="button" onClick={() => void addSavedMeal(saved)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium">{saved.name}</p>
                        <p className="truncate text-xs text-muted">
                          {formatNumber(sumNutrients(saved.items.map((i) => i.nutrients)).kcal, 0)} kcal ·{' '}
                          {saved.items.map((i) => i.name.split(',')[0]).join(', ')}
                        </p>
                      </button>
                      <IconButton label={`Apagar ${saved.name}`} onClick={() => void remove(db.savedMeals, saved.id)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Use “Salvar como refeição” numa refeição do dia para reaproveitá-la aqui.</Empty>
              ))}
          </div>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setDraft({})}>
            <Plus size={16} /> Criar alimento
          </Button>
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
          lastGrams={prefs.get(selected.id)?.lastGrams}
          favorite={prefs.get(selected.id)?.favorite === 1}
          onClose={() => setSelected(null)}
          onLogged={onLogged}
        />
      )}
      {draft && (
        <FoodForm initial={draft} onClose={() => setDraft(null)} onSaved={(food) => setSelected(fromCustom(food))} />
      )}
      {scanning && <BarcodeScanner onClose={() => setScanning(false)} onDetected={onBarcode} />}
      {photo && (
        <PhotoReview
          file={photo}
          initialMeal={meal}
          date={date}
          index={index}
          prefs={prefs}
          onClose={() => setPhoto(null)}
          onDone={(count, logged) =>
            toast({ message: `${count} ${count === 1 ? 'item adicionado' : 'itens adicionados'} · ${MEAL_LABEL[logged]}` })
          }
        />
      )}
      {photoHelp && (
        <Modal open title="Foto do prato" onClose={() => setPhotoHelp(false)}>
          <p className="text-sm text-ink-2">
            A análise da foto roda num servidor seu (Supabase), que guarda a chave da IA com segurança. Ligue a
            sincronização e entre na sua conta em Ajustes; o passo a passo está no README do projeto.
          </p>
          <Link to="/ajustes" className="mt-4 inline-block font-medium text-accent-ink">
            Abrir Ajustes
          </Link>
        </Modal>
      )}
    </Page>
  )
}

function FoodList({
  items,
  prefs,
  onSelect,
}: {
  items: FoodItem[]
  prefs: Map<string, FoodPref>
  onSelect: (item: FoodItem) => void
}) {
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" onClick={() => onSelect(item)} className="flex w-full items-center gap-3 py-2 text-left">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{item.name}</p>
              <p className="truncate text-xs text-muted">{item.detail}</p>
            </div>
            {prefs.get(item.id)?.favorite === 1 && <Star size={14} className="shrink-0 fill-current text-accent-ink" />}
            <span className="shrink-0 text-xs text-ink-2 tabular-nums">{formatNumber(item.per100.kcal, 0)} kcal/100 g</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
