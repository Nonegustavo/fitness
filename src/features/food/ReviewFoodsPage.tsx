import { Check, LoaderCircle, Pencil, Sparkles, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '../../components/Toast'
import { Button, Card, Empty, Page, SkeletonLines } from '../../components/ui'
import { patch } from '../../db/repo'
import { db } from '../../db/schema'
import type { Food, FoodPref } from '../../db/types'
import { dayKey, formatDay } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { useSyncState } from '../../sync/controller'
import { FoodAvatar } from './FoodAvatar'
import { FoodForm } from './FoodForm'
import { useFoodPrefs } from './foods'
import { RecipeForm } from './RecipeForm'
import { confirmFood, reviewWithAi, type ReviewItem } from './review'
import { useFoodReview } from './useFoodReview'

/** "122 kcal · C 22 g · P 5 g · G 1,5 g por 100 g", in the order of the food screens. */
const valuesLine = ({ per100, unit }: Food) =>
  `${formatNumber(per100.kcal, 0)} kcal · C ${formatNumber(per100.carbs)} g · P ${formatNumber(per100.protein)} g · G ${formatNumber(per100.fat)} g ${unit === 'portion' ? 'por porção' : 'por 100 g'}`

/**
 * The user's own foods whose values look wrong: by the numbers alone (calories that don't match the
 * macros, more than 100 g can hold) or by the AI review. Each one is corrected, or confirmed as right.
 */
export default function ReviewFoodsPage() {
  const toast = useToast()
  const prefs = useFoodPrefs()
  const { items, state } = useFoodReview()
  const sync = useSyncState()
  // The AI review runs in a Supabase function, so it needs the sync set up and a login.
  const canAnalyze = sync.configured && !!sync.email
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<string>()
  const [editing, setEditing] = useState<Food | null>(null)

  async function runAi() {
    setRunning(true)
    setError(undefined)
    setResult(undefined)
    try {
      const count = await reviewWithAi()
      setResult(
        count === 0
          ? 'A IA não viu nada de errado nos seus alimentos.'
          : `A IA apontou ${count} ${count === 1 ? 'alimento' : 'alimentos'}.`,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A revisão falhou.')
    } finally {
      setRunning(false)
    }
  }

  async function confirm(food: Food) {
    const previous = food.checked
    await confirmFood(food)
    toast({
      message: `${food.name}: marcado como certo`,
      action: { label: 'Desfazer', onClick: () => void patch(db.foods, food.id, { checked: previous }) },
    })
  }

  return (
    <Page title="Revisar alimentos" back={{ to: '/alimentacao/adicionar', label: 'Adicionar alimento' }}>
      <Card>
        <p className="text-sm text-ink-2">
          Seus alimentos com valores que parecem errados: calorias que não batem com os macros, mais do que cabe em 100 g
          ou o que a revisão com IA apontou. Corrija, ou diga que está certo para tirar da lista.
        </p>
        <div className="mt-3 border-t border-line pt-3">
          <Button disabled={running || !canAnalyze} onClick={() => void runAi()}>
            {running ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {running ? 'Revisando…' : 'Revisar com IA'}
          </Button>
          <p className="mt-2 text-xs text-muted">
            {canAnalyze
              ? 'A IA compara cada alimento com o que ele costuma ter. Usa a análise paga: alguns centavos.'
              : 'A revisão com IA precisa da sincronização ligada e da sua conta, em Ajustes.'}
            {state?.at ? ` Última revisão: ${formatDay(dayKey(state.at), 'd/M')}.` : ''}
          </p>
          {error && <p className="mt-2 text-xs text-critical">{error}</p>}
          {result && <p className="mt-2 text-xs text-ink-2">{result}</p>}
        </div>
      </Card>

      <Card title={items && items.length > 0 ? `${items.length} para conferir` : undefined}>
        {!items ? (
          <SkeletonLines lines={3} />
        ) : items.length === 0 ? (
          <Empty>Nada para conferir.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <ReviewRow
                key={item.food.id}
                item={item}
                pref={prefs.get(item.food.id)}
                onFix={() => setEditing(item.food)}
                onConfirm={() => void confirm(item.food)}
              />
            ))}
          </ul>
        )}
      </Card>

      {editing &&
        (editing.source === 'recipe' ? (
          <RecipeForm recipe={editing} onClose={() => setEditing(null)} />
        ) : (
          <FoodForm food={editing} look={prefs.get(editing.id)} onClose={() => setEditing(null)} />
        ))}
    </Page>
  )
}

function ReviewRow({
  item: { food, warnings, ai },
  pref,
  onFix,
  onConfirm,
}: {
  item: ReviewItem
  pref?: FoodPref
  onFix: () => void
  onConfirm: () => void
}) {
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <FoodAvatar name={food.name} pref={pref} imageUrl={food.imageUrl} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {food.name}
            {food.brand && <span className="font-normal text-muted"> · {food.brand}</span>}
          </p>
          <p className="text-xs text-muted tabular-nums">{valuesLine(food)}</p>
          <ul className="mt-1.5 space-y-1 text-xs text-(--tone-habits)">
            {warnings.map((warning) => (
              <li key={warning.code} className="flex gap-1.5">
                <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden />
                {warning.text}
              </li>
            ))}
            {ai && (
              <li className="flex gap-1.5">
                <Sparkles size={14} className="mt-px shrink-0" aria-hidden />
                <span>
                  {ai.problem}
                  {ai.likely && <span className="block text-ink-2">{ai.likely}</span>}
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={onConfirm}>
          <Check size={16} /> Está certo
        </Button>
        <Button size="sm" onClick={onFix}>
          <Pencil size={16} /> Corrigir
        </Button>
      </div>
    </li>
  )
}
