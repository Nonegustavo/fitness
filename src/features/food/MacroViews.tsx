import { cx } from '../../components/ui'
import type { MacroGoals, Nutrients } from '../../db/types'
import { formatNumber } from '../../lib/format'
import { MACROS, macroShares, roundShares, type MacroKey } from './macros'

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

/** Where the energy of a food or a meal comes from: carbs, protein and fat, as a bar and in percent. */
export function MacroBalance({ nutrients }: { nutrients: Nutrients }) {
  const shares = macroShares(nutrients)
  if (!shares) return <p className="text-sm text-muted">Sem macronutrientes.</p>
  const percent = roundShares(shares)
  return (
    <div>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {MACROS.map(({ key, color }) =>
          shares[key] > 0 ? (
            <div key={key} className="transition-[flex-grow] duration-500" style={{ flexGrow: shares[key], background: color }} />
          ) : null,
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {MACROS.map(({ key, label, color }) => (
          <div key={key} className="min-w-0">
            <dt className="flex items-center justify-center gap-1.5 truncate text-xs" style={{ color }}>
              <MacroDot color={color} /> {label}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">{percent[key]}%</dd>
          </div>
        ))}
      </dl>
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

const OTHER = [
  { key: 'fiber', label: 'Fibras', unit: 'g' },
  { key: 'sugar', label: 'Açúcares', unit: 'g' },
  { key: 'saturatedFat', label: 'Saturadas', unit: 'g' },
  { key: 'sodium', label: 'Sódio', unit: 'mg' },
] as const

/** Fiber, sugars, saturated fat and sodium, when known. */
export function OtherNutrients({ nutrients }: { nutrients: Nutrients }) {
  const known = OTHER.filter(({ key }) => nutrients[key] !== undefined)
  if (known.length === 0) return null
  return (
    <dl className="grid grid-cols-4 gap-2 text-center">
      {known.map(({ key, label, unit }) => (
        <div key={key} className="min-w-0">
          <dd className="text-sm font-semibold tabular-nums">
            {formatNumber(nutrients[key]!, unit === 'mg' ? 0 : 1)}
            <span className="font-normal text-muted"> {unit}</span>
          </dd>
          <dt className="truncate text-xs text-ink-2">{label}</dt>
        </div>
      ))}
    </dl>
  )
}
