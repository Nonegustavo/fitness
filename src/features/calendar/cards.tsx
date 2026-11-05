import { CalendarDays, Dumbbell, Play } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { Modal } from '../../components/Modal'
import { toneColor } from '../../components/tone'
import { Button, Card, cx, Empty, SkeletonCard, SkeletonLines } from '../../components/ui'
import { dayRange, formatTime, parseDay, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { useStartWorkout } from '../training/components'
import { findActive, useSessions } from '../training/training'
import { byDay, shortTitle, type AgendaItem } from './agenda'
import { AgendaIcon, AgendaItems, DayDetails, dayTitle, KIND_LABELS, KIND_TONES } from './components'
import { useAgenda, useTodayTemplate } from './plans'

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
 * The Hoje card above "Em foco": the current week from Sunday to Saturday, a dot for each workout
 * (solid when done, a ring while planned, gray when missed) and a dash on free days.
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
        <div className="grid grid-cols-7 gap-1.5">
          {dayRange(from, to).map((date) => (
            <DayPill key={date} date={date} today={today} items={days.get(date) ?? []} onOpen={() => setOpen(date)} />
          ))}
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
      <DayMarks items={items} onAccent={isToday} />
    </button>
  )
}

/** A day's workouts as dots, or a dash when it's free. */
export function DayMarks({ items, onAccent = false }: { items: AgendaItem[]; onAccent?: boolean }) {
  return (
    <span aria-hidden className="flex h-2 items-center justify-center gap-[3px]">
      {items.length === 0 ? (
        <span className={cx('h-[3px] w-3.5 rounded-full', onAccent ? 'bg-white/60' : 'bg-baseline')} />
      ) : (
        items.slice(0, 3).map((item) => <Dot key={item.key} item={item} onAccent={onAccent} />)
      )}
    </span>
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

/**
 * "Em foco": every workout of today, gym and runs, with their actions (start, time, open what was
 * done). Without a gym workout today, the rotation's next template to start; and what comes next.
 */
export function TodayWorkoutsCard({ today }: { today: DayKey }) {
  const agenda = useAgenda(today, shiftDay(today, 13), today)
  const todays = useTodayTemplate(today)
  const sessions = useSessions()
  const start = useStartWorkout()
  if (!agenda || !sessions) return <SkeletonCard lines={3} />
  const todayItems = agenda.filter((item) => item.date === today && item.kind !== 'rest')
  const next = agenda.find((item) => item.date > today && item.status === 'planned' && item.kind !== 'rest')
  const gymToday = todayItems.some((item) => item.kind === 'gym')
  return (
    <Card icon={Dumbbell} tone="training" title="Treinos de hoje" action={calendarLink}>
      {todayItems.length > 0 ? (
        <AgendaItems items={todayItems} today={today} />
      ) : (
        <p className="py-1 text-sm text-ink-2">Nada programado para hoje.</p>
      )}
      {!findActive(sessions) && !gymToday && todays && (
        <div className="mt-2 flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
          <AgendaIcon kind="gym" status="planned" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-2">Próxima ficha da sequência</p>
            <p className="truncate text-sm font-medium">{todays.template.name}</p>
          </div>
          <Button size="sm" variant="primary" onClick={() => void start(todays.template)}>
            <Play size={14} /> Iniciar
          </Button>
        </div>
      )}
      {next && (
        <p className="mt-2 text-xs text-muted first-letter:uppercase">
          Próximo: {dayTitle(next.date, today)}
          {next.time !== undefined && ` às ${formatTime(next.time)}`} · {shortTitle(next)}
        </p>
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
