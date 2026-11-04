import { Flag, Pencil } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, Card, DecimalInput, Field, IconButton, Meter, Segmented } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { WeightGoal } from '../../db/types'
import { formatDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatFixed, formatNumber, formatSigned, parseDecimal } from '../../lib/format'
import type { DayValue } from '../../lib/stats'
import { daysToTarget, slopePerDay } from '../food/energy'

/** Weekly pace of the trend over the last 4 weeks. */
export function recentPace(trend: DayValue[], today: DayKey): number | undefined {
  const from = shiftDay(today, -28)
  const recent = trend.filter((p) => p.date >= from)
  if (recent.length < 4) return undefined
  const slope = slopePerDay(recent)
  return slope === undefined ? undefined : slope * 7
}

const whenLabel = (today: DayKey, days: number | undefined): string => {
  if (days === undefined) return 'sem previsão nesse ritmo'
  if (days === 0) return 'chegou'
  const weeks = Math.round(days / 7)
  return `${weeks <= 1 ? `${days} dias` : `~${weeks} semanas`} (${formatDay(shiftDay(today, days), "MMM 'de' yyyy")})`
}

/** The weight goal: how far, how fast it's going, and when it gets there at that pace and at the planned one. */
export function WeightGoalCard({ trend, today }: { trend: DayValue[]; today: DayKey }) {
  const settings = useSettings()
  const goal = settings.weightGoal
  const [editing, setEditing] = useState(false)
  const current = trend.at(-1)?.value
  const pace = recentPace(trend, today)

  return (
    <Card
      title="Meta de peso"
      icon={Flag}
      tone="body"
      action={
        goal && (
          <IconButton label="Editar meta" onClick={() => setEditing(true)}>
            <Pencil size={16} />
          </IconButton>
        )
      }
    >
      {!goal || current === undefined ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-2">Defina um peso alvo e o ritmo para ver quando chega lá.</p>
          <Button size="sm" variant="primary" onClick={() => setEditing(true)}>
            Definir
          </Button>
        </div>
      ) : (
        <GoalProgress goal={goal} current={current} pace={pace} today={today} />
      )}
      {editing && <WeightGoalModal goal={goal} current={current} onClose={() => setEditing(false)} />}
    </Card>
  )
}

function GoalProgress({
  goal,
  current,
  pace,
  today,
}: {
  goal: WeightGoal
  current: number
  pace?: number
  today: DayKey
}) {
  const gap = goal.targetKg - current
  const total = goal.startKg !== undefined ? goal.targetKg - goal.startKg : undefined
  const done = total && Math.sign(total) === Math.sign(gap || total) ? Math.max(0, 1 - gap / total) : undefined
  const onTrack = pace !== undefined && Math.abs(gap) >= 0.05 && Math.sign(pace) === Math.sign(gap)
  return (
    <div className="space-y-3">
      <p>
        <span className="text-2xl font-semibold tabular-nums">{formatFixed(current)} kg</span>
        <span className="text-ink-2"> → {formatFixed(goal.targetKg)} kg</span>
        <span className="block text-sm text-ink-2">
          {Math.abs(gap) < 0.05 ? 'Meta alcançada' : `Faltam ${formatFixed(Math.abs(gap))} kg`} (pela tendência)
        </span>
      </p>
      {done !== undefined && <Meter value={done} max={1} label="Caminho até a meta" tone="body" />}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-ink-2">Ritmo atual (4 semanas)</dt>
          <dd className={onTrack || pace === undefined ? 'font-medium' : 'font-medium text-critical'}>
            {pace === undefined ? '—' : `${formatSigned(pace)} kg/sem`}
          </dd>
          <dd className="text-xs text-muted">{pace === undefined ? 'poucas pesagens' : whenLabel(today, daysToTarget(current, goal.targetKg, pace))}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-2">Ritmo planejado</dt>
          <dd className="font-medium">{formatSigned(goal.kgPerWeek)} kg/sem</dd>
          <dd className="text-xs text-muted">{whenLabel(today, daysToTarget(current, goal.targetKg, goal.kgPerWeek))}</dd>
        </div>
      </dl>
    </div>
  )
}

const PACES = [0.25, 0.5, 0.75]

function WeightGoalModal({ goal, current, onClose }: { goal?: WeightGoal; current?: number; onClose: () => void }) {
  const [targetText, setTargetText] = useState(goal ? formatNumber(goal.targetKg) : '')
  const [paceText, setPaceText] = useState(formatNumber(Math.abs(goal?.kgPerWeek ?? 0.5)))
  const target = parseDecimal(targetText)
  const pace = parseDecimal(paceText)
  const direction: 'lose' | 'gain' | 'keep' =
    target === undefined || current === undefined || Math.abs(target - current) < 0.3 ? 'keep' : target < current ? 'lose' : 'gain'
  const valid = target !== undefined && target > 20 && target < 300 && (direction === 'keep' || (pace !== undefined && pace > 0 && pace <= 1.5))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    const kgPerWeek = direction === 'keep' ? 0 : direction === 'lose' ? -pace! : pace!
    // Progress counts from where the weight was when this target was set.
    const startKg = goal && goal.targetKg === target ? goal.startKg : current
    await patch(db.settings, SETTINGS_ID, { weightGoal: { targetKg: target, kgPerWeek, startKg } })
    onClose()
  }

  async function clear() {
    await patch(db.settings, SETTINGS_ID, { weightGoal: undefined })
    onClose()
  }

  return (
    <Modal open title="Meta de peso" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Peso alvo (kg)" hint={current !== undefined ? `Hoje, pela tendência: ${formatFixed(current)} kg` : undefined}>
          <DecimalInput autoFocus value={targetText} onChange={(e) => setTargetText(e.target.value)} />
        </Field>
        {direction !== 'keep' && (
          <Field label={direction === 'lose' ? 'Perder por semana (kg)' : 'Ganhar por semana (kg)'} group>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Ritmo"
                value={PACES.includes(pace ?? -1) ? String(pace) : ''}
                onChange={(value) => setPaceText(formatNumber(Number(value)))}
                options={PACES.map((value) => ({ value: String(value), label: formatNumber(value) }))}
              />
              <DecimalInput className="w-24" aria-label="Outro ritmo" value={paceText} onChange={(e) => setPaceText(e.target.value)} />
            </div>
          </Field>
        )}
        <p className="text-xs text-muted">
          {direction === 'lose'
            ? 'Até 0,5–1% do peso por semana preserva melhor a massa magra.'
            : direction === 'gain'
              ? 'Para ganhar músculo com pouca gordura, 0,25 kg por semana costuma bastar.'
              : 'Perto do peso atual: a meta é manter.'}{' '}
          A meta de calorias pode seguir esse ritmo, em Alimentação › Metas.
        </p>
        <div className="flex gap-2">
          {goal && (
            <Button variant="ghost" onClick={() => void clear()}>
              Remover
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
