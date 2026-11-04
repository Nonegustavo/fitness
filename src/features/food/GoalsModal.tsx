import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, DecimalInput, Field } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { MacroGoals } from '../../db/types'
import { formatNumber, parseDecimal } from '../../lib/format'
import { useWeights } from '../body/body'
import { MacroBalance } from './MacroViews'
import { kcalFromMacros } from './nutrition'

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

function parseGoals(texts: GoalTexts): MacroGoals | undefined {
  const values = FIELDS.map(({ key }) => parseDecimal(texts[key]))
  if (values.some((value) => value === undefined || value < 0) || !values[0]) return undefined
  const [kcal, carbs, protein, fat] = values as number[]
  return { kcal, protein, carbs, fat }
}

export function GoalsModal({ onClose }: { onClose: () => void }) {
  const settings = useSettings()
  const weightKg = useWeights()?.at(-1)?.weightKg
  const [normal, setNormal] = useState(() => toTexts(settings.nutrition?.normal))
  const [hasTraining, setHasTraining] = useState(!!settings.nutrition?.training)
  const [training, setTraining] = useState(() => toTexts(settings.nutrition?.training ?? settings.nutrition?.normal))
  const normalGoals = parseGoals(normal)
  const trainingGoals = parseGoals(training)
  const valid = !!normalGoals && (!hasTraining || !!trainingGoals)

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
