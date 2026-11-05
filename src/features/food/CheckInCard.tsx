import { CalendarCheck, Check } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, Card, TableView } from '../../components/ui'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { MacroGoals } from '../../db/types'
import { formatDay, shiftDay } from '../../lib/dates'
import { formatNumber, formatSigned } from '../../lib/format'
import { missingLines, numberRows, reasonLines, type CheckIn } from './checkIn'
import { MACROS } from './macros'
import { MacroDot } from './MacroViews'
import { acceptCheckIn, dismissCheckIn, useCheckIn, type CheckInState } from './useCheckIn'

/**
 * The weekly check-in on the food screen, from Sunday until it's answered: the targets now and the
 * ones proposed from the spending and the weight goal, why, and the numbers behind it. Without a
 * weight goal or targets it stays out (the goals sheet explains).
 */
export function CheckInCard() {
  const state = useCheckIn('week')
  if (!state || state.decision || !state.settings.weightGoal || !state.settings.nutrition) return null
  return (
    <Card title="Check-in da semana" icon={CalendarCheck} tone="food">
      <CheckInView state={state} />
    </Card>
  )
}

/** "Revisar metas agora": the same check-in made today, from the goals sheet. */
export function CheckInModal({ onClose, onAccepted }: { onClose: () => void; onAccepted?: () => void }) {
  const state = useCheckIn('today')
  return (
    <Modal open title="Revisar metas" onClose={onClose}>
      {state ? (
        <CheckInView
          state={state}
          onAnswered={(accepted) => {
            if (accepted) onAccepted?.()
            onClose()
          }}
        />
      ) : (
        <p className="py-6 text-sm text-ink-2">Calculando…</p>
      )}
    </Modal>
  )
}

const weekLabel = (checkIn: CheckIn) =>
  `Semana de ${formatDay(checkIn.week, 'd/M')} a ${formatDay(shiftDay(checkIn.week, 6), 'd/M')}`

function CheckInView({ state, onAnswered }: { state: CheckInState; onAnswered?: (accepted: boolean) => void }) {
  const toast = useToast()
  const { checkIn, settings } = state

  async function accept() {
    const previous = { nutrition: settings.nutrition, goalCheckIn: settings.goalCheckIn }
    await acceptCheckIn(state)
    toast({
      message: 'Metas da semana atualizadas',
      action: { label: 'Desfazer', onClick: () => void patch(db.settings, SETTINGS_ID, previous) },
    })
    onAnswered?.(true)
  }
  async function dismiss() {
    await dismissCheckIn(state)
    toast({ message: 'As metas ficam como estão. O próximo check-in é no domingo.' })
    onAnswered?.(false)
  }

  if (checkIn.kind === 'missing') {
    return (
      <>
        <p className="text-xs text-muted">{weekLabel(checkIn)}</p>
        <p className="mt-1 text-sm text-ink-2">Para propor as metas da semana, o app ainda precisa de dados:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
          {missingLines(checkIn.missing).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {state.settings.weightGoal && state.settings.nutrition && (
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => void dismiss()}>
              Agora não
            </Button>
          </div>
        )}
      </>
    )
  }

  const p = checkIn.proposal
  return (
    <>
      <p className="text-xs text-muted">{weekLabel(checkIn)}</p>
      {p.changed ? (
        <>
          <Comparison current={p.current.normal} proposed={p.proposed.normal} />
          {p.current.training && p.proposed.training && (
            <p className="mt-1 text-xs text-ink-2 tabular-nums">
              Dias de treino: {formatNumber(p.current.training.kcal, 0)} → {formatNumber(p.proposed.training.kcal, 0)} kcal
              {p.proposed.training.protein !== p.current.training.protein && `, proteína ${formatNumber(p.proposed.training.protein, 0)} g`}
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm font-medium">Suas metas seguem certas para esta semana.</p>
      )}
      <div className="mt-2 space-y-1 text-sm text-ink-2">
        {reasonLines(p).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {p.changed ? (
          <>
            <Button size="sm" variant="primary" onClick={() => void accept()}>
              <Check size={16} /> Aceitar
            </Button>
            {state.decision?.status !== 'accepted' && (
              <Button size="sm" onClick={() => void dismiss()}>
                Agora não
              </Button>
            )}
          </>
        ) : (
          <Button size="sm" onClick={() => void accept()}>
            <Check size={16} /> Ok
          </Button>
        )}
      </div>
      <TableView summary="Ver os números">
        <dl className="divide-y divide-line">
          {numberRows(checkIn).map((row) => (
            <div key={row.label} className="flex justify-between gap-3 py-1.5 text-xs">
              <dt className="shrink-0 text-ink-2">{row.label}</dt>
              <dd className="text-right tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      </TableView>
    </>
  )
}

const ROWS: { key: keyof MacroGoals; label: string; unit: string; color?: string }[] = [
  { key: 'kcal', label: 'Calorias', unit: 'kcal' },
  ...MACROS.map(({ key, label, color }) => ({ key, label, unit: 'g', color })),
]

/** The targets now and the proposed ones, side by side, with what changes. */
function Comparison({ current, proposed }: { current: MacroGoals; proposed: MacroGoals }) {
  return (
    <table className="mt-2 w-full text-sm tabular-nums">
      <thead>
        <tr className="text-xs text-muted">
          <th className="text-left font-normal">
            <span className="sr-only">Meta</span>
          </th>
          <th className="text-right font-normal">Atual</th>
          <th className="text-right font-normal">Proposta</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map(({ key, label, unit, color }) => {
          const diff = Math.round(proposed[key]) - Math.round(current[key])
          return (
            <tr key={key}>
              <td className="py-0.5 text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  {color && <MacroDot color={color} />}
                  {label}
                </span>
              </td>
              <td className="text-right text-ink-2">
                {formatNumber(current[key], 0)} {unit}
              </td>
              <td className="text-right font-semibold">
                {formatNumber(proposed[key], 0)} {unit}
                {diff !== 0 && <span className="ml-1 text-xs font-normal text-muted">({formatSigned(diff, 0)})</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
