import type { MacroGoals, Nutrients } from '../../db/types'
import { formatNumber } from '../../lib/format'
import { MACROS, macroShares } from './macros'
import { MacroDot, Ring, SplitBar } from './MacroViews'

/** Calories against the goal on a ring (eaten, left, goal), then a ring per macro. */
export function NutritionSummary({ totals, goals }: { totals: Nutrients; goals?: MacroGoals }) {
  if (!goals) return <WithoutGoals totals={totals} />
  const remaining = goals.kcal - totals.kcal
  const over = remaining < 0
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="text-center">
          <p className="text-2xl font-semibold tabular-nums">{formatNumber(totals.kcal, 0)}</p>
          <p className="text-xs text-ink-2">Comido</p>
        </div>
        <Ring value={totals.kcal} max={goals.kcal} color="var(--tone-food)" size={128} stroke={11} label="Calorias do dia">
          <span className={over ? 'text-3xl font-semibold text-critical tabular-nums' : 'text-3xl font-semibold tabular-nums'}>
            {formatNumber(Math.abs(remaining), 0)}
          </span>
          <span className="text-xs text-ink-2">{over ? 'acima' : 'restante'}</span>
        </Ring>
        <div className="text-center">
          <p className="text-2xl font-semibold tabular-nums">{formatNumber(goals.kcal, 0)}</p>
          <p className="text-xs text-ink-2">Meta</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {MACROS.map(({ key, label, color }) => {
          const percent = goals[key] > 0 ? (totals[key] / goals[key]) * 100 : 0
          return (
            <div key={key} className="flex min-w-0 flex-col items-center gap-1.5">
              <p className="flex max-w-full items-center gap-1.5 truncate text-xs font-medium" style={{ color }}>
                <MacroDot color={color} /> {label}
              </p>
              <Ring value={totals[key]} max={goals[key]} color={color} size={72} stroke={8} label={label}>
                <span className="text-sm font-semibold tabular-nums">{formatNumber(percent, 0)}%</span>
              </Ring>
              <p className="text-sm tabular-nums">
                <span className="font-semibold">{formatNumber(totals[key], 0)}</span>
                <span className="text-muted">/{formatNumber(goals[key], 0)} g</span>
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WithoutGoals({ totals }: { totals: Nutrients }) {
  const shares = macroShares(totals)
  return (
    <div>
      <p>
        <span className="text-3xl font-semibold tabular-nums">{formatNumber(totals.kcal, 0)}</span>{' '}
        <span className="text-ink-2">kcal</span>
      </p>
      {shares && <SplitBar nutrients={totals} className="mt-2" />}
      <div className="mt-3 grid grid-cols-3 gap-3">
        {MACROS.map(({ key, label, color }) => (
          <div key={key} className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-xs" style={{ color }}>
              <MacroDot color={color} /> {label}
            </p>
            <p className="text-sm font-semibold tabular-nums">{formatNumber(totals[key], 0)} g</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Defina as metas de calorias e macros em Metas.</p>
    </div>
  )
}
