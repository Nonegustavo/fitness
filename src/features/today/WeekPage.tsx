import { CalendarDays, CalendarRange } from 'lucide-react'
import { Link } from 'react-router'
import { Page } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { shiftDay, weekStart } from '../../lib/dates'
import { WeeklyCard } from './WeeklyCard'

/** The week that ended, next to the one before: where the Sunday summary notification leads. */
export default function WeekPage() {
  const today = useToday()
  const lastSunday = shiftDay(weekStart(today), -7)
  return (
    <Page title="Resumo da semana" icon={CalendarRange} tone="insights" subtitle="A última semana completa, de domingo a sábado">
      <WeeklyCard today={today} />
      <Link
        to={`/calendario?dia=${lastSunday}`}
        className="mx-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-accent-ink"
      >
        <CalendarDays size={16} /> Ver os dias no calendário
      </Link>
    </Page>
  )
}
