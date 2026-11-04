import { CalendarDays, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Modal } from '../../components/Modal'
import { Card, cx, Empty, SkeletonCard, SkeletonLines } from '../../components/ui'
import { dayRange, parseDay, shiftDay, type DayKey } from '../../lib/dates'
import { byDay, shortTitle } from './agenda'
import { AgendaIcon, AgendaItems, DayDetails, dayTitle } from './components'
import { useAgenda } from './plans'

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const weekday = (date: DayKey) => WEEKDAYS[parseDay(date).getDay()]
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const calendarLink = (
  <Link to="/calendario" className="text-sm font-medium text-accent-ink">
    Calendário
  </Link>
)

/** The Hoje card: the coming week side by side, each day with its workouts as icons. */
export function AgendaStripCard({ today }: { today: DayKey }) {
  const to = shiftDay(today, 6)
  const agenda = useAgenda(today, to, today)
  const [open, setOpen] = useState<DayKey>()
  const days = byDay(agenda ?? [])

  return (
    <Card icon={CalendarDays} tone="training" title="Próximos 7 dias" action={calendarLink}>
      {!agenda ? (
        <SkeletonLines lines={2} />
      ) : (
        <div className="-mx-2 grid grid-cols-7 gap-0.5">
          {dayRange(today, to).map((date) => {
            const items = days.get(date) ?? []
            return (
              <button
                key={date}
                type="button"
                onClick={() => setOpen(date)}
                aria-label={`${dayTitle(date, today)}: ${items.length > 0 ? items.map((item) => item.title).join(', ') : 'nada programado'}`}
                className={cx(
                  'flex min-w-0 flex-col items-center gap-1.5 rounded-xl pt-1.5 pb-2 transition hover:bg-surface-2',
                  date === today && 'bg-surface-2',
                )}
              >
                <span className={cx('text-[11px] font-medium uppercase', date === today ? 'text-accent-ink' : 'text-muted')}>
                  {date === today ? 'hoje' : weekday(date)}
                </span>
                <span className="text-base leading-none font-semibold tabular-nums">{Number(date.slice(8))}</span>
                {items.length === 0 ? (
                  <span className="flex size-7 items-center justify-center rounded-lg border border-dashed border-line text-muted">
                    <Plus size={14} />
                  </span>
                ) : (
                  items.slice(0, 2).map((item) => (
                    <span key={item.key} className="flex w-full min-w-0 flex-col items-center gap-0.5">
                      <AgendaIcon kind={item.kind} status={item.status} />
                      <span
                        className={cx(
                          'line-clamp-2 w-full text-center text-[10px] leading-tight break-words hyphens-auto text-ink-2',
                          item.status === 'missed' && 'line-through',
                        )}
                      >
                        {shortTitle(item)}
                      </span>
                    </span>
                  ))
                )}
                {items.length > 2 && <span className="text-[10px] text-muted">+{items.length - 2}</span>}
              </button>
            )
          })}
        </div>
      )}
      {open && (
        <Modal open title={capitalized(dayTitle(open, today))} onClose={() => setOpen(undefined)}>
          <DayDetails date={open} today={today} />
          <Link to={`/calendario?dia=${open}`} className="mt-4 block text-center text-sm font-medium text-accent-ink">
            Abrir no calendário
          </Link>
        </Modal>
      )}
    </Card>
  )
}

/** The Treinos card: the coming week as a list, with the details of each workout. */
export function UpcomingCard({ today }: { today: DayKey }) {
  const agenda = useAgenda(today, shiftDay(today, 6), today)
  if (!agenda) return <SkeletonCard lines={3} />
  const days = [...byDay(agenda)]
  return (
    <Card icon={CalendarDays} tone="training" title="Próximos 7 dias" action={calendarLink}>
      {days.length === 0 ? (
        <Empty>
          Nada programado para a semana.{' '}
          <Link to="/calendario" className="font-medium text-accent-ink underline underline-offset-2">
            Programar no calendário
          </Link>
        </Empty>
      ) : (
        <div className="space-y-3">
          {days.map(([date, items]) => (
            <section key={date}>
              <h3 className="text-xs font-medium text-muted first-letter:uppercase">{dayTitle(date, today)}</h3>
              <AgendaItems items={items} today={today} />
            </section>
          ))}
        </div>
      )}
    </Card>
  )
}
