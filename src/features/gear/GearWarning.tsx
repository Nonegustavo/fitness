import { SportShoe, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { cx } from '../../components/ui'
import { formatNumber } from '../../lib/format'
import { useActivities } from '../activities/activities'
import { gearStatus, useGear, type GearStatus } from './gear'

export const GEAR_ROUTE = '/corrida/tenis'

/** "640 de 700 km (91%)". */
export const gearUsage = (state: GearStatus): string =>
  `${formatNumber(state.km, 0)} de ${formatNumber(state.limitKm, 0)} km (${Math.round(state.share * 100)}%)`

/** The note for a pair at 90% of its limit or past it. */
export function GearAlert({ state, className }: { state: GearStatus; className?: string }) {
  const over = state.share >= 1
  return (
    <p className={cx('flex items-start gap-2 text-sm', className)}>
      <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-critical" />
      <span>
        <span className="font-medium">{state.gear.name}</span>: {gearUsage(state)}.{' '}
        {over ? 'Passou do limite: hora de trocar.' : 'Está chegando ao limite: hora de pensar em trocar.'}
      </span>
    </p>
  )
}

/** The pairs in use that are near or past their limit, for the Corrida screen. */
export function GearWarnings() {
  const gear = useGear()
  const activities = useActivities()
  const worn = useMemo(
    () => (gear && activities ? gearStatus(gear, activities).filter((state) => !state.gear.retired && state.warn) : []),
    [gear, activities],
  )
  if (worn.length === 0) return null
  return (
    <Link to={GEAR_ROUTE} className="mt-3 block space-y-1 rounded-xl bg-critical/10 px-3 py-2 hover:bg-critical/15">
      {worn.map((state) => (
        <GearAlert key={state.gear.id} state={state} />
      ))}
    </Link>
  )
}

/** The way to the Tênis screen, as a card's action. */
export function GearLink() {
  return (
    <Link to={GEAR_ROUTE} className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink">
      <SportShoe size={14} aria-hidden /> Tênis
    </Link>
  )
}
