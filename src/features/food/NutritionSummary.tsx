import { Meter } from '../../components/ui'
import type { MacroGoals, Nutrients } from '../../db/types'
import { formatNumber } from '../../lib/format'

const MACROS = [
  { key: 'protein', label: 'Proteína' },
  { key: 'carbs', label: 'Carboidratos' },
  { key: 'fat', label: 'Gorduras' },
] as const

/** Calories against the goal, plus the three macros. */
export function NutritionSummary({ totals, goals }: { totals: Nutrients; goals?: MacroGoals }) {
  const remaining = goals ? goals.kcal - totals.kcal : undefined
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <p>
          <span className="text-3xl font-semibold">{formatNumber(totals.kcal, 0)}</span>{' '}
          <span className="text-ink-2">{goals ? `de ${formatNumber(goals.kcal, 0)} kcal` : 'kcal'}</span>
        </p>
        {remaining !== undefined && (
          <p className="text-sm text-ink-2">
            {remaining >= 0 ? `Faltam ${formatNumber(remaining, 0)} kcal` : `${formatNumber(-remaining, 0)} kcal acima`}
          </p>
        )}
      </div>
      {goals && <Meter value={totals.kcal} max={goals.kcal} label="Calorias do dia" />}
      <div className="mt-3 grid grid-cols-3 gap-3">
        {MACROS.map(({ key, label }) => (
          <div key={key} className="min-w-0">
            <p className="truncate text-xs text-ink-2">{label}</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatNumber(totals[key], 0)}
              {goals && <span className="font-normal text-muted"> / {formatNumber(goals[key], 0)}</span>} g
            </p>
            {goals && (
              <div className="mt-1">
                <Meter value={totals[key]} max={goals[key]} label={label} />
              </div>
            )}
          </div>
        ))}
      </div>
      {!goals && <p className="mt-3 text-xs text-muted">Defina as metas de calorias e macros em Metas.</p>}
    </div>
  )
}
