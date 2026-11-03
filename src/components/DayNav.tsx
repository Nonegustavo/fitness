import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDay, shiftDay, type DayKey } from '../lib/dates'
import { IconButton } from './ui'

/** ‹ Hoje › — moves between days, never past today; tapping the label goes back to today. */
export function DayNav({ date, today, onChange }: { date: DayKey; today: DayKey; onChange: (date: DayKey) => void }) {
  const label =
    date === today ? 'Hoje' : date === shiftDay(today, -1) ? 'Ontem' : formatDay(date, "EEE, d 'de' MMM")
  return (
    <div className="mb-2 flex items-center justify-between">
      <IconButton label="Dia anterior" onClick={() => onChange(shiftDay(date, -1))}>
        <ChevronLeft size={20} />
      </IconButton>
      <button type="button" className="text-sm font-semibold first-letter:uppercase" onClick={() => onChange(today)}>
        {label}
      </button>
      <IconButton label="Próximo dia" disabled={date >= today} onClick={() => onChange(shiftDay(date, 1))}>
        <ChevronRight size={20} />
      </IconButton>
    </div>
  )
}
