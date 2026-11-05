import type { ReactNode } from 'react'
import { cx } from '../../components/ui'
import type { MacroGoals, Nutrients } from '../../db/types'
import { formatNumber } from '../../lib/format'
import { balanceOf, goalShares, MACROS, macroShares, mostAbove, roundShares, type MacroKey } from './macros'

/**
 * Progress on a ring, starting at the top. Past the goal the ring is full and a darker lap of the
 * same color shows how much over it went.
 */
export function Ring({
  value,
  max,
  color,
  size = 96,
  stroke = 10,
  label,
  children,
}: {
  value: number
  max: number
  color: string
  size?: number
  stroke?: number
  label: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const ratio = max > 0 ? Math.max(value, 0) / max : 0
  const first = Math.min(ratio, 1)
  const over = Math.min(Math.max(ratio - 1, 0), 1)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: `color-mix(in oklab, ${color} 18%, var(--surface-2))` }} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - first)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
          style={{ stroke: color }}
        />
        {over > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - over)}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
            style={{ stroke: `color-mix(in oklab, ${color} 60%, black)` }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

/** A colored square before a macro's name, as in the legends. */
export const MacroDot = ({ color }: { color: string }) => (
  <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
)

/** "C 21 · P 5 · G 2" (grams, to `digits` decimals), each letter in its macro's color, for lists. */
export function MacroLine({
  nutrients,
  digits = 0,
  className,
}: {
  nutrients: Pick<Nutrients, MacroKey>
  digits?: number
  className?: string
}) {
  return (
    <span className={cx('inline-flex flex-wrap gap-x-2 tabular-nums', className)}>
      {MACROS.map(({ key, short, label, color }) => (
        <span key={key} title={label}>
          <span className="font-semibold" style={{ color }}>
            {short}
          </span>{' '}
          {formatNumber(nutrients[key], digits)}
        </span>
      ))}
    </span>
  )
}

/** A thin bar split by how the energy of the macros divides, for meal cards. */
export function SplitBar({ nutrients, className }: { nutrients: Nutrients; className?: string }) {
  const shares = macroShares(nutrients)
  if (!shares) return null
  return (
    <div aria-hidden className={cx('flex h-1.5 gap-0.5 overflow-hidden rounded-full', className)}>
      {MACROS.map(({ key, color }) =>
        shares[key] > 0 ? <div key={key} style={{ flexGrow: shares[key], background: color }} /> : null,
      )}
    </div>
  )
}

const BALANCE_TEXT = {
  balanced: 'Equilibrada com a sua meta',
  close: 'Perto da proporção da meta',
  off: 'Fora da proporção da meta',
} as const

/**
 * Where the energy of a food or a meal comes from (carbs, protein, fat), next to the split of the
 * day's goal: when the bars look alike, the meal follows the diet.
 */
export function MacroBalance({ nutrients, goals }: { nutrients: Nutrients; goals?: MacroGoals }) {
  const shares = macroShares(nutrients)
  if (!shares) return <p className="text-sm text-muted">Sem macronutrientes.</p>
  const goal = goals && goalShares(goals)
  const percent = roundShares(shares)
  const goalPercent = goal && roundShares(goal)
  const balance = goal && balanceOf(shares, goal)
  const above = goal && mostAbove(shares, goal)
  return (
    <div>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {MACROS.map(({ key, color }) =>
          shares[key] > 0 ? (
            <div key={key} className="transition-[flex-grow] duration-500" style={{ flexGrow: shares[key], background: color }} />
          ) : null,
        )}
      </div>
      {goal && (
        <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full opacity-45" aria-hidden title="Proporção da meta">
          {MACROS.map(({ key, color }) => (
            <div key={key} style={{ flexGrow: goal[key], background: color }} />
          ))}
        </div>
      )}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {MACROS.map(({ key, label, color }) => (
          <div key={key} className="min-w-0">
            <dt className="flex items-center justify-center gap-1.5 truncate text-xs" style={{ color }}>
              <MacroDot color={color} /> {label}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">{percent[key]}%</dd>
            {goalPercent && <dd className="text-xs text-muted tabular-nums">meta {goalPercent[key]}%</dd>}
          </div>
        ))}
      </dl>
      {balance && (
        <p
          className={cx(
            'mt-2 text-center text-xs',
            balance === 'balanced' ? 'text-good' : balance === 'close' ? 'text-ink-2' : 'text-critical',
          )}
        >
          {BALANCE_TEXT[balance]}
          {balance !== 'balanced' && above && ` · mais ${MACROS.find((m) => m.key === above)!.label.toLowerCase()} que o planejado`}
        </p>
      )}
    </div>
  )
}

/** Grams of each macro, with how much of the day's goal they are. */
export function MacroGrams({ nutrients, goals }: { nutrients: Nutrients; goals?: MacroGoals }) {
  return (
    <dl className="grid grid-cols-4 gap-2 rounded-xl bg-surface-2 p-3 text-center">
      <div className="min-w-0">
        <dd className="font-semibold tabular-nums">{formatNumber(nutrients.kcal, 0)}</dd>
        <dt className="text-xs text-ink-2">kcal</dt>
        {goals && goals.kcal > 0 && (
          <dd className="text-xs text-muted tabular-nums">{formatNumber((nutrients.kcal / goals.kcal) * 100, 0)}% do dia</dd>
        )}
      </div>
      {MACROS.map(({ key, label, color }) => (
        <div key={key} className="min-w-0">
          <dd className="font-semibold tabular-nums">{formatNumber(nutrients[key])} g</dd>
          <dt className="truncate text-xs" style={{ color }}>
            {label}
          </dt>
          {goals && goals[key] > 0 && (
            <dd className="text-xs text-muted tabular-nums">{formatNumber((nutrients[key] / goals[key]) * 100, 0)}% do dia</dd>
          )}
        </div>
      ))}
    </dl>
  )
}

/**
 * Reference amounts for a day: at least 25 g of fiber, and at most 50 g of sugars, 2000 mg of sodium
 * (WHO) and 10% of the calories as saturated fat.
 */
export const DAILY_REFERENCE = { fiber: 25, sugar: 50, sodium: 2000, saturatedFatShare: 0.1 }

const OTHER = [
  { key: 'fiber', label: 'Fibras', unit: 'g', kind: 'min' },
  { key: 'sugar', label: 'Açúcares', unit: 'g', kind: 'max' },
  { key: 'saturatedFat', label: 'Saturadas', unit: 'g', kind: 'max' },
  { key: 'sodium', label: 'Sódio', unit: 'mg', kind: 'max' },
] as const

/**
 * Fiber, sugars, saturated fat and sodium, when known. With `day`, each comes with its daily
 * reference: fiber is good to reach, the others are limits.
 */
export function OtherNutrients({ nutrients, day, kcalGoal }: { nutrients: Nutrients; day?: boolean; kcalGoal?: number }) {
  const known = OTHER.filter(({ key }) => nutrients[key] !== undefined && (key !== 'fiber' || nutrients[key]! > 0 || !day))
  if (known.length === 0) return null
  const reference = (key: (typeof OTHER)[number]['key']) =>
    key === 'saturatedFat'
      ? kcalGoal && (kcalGoal * DAILY_REFERENCE.saturatedFatShare) / 9
      : DAILY_REFERENCE[key]
  return (
    <dl className="grid grid-cols-4 gap-2 text-center">
      {known.map(({ key, label, unit, kind }) => {
        const value = nutrients[key]!
        const ref = day ? reference(key) : undefined
        const over = ref !== undefined && kind === 'max' && value > ref
        return (
          <div key={key} className="min-w-0">
            <dd className={cx('text-sm font-semibold tabular-nums', over && 'text-critical')}>
              {formatNumber(value, unit === 'mg' ? 0 : 1)}
              <span className="font-normal text-muted"> {unit}</span>
            </dd>
            <dt className="truncate text-xs text-ink-2">{label}</dt>
            {ref !== undefined && (
              <dd className="text-xs text-muted tabular-nums">
                {kind === 'min' ? 'meta' : 'limite'} {formatNumber(ref, 0)}
              </dd>
            )}
          </div>
        )
      })}
    </dl>
  )
}
