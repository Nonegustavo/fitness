import { addMonths, endOfMonth, startOfMonth } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useToast } from '../../components/Toast'
import { Button, Card, cx, IconButton, Page, Skeleton } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { dayKey, dayRange, formatDay, parseDay, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { tapFeedback } from '../../lib/haptics'
import { byDay, eventKind, eventTitle, shortTitle, type AgendaItem } from './agenda'
import { AgendaIcon, AgendaLegend, DayDetails, dayTitle } from './components'
import { setEventHidden, useAgenda, useHiddenEvents } from './plans'

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const isDay = (value: string | null): value is DayKey => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
const monthOf = (date: DayKey): DayKey => dayKey(startOfMonth(parseDay(date)))

/** The month at a glance (what was done and what is planned), and the chosen day in detail. */
export default function CalendarPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const requested = params.get('dia')
  const selected = isDay(requested) ? requested : today
  const [month, setMonth] = useState(() => monthOf(selected))
  const from = weekStart(month)
  const to = shiftDay(weekStart(dayKey(endOfMonth(parseDay(month)))), 6)
  const agenda = useAgenda(from, to, today)
  const days = byDay(agenda ?? [])
  // Sunday to Saturday, a row each.
  const dates = dayRange(from, to)
  const weeks = Array.from({ length: Math.ceil(dates.length / 7) }, (_, i) => dates.slice(i * 7, i * 7 + 7))

  const select = (date: DayKey) => {
    setParams({ dia: date }, { replace: true })
    if (monthOf(date) !== month) setMonth(monthOf(date))
  }
  const shiftMonth = (by: number) => setMonth(dayKey(addMonths(parseDay(month), by)))
  const title = dayTitle(selected, today)

  return (
    <Page title="Calendário" icon={CalendarDays} tone="training" subtitle="Treinos feitos e programados">
      <Card>
        <div className="mb-2 flex items-center gap-1">
          <IconButton label="Mês anterior" onClick={() => shiftMonth(-1)}>
            <ChevronLeft size={20} />
          </IconButton>
          <h2 className="flex-1 text-center font-semibold first-letter:uppercase">{formatDay(month, "MMMM 'de' yyyy")}</h2>
          <IconButton label="Próximo mês" onClick={() => shiftMonth(1)}>
            <ChevronRight size={20} />
          </IconButton>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-muted uppercase sm:gap-1">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday} className="pb-1">
              {weekday}
            </span>
          ))}
        </div>
        {/* A thin line between the weeks, so a row reads as one week. */}
        <div className="divide-y divide-line">
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 gap-0.5 py-1 sm:gap-1">
              {week.map((date) =>
                agenda ? (
                  <DayCell
                    key={date}
                    date={date}
                    items={days.get(date) ?? []}
                    outside={monthOf(date) !== month}
                    isToday={date === today}
                    selected={date === selected}
                    onSelect={() => select(date)}
                  />
                ) : (
                  <Skeleton key={date} className="h-16 rounded-xl" />
                ),
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <AgendaLegend />
          {(selected !== today || month !== monthOf(today)) && (
            <Button size="sm" variant="ghost" onClick={() => select(today)}>
              Hoje
            </Button>
          )}
        </div>
      </Card>

      <Card title={<span className="block first-letter:uppercase">{title}</span>}>
        <DayDetails key={selected} date={selected} today={today} />
      </Card>

      <HiddenCard from={from} today={today} />
    </Page>
  )
}

/** The Garmin workouts hidden from this month on (a race listed twice, say), each with a way back. */
function HiddenCard({ from, today }: { from: DayKey; today: DayKey }) {
  const hidden = useHiddenEvents(from)
  const toast = useToast()
  if (!hidden?.length) return null
  return (
    <Card icon={EyeOff} tone="training" title="Ocultos">
      <p className="text-xs text-muted">Treinos do Garmin tirados da agenda, só no dia de cada um.</p>
      <ul className="divide-y divide-line">
        {hidden.map(({ event, key }) => {
          const name = eventTitle(event.title)
          return (
            <li key={key} className="flex items-center gap-3 py-2.5">
              <AgendaIcon kind={eventKind(event)} status="planned" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="text-xs text-muted first-letter:uppercase">{dayTitle(event.date, today)}</p>
              </div>
              <Button
                size="sm"
                aria-label={`Mostrar ${name} de novo`}
                onClick={() => {
                  tapFeedback()
                  void setEventHidden(key, event.date, false)
                  toast({ message: `${name} voltou para a agenda.` })
                }}
              >
                <Eye size={14} /> Mostrar
              </Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function DayCell({
  date,
  items,
  outside,
  isToday,
  selected,
  onSelect,
}: {
  date: DayKey
  items: AgendaItem[]
  outside: boolean
  isToday: boolean
  selected: boolean
  onSelect: () => void
}) {
  const shown = items.slice(0, 3)
  const more = items.length - shown.length
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${formatDay(date)}${items.length > 0 ? `: ${items.map((item) => item.title).join(', ')}` : ''}`}
      className={cx(
        'flex min-h-16 min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 pt-1.5 pb-1 transition sm:items-stretch sm:px-1.5',
        selected ? 'bg-surface-2 ring-2 ring-accent-ink' : 'hover:bg-surface-2',
        outside && 'opacity-40',
      )}
    >
      <span
        className={cx(
          'flex size-6 shrink-0 items-center justify-center self-center rounded-full text-xs font-semibold tabular-nums sm:self-start',
          isToday && 'bg-accent text-white',
        )}
      >
        {Number(date.slice(8))}
      </span>
      {/* Phones: just the icons. Wider screens: the names too. */}
      <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
        {shown.map((item) => (
          <AgendaIcon key={item.key} kind={item.kind} status={item.status} size="xs" />
        ))}
        {more > 0 && <span className="text-[10px] leading-[18px] text-muted">+{more}</span>}
      </span>
      <span className="hidden min-w-0 space-y-0.5 sm:block">
        {shown.map((item) => (
          <span key={item.key} className="flex min-w-0 items-center gap-1 text-left text-[11px] text-ink-2">
            <AgendaIcon kind={item.kind} status={item.status} size="xs" />
            <span className={cx('truncate', item.status === 'missed' && 'line-through')}>{shortTitle(item)}</span>
          </span>
        ))}
        {more > 0 && <span className="block text-left text-[10px] text-muted">+{more}</span>}
      </span>
    </button>
  )
}
