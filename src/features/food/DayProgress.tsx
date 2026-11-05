import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toneColor } from '../../components/tone'
import { Button } from '../../components/ui'
import type { MacroGoals, Nutrients } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { MACROS } from './macros'
import { mealAt } from './nutrition'

/**
 * A day's food at a glance, the same in "Em foco" and on top of the food screen: calories against the
 * goal, a bar per macro, and adding a food to the meal of this time of day (on that day, if not today).
 * `children` go between the bars and the button.
 */
export function DayProgress({
  totals,
  goals,
  date,
  today,
  children,
}: {
  totals: Nutrients
  goals?: MacroGoals
  date: DayKey
  today: DayKey
  children?: ReactNode
}) {
  const navigate = useNavigate()
  const left = goals && goals.kcal - totals.kcal
  return (
    <>
      <p className="text-3xl leading-none font-semibold tabular-nums">
        {formatNumber(totals.kcal, 0)}
        <span className="ml-1.5 text-sm font-normal text-ink-2">
          kcal
          {goals &&
            left !== undefined &&
            ` de ${formatNumber(goals.kcal, 0)} · ${left >= 0 ? `faltam ${formatNumber(left, 0)}` : `${formatNumber(-left, 0)} acima`}`}
        </span>
      </p>
      {goals && <Bar value={totals.kcal} max={goals.kcal} color={toneColor('food')} />}
      <ul className="mt-3 space-y-1.5">
        {MACROS.map(({ key, label, color }) => (
          <li key={key}>
            <p className="flex justify-between text-xs">
              <span className="text-ink-2">{label}</span>
              <span className="tabular-nums">
                {formatNumber(totals[key], 0)}
                {goals && `/${formatNumber(goals[key], 0)}`} g
              </span>
            </p>
            {goals && <Bar value={totals[key]} max={goals[key]} color={color} thin />}
          </li>
        ))}
      </ul>
      {children}
      <Button
        size="sm"
        variant="primary"
        className="mt-3 w-full"
        onClick={() => navigate(`/alimentacao/adicionar?refeicao=${mealAt(new Date())}${date === today ? '' : `&data=${date}`}`)}
      >
        <Plus size={16} /> Adicionar alimento
      </Button>
    </>
  )
}

function Bar({ value, max, color, thin = false }: { value: number; max: number; color: string; thin?: boolean }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <span
      aria-hidden
      className={thin ? 'mt-0.5 block h-1 overflow-hidden rounded-full' : 'mt-2 block h-2 overflow-hidden rounded-full'}
      style={{ background: `color-mix(in oklab, ${color} 22%, var(--surface-2))` }}
    >
      <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: color }} />
    </span>
  )
}
