import { Moon } from 'lucide-react'
import { Link } from 'react-router'
import { Card, SkeletonCard, Stat } from '../../components/ui'
import { formatTime, relativeDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatDuration } from '../../lib/format'
import { Hypnogram } from './Hypnogram'
import { latestNight, sleepQuality, useDailyHealth } from './recovery'

/**
 * Last night from the watch, on the Hoje page: the score, how long and when, and the stages through
 * the night when Health Connect has them. Hidden until the Garmin sync brings a night.
 */
export function TodaySleepCard({ today }: { today: DayKey }) {
  const days = useDailyHealth(shiftDay(today, -1), today)
  const night = days && latestNight(days)
  // While loading, a placeholder of the card's size; with no night, nothing.
  if (!days) return <SkeletonCard lines={4} />
  if (!night?.sleep) return null
  const { sleep, sleepStages } = night
  return (
    <Card
      icon={Moon}
      tone="sleep"
      title={`Sono · ${relativeDay(night.id, today)}`}
      action={
        <Link to="/sono" className="text-sm font-medium text-accent-ink">
          Detalhes
        </Link>
      }
    >
      <div className="grid grid-cols-2 items-end gap-3">
        <div>
          <p className="text-4xl leading-none font-semibold tabular-nums">{sleep.score ?? '—'}</p>
          <p className="mt-1 text-xs text-ink-2">{sleep.score !== undefined ? sleepQuality(sleep.score) : 'sem nota'}</p>
        </div>
        <Stat
          label="Dormiu"
          value={formatDuration(sleep.totalSec * 1000)}
          note={sleep.start !== undefined && sleep.end !== undefined ? `${formatTime(sleep.start)} – ${formatTime(sleep.end)}` : undefined}
        />
      </div>
      {sleepStages && sleepStages.length > 1 && (
        <div className="mt-4">
          <Hypnogram spans={sleepStages} />
        </div>
      )}
    </Card>
  )
}
