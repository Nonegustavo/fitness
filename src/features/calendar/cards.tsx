import { CalendarDays } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { Modal } from '../../components/Modal'
import { toneColor } from '../../components/tone'
import { Card, cx, Empty, SkeletonCard, SkeletonLines } from '../../components/ui'
import { dayRange, parseDay, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
import { byDay, weekSummary, type AgendaItem, type WeekSummary } from './agenda'
import { AgendaItems, DayDetails, dayTitle, KIND_LABELS, KIND_TONES } from './components'
import { useAgenda } from './plans'

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const weekday = (date: DayKey) => WEEKDAYS[parseDay(date).getDay()]
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const STATUS_LABELS = { done: 'feito', active: 'em andamento', planned: 'programado', missed: 'não feito' } as const

const calendarLink = (
  <Link to="/calendario" className="text-sm font-medium text-accent-ink">
    Calendário
  </Link>
)

/**
 * The Hoje card: the current week from Sunday to Saturday, a dot for each workout (solid when
 * done, a ring while planned, gray when missed) and a dash on free days, then how the week is going.
 */
export function WeekCard({ today }: { today: DayKey }) {
  const from = weekStart(today)
  const to = shiftDay(from, 6)
  const agenda = useAgenda(from, to, today)
  const [open, setOpen] = useState<DayKey>()
  const days = byDay(agenda ?? [])

  return (
    <Card icon={CalendarDays} tone="training" title="Minha semana" action={calendarLink}>
      {!agenda ? (
        <SkeletonLines lines={3} />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5">
            {dayRange(from, to).map((date) => (
              <DayPill key={date} date={date} today={today} items={days.get(date) ?? []} onOpen={() => setOpen(date)} />
            ))}
          </div>
          <WeekNumbers summary={weekSummary(agenda)} />
        </>
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

function DayPill({
  date,
  today,
  items,
  onOpen,
}: {
  date: DayKey
  today: DayKey
  items: AgendaItem[]
  onOpen: () => void
}) {
  const isToday = date === today
  const free = items.length === 0
  const described = free
    ? 'dia livre'
    : items.map((item) => `${KIND_LABELS[item.kind]} ${STATUS_LABELS[item.status]}: ${item.title}`).join('; ')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={isToday ? 'date' : undefined}
      aria-label={`${dayTitle(date, today)}: ${described}`}
      className={cx(
        'flex min-w-0 flex-col items-center gap-1.5 rounded-2xl pt-2 pb-2.5 transition active:scale-95',
        isToday ? 'bg-accent text-white shadow-sm' : 'bg-surface-2 hover:brightness-95',
      )}
    >
      <span className={cx('text-xs', isToday ? 'text-white/80' : 'text-muted')}>{weekday(date)}</span>
      <span className={cx('text-lg leading-none font-semibold tabular-nums', !isToday && free && 'text-muted')}>
        {Number(date.slice(8))}
      </span>
      <span aria-hidden className="flex h-2 items-center justify-center gap-[3px]">
        {free ? (
          <span className={cx('h-[3px] w-3.5 rounded-full', isToday ? 'bg-white/60' : 'bg-baseline')} />
        ) : (
          items.slice(0, 3).map((item) => <Dot key={item.key} item={item} onAccent={isToday} />)
        )}
      </span>
    </button>
  )
}

/** A workout as a dot in its kind's color (white on today's pill). */
function Dot({ item, onAccent }: { item: AgendaItem; onAccent: boolean }) {
  const color = onAccent ? '#ffffff' : toneColor(KIND_TONES[item.kind])
  const style: CSSProperties =
    item.status === 'missed'
      ? { background: onAccent ? 'rgb(255 255 255 / 0.45)' : 'var(--muted)' }
      : item.status === 'planned'
        ? { boxShadow: `inset 0 0 0 1.5px ${color}` }
        : { background: color }
  return <span className="size-2 rounded-full" style={style} />
}

/** Done of all the week's workouts, the running distance (done/planned, when the names say) and the time. */
function WeekNumbers({ summary }: { summary: WeekSummary }) {
  const numbers = [
    {
      value: summary.total > 0 ? `${summary.done}/${summary.total}` : '0',
      label: summary.total > 0 ? 'treinos feitos' : 'treinos',
    },
    {
      value: summary.plannedRunKm
        ? `${formatNumber(summary.runKm, 1)}/${formatNumber(summary.plannedRunKm, 1)} km`
        : `${formatNumber(summary.runKm, 1)} km`,
      label: 'de corrida',
    },
    { value: summary.trainedSec > 0 ? formatDuration(summary.trainedSec * 1000) : '0 min', label: 'de treino' },
  ]
  return (
    <dl className="mt-3 grid grid-cols-3 divide-x divide-line rounded-xl border border-line py-2 text-center">
      {numbers.map(({ value, label }) => (
        <div key={label} className="flex min-w-0 flex-col-reverse px-1">
          <dt className="truncate text-xs text-muted">{label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
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
