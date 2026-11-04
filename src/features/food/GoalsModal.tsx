import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, DecimalInput, Field } from '../../components/ui'
import { useLiveQuery } from 'dexie-react-hooks'
import { useToday } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { MacroGoals, Settings } from '../../db/types'
import { formatNumber, formatSigned, parseDecimal } from '../../lib/format'
import { useWeights } from '../body/body'
import { MacroBalance } from './MacroViews'
import { kcalForRate, type Expenditure } from './energy'
import { kcalFromMacros } from './nutrition'
import { useExpenditure } from './useExpenditure'

type GoalTexts = Record<keyof MacroGoals, string>

const FIELDS: { key: keyof MacroGoals; label: string }[] = [
  { key: 'kcal', label: 'Calorias (kcal)' },
  { key: 'carbs', label: 'Carboidratos (g)' },
  { key: 'protein', label: 'Proteína (g)' },
  { key: 'fat', label: 'Gorduras (g)' },
]

const toTexts = (goals?: MacroGoals): GoalTexts => ({
  kcal: goals ? String(Math.round(goals.kcal)) : '',
  protein: goals ? String(Math.round(goals.protein)) : '',
  carbs: goals ? String(Math.round(goals.carbs)) : '',
  fat: goals ? String(Math.round(goals.fat)) : '',
})

/** Other calories, with the difference in carbs (4 kcal/g), protein and fat as they were. */
function withCalories(texts: GoalTexts, kcal: number): GoalTexts {
  const goals = parseGoals(texts)
  const rounded = String(Math.round(kcal))
  if (!goals) return { ...texts, kcal: rounded }
  return { ...texts, kcal: rounded, carbs: String(Math.round(Math.max(0, goals.carbs + (kcal - goals.kcal) / 4))) }
}

function parseGoals(texts: GoalTexts): MacroGoals | undefined {
  const values = FIELDS.map(({ key }) => parseDecimal(texts[key]))
  if (values.some((value) => value === undefined || value < 0) || !values[0]) return undefined
  const [kcal, carbs, protein, fat] = values as number[]
  return { kcal, protein, carbs, fat }
}

export function GoalsModal({ onClose }: { onClose: () => void }) {
  // The form starts from the saved goals, so it waits for them to load instead of starting empty.
  const settings = useLiveQuery(() => db.settings.get(SETTINGS_ID))
  return settings ? <GoalsForm settings={settings} onClose={onClose} /> : null
}

function GoalsForm({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const weightKg = useWeights()?.at(-1)?.weightKg
  const [normal, setNormal] = useState(() => toTexts(settings.nutrition?.normal))
  const [hasTraining, setHasTraining] = useState(!!settings.nutrition?.training)
  const [training, setTraining] = useState(() => toTexts(settings.nutrition?.training ?? settings.nutrition?.normal))
  const normalGoals = parseGoals(normal)
  const trainingGoals = parseGoals(training)
  const valid = !!normalGoals && (!hasTraining || !!trainingGoals)
  const expenditure = useExpenditure(useToday())

  /** Takes the suggested calories, keeping protein and fat and moving the difference into carbs. */
  function applySuggestion(kcal: number) {
    const before = parseGoals(normal)
    setNormal(withCalories(normal, kcal))
    // Training days keep their extra calories over the normal ones.
    const trainingGoalsNow = parseGoals(training)
    if (hasTraining && before && trainingGoalsNow) {
      setTraining(withCalories(training, kcal + trainingGoalsNow.kcal - before.kcal))
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!normalGoals) return
    await patch(db.settings, SETTINGS_ID, {
      nutrition: { normal: normalGoals, training: hasTraining ? trainingGoals : undefined },
    })
    onClose()
  }

  return (
    <Modal open title="Metas de alimentação" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ExpenditureBox expenditure={expenditure} kgPerWeek={settings.weightGoal?.kgPerWeek} onApply={applySuggestion} />
        <GoalFields title={hasTraining ? 'Dias sem treino' : 'Meta diária'} texts={normal} onChange={setNormal} weightKg={weightKg} />
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={hasTraining}
            onChange={(e) => setHasTraining(e.target.checked)}
            className="size-5 accent-(--accent)"
          />
          Metas diferentes nos dias de treino
        </label>
        {hasTraining && <GoalFields title="Dias de treino" texts={training} onChange={setTraining} weightKg={weightKg} />}
        <Button type="submit" variant="primary" className="w-full" disabled={!valid}>
          Salvar
        </Button>
      </form>
    </Modal>
  )
}

function GoalFields({
  title,
  texts,
  onChange,
  weightKg,
}: {
  title: string
  texts: GoalTexts
  onChange: (texts: GoalTexts) => void
  weightKg?: number
}) {
  const protein = parseDecimal(texts.protein)
  const carbs = parseDecimal(texts.carbs)
  const fat = parseDecimal(texts.fat)
  const fromMacros =
    protein !== undefined && carbs !== undefined && fat !== undefined ? kcalFromMacros({ protein, carbs, fat }) : undefined
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold">{title}</legend>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(({ key, label }) => (
          <Field key={key} label={label}>
            <DecimalInput value={texts[key]} onChange={(e) => onChange({ ...texts, [key]: e.target.value })} />
          </Field>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">
        {fromMacros !== undefined && `Os macros somam ${formatNumber(fromMacros, 0)} kcal.`}
        {protein !== undefined && weightKg && ` Proteína: ${formatNumber(protein / weightKg)} g/kg.`}
      </p>
      {fromMacros !== undefined && fromMacros > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-ink-2">Proporção das calorias: é com ela que as refeições são comparadas.</p>
          <MacroBalance nutrients={{ kcal: fromMacros, carbs: carbs!, protein: protein!, fat: fat! }} />
        </div>
      )}
    </fieldset>
  )
}

/** The spending estimated from logs and weigh-ins, and the calories for the weight goal's pace. */
function ExpenditureBox({
  expenditure,
  kgPerWeek,
  onApply,
}: {
  expenditure?: Expenditure
  kgPerWeek?: number
  onApply: (kcal: number) => void
}) {
  if (!expenditure) {
    return (
      <p className="rounded-xl bg-surface-2 p-3 text-xs text-ink-2">
        Com umas duas semanas de alimentação registrada e pesagens frequentes, o app estima quanto você gasta de verdade e
        sugere a meta de calorias.
      </p>
    )
  }
  const rate = kgPerWeek ?? 0
  const suggested = kcalForRate(expenditure.kcal, rate)
  return (
    <div className="rounded-xl bg-surface-2 p-3 text-sm">
      <p>
        Gasto estimado: <span className="font-semibold tabular-nums">{formatNumber(expenditure.kcal, 0)} kcal/dia</span>
        {expenditure.confidence === 'low' && <span className="text-muted"> (estimativa inicial)</span>}
      </p>
      <p className="mt-1 text-xs text-ink-2">
        Nas últimas 4 semanas você comeu em média {formatNumber(expenditure.intake, 0)} kcal e o peso variou{' '}
        {formatSigned(expenditure.kgPerWeek, 2)} kg por semana ({expenditure.loggedDays} dias com registro,{' '}
        {expenditure.weighIns} pesagens).
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-2">
          {rate === 0
            ? 'Para manter o peso:'
            : `Para ${formatSigned(rate, 2)} kg/semana (sua meta de peso):`}{' '}
          <span className="font-semibold text-ink tabular-nums">{formatNumber(suggested, 0)} kcal</span>
        </p>
        <Button size="sm" onClick={() => onApply(suggested)}>
          Usar
        </Button>
      </div>
    </div>
  )
}
