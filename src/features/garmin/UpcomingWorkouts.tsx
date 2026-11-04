import { CalendarDays } from 'lucide-react'
import { Card } from '../../components/ui'
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

/** Today's planned workouts on the Hoje page, when there are any. */
export function TodayPlannedCard({ today }: { today: DayKey }) {
  const events = usePlannedEvents()
  const todays = events?.filter((event) => event.date === today) ?? []
  if (todays.length === 0) return null
  return (
    <Card icon={CalendarDays} tone="training" title="Treino planejado para hoje">
      <ul className="divide-y divide-line">
        {todays.map((event) => (
          <EventRow key={event.uid ?? event.title} event={event} today={today} showDay={false} />
        ))}
      </ul>
    </Card>
  )
}
