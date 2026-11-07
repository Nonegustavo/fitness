import { SportShoe } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { Card, Select } from '../../components/ui'
import type { Activity } from '../../db/types'
import { formatNumber } from '../../lib/format'
import { useActivities } from '../activities/activities'
import { gearStatus, gearUse, setActivityGear, useGear } from './gear'
import { GEAR_ROUTE, GearAlert } from './GearWarning'

/** The shoes of a run or walk, to change; a pair near its limit gets the warning. */
export function GearPicker({ activity }: { activity: Activity }) {
  const gear = useGear()
  const activities = useActivities()
  const states = useMemo(() => (gear && activities ? gearStatus(gear, activities) : undefined), [gear, activities])
  if (!gearUse(activity) || !states) return null

  const current = states.find((state) => state.gear.id === activity.gearId)
  // Retired pairs stay out of the list, unless this activity was done in one.
  const options = states.filter((state) => !state.gear.retired || state.gear.id === activity.gearId)
  return (
    <Card>
      <div className="flex items-center gap-3">
        <SportShoe size={20} aria-hidden className="shrink-0 text-ink-2" />
        {options.length === 0 ? (
          <p className="min-w-0 flex-1 text-sm text-ink-2">Nenhum tênis cadastrado ainda.</p>
        ) : (
          <label className="min-w-0 flex-1">
            <span className="block text-xs text-ink-2">Tênis</span>
            <Select
              className="mt-1"
              value={current ? current.gear.id : ''}
              onChange={(event) => void setActivityGear(activity.id, event.target.value || undefined)}
            >
              <option value="">Nenhum</option>
              {options.map((state) => (
                <option key={state.gear.id} value={state.gear.id}>
                  {state.gear.name} · {formatNumber(state.km, 0)} km
                </option>
              ))}
            </Select>
          </label>
        )}
        <Link to={GEAR_ROUTE} className="shrink-0 text-sm font-medium text-accent-ink">
          {options.length === 0 ? 'Adicionar' : 'Ver tênis'}
        </Link>
      </div>
      {current?.warn && <GearAlert state={current} className="mt-3" />}
    </Card>
  )
}
