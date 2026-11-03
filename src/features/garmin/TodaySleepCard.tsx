import { Link } from 'react-router'
import { Card, Stat } from '../../components/ui'
import { relativeDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatDuration } from '../../lib/format'
import { hrvStatus, latestNight, useDailyHealth } from './recovery'

/** Last night from the watch, on the Hoje page; hidden until the Garmin sync brings a night. */
export function TodaySleepCard({ today }: { today: DayKey }) {
  const days = useDailyHealth(shiftDay(today, -1), today)
  const night = days && latestNight(days)
  if (!night) return null
  const { sleep, hrv, restingHr } = night
  return (
    <Card
      title={`Sono · ${relativeDay(night.id, today)}`}
      action={
        <Link to="/sono" className="text-sm font-medium text-accent-ink">
          Detalhes
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Dormiu"
          value={sleep ? formatDuration(sleep.totalSec * 1000) : '—'}
          note={sleep?.score !== undefined ? `nota ${sleep.score}` : undefined}
        />
        <Stat label="HRV" value={hrv?.lastNight !== undefined ? `${hrv.lastNight} ms` : '—'} note={hrvStatus(hrv?.status)} />
        <Stat label="FC repouso" value={restingHr !== undefined ? `${restingHr} bpm` : '—'} />
      </div>
    </Card>
  )
}
