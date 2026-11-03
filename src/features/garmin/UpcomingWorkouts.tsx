import { CalendarDays } from 'lucide-react'
import { Card, Empty } from '../../components/ui'
import { formatDay, formatTime, shiftDay, type DayKey } from '../../lib/dates'
import type { PlannedEvent } from './calendar'
import { usePlannedEvents } from './sync'

const dayLabel = (date: DayKey, today: DayKey) =>
  date === today ? 'hoje' : date === shiftDay(today, 1) ? 'amanhã' : formatDay(date, "EEEE, d 'de' MMM")

function EventRow({ event, today, showDay = true }: { event: PlannedEvent; today: DayKey; showDay?: boolean }) {
  return (
    <li className="py-2">
      {(showDay || event.time !== undefined) && (
        <p className="text-xs text-muted first-letter:uppercase">
          {showDay ? dayLabel(event.date, today) : 'às'}
          {event.time !== undefined && `${showDay ? ',' : ''} ${formatTime(event.time)}`}
        </p>
      )}
      <p className="text-sm font-medium">{event.title}</p>
      {event.description && <p className="line-clamp-3 text-xs whitespace-pre-line text-ink-2">{event.description}</p>}
    </li>
  )
}

/**
 * The planned workouts of the coming week, from the published Garmin Connect calendar (where
 * SisRUN and other coaching apps send theirs). Hidden while no calendar link is set up.
 */
export function UpcomingWorkoutsCard({ today }: { today: DayKey }) {
  const events = usePlannedEvents()
  if (!events) return null
  const weekEnd = shiftDay(today, 6)
  const upcoming = events.filter((event) => event.date >= today && event.date <= weekEnd)
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <CalendarDays size={16} /> Próximos treinos
        </span>
      }
    >
      {upcoming.length === 0 ? (
        <Empty>Nenhum treino agendado para os próximos 7 dias.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {upcoming.map((event) => (
            <EventRow key={event.uid ?? `${event.date}-${event.title}`} event={event} today={today} />
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Today's planned workouts on the Hoje page, when there are any. */
export function TodayPlannedCard({ today }: { today: DayKey }) {
  const events = usePlannedEvents()
  const todays = events?.filter((event) => event.date === today) ?? []
  if (todays.length === 0) return null
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <CalendarDays size={16} /> Treino planejado para hoje
        </span>
      }
    >
      <ul className="divide-y divide-line">
        {todays.map((event) => (
          <EventRow key={event.uid ?? event.title} event={event} today={today} showDay={false} />
        ))}
      </ul>
    </Card>
  )
}
