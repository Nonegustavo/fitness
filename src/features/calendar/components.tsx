import {
  Activity as ActivityIcon,
  BedDouble,
  Bike,
  CalendarPlus,
  Check,
  Clock,
  Dumbbell,
  Footprints,
  Pencil,
  Play,
  Trash2,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { toneColor, type Tone } from '../../components/tone'
import { Button, cx, Field, IconButton, SkeletonLines, TextInput } from '../../components/ui'
import type { WorkoutPlan } from '../../db/types'
import { formatDay, formatTime, shiftDay, type DayKey } from '../../lib/dates'
import { formatClock, formatDuration } from '../../lib/format'
import { formatDistance } from '../activities/activities'
import { useStartWorkout } from '../training/components'
import { summarize } from '../training/stats'
import { useSessions, useTemplates } from '../training/training'
import { suggestTemplate, type AgendaItem, type AgendaKind, type AgendaStatus } from './agenda'
import { reschedule, schedule, setEventTime, unschedule, undoUnschedule, useAgenda, usePlans } from './plans'
import { tapFeedback } from '../../lib/haptics'

export const KIND_ICONS: Record<AgendaKind, LucideIcon> = {
  gym: Dumbbell,
  run: Footprints,
  walk: Footprints,
  ride: Bike,
  swim: Waves,
  rest: BedDouble,
  other: ActivityIcon,
}

export const KIND_TONES: Record<AgendaKind, Tone> = {
  gym: 'training',
  run: 'today',
  walk: 'today',
  ride: 'today',
  swim: 'water',
  rest: 'sleep',
  other: 'insights',
}

export const KIND_LABELS: Record<AgendaKind, string> = {
  gym: 'Musculação',
  run: 'Corrida',
  walk: 'Caminhada',
  ride: 'Pedal',
  swim: 'Natação',
  rest: 'Descanso',
  other: 'Atividade',
}

const ICON_SIZES = {
  xs: ['size-[18px] rounded-md', 11],
  sm: ['size-7 rounded-lg', 16],
  md: ['size-9 rounded-xl', 18],
} as const

/** Solid when done, outlined while planned, gray when the day passed without it. */
export function AgendaIcon({
  kind,
  status,
  size = 'sm',
}: {
  kind: AgendaKind
  status: AgendaStatus
  size?: keyof typeof ICON_SIZES
}) {
  const Icon = KIND_ICONS[kind]
  const color = toneColor(KIND_TONES[kind])
  const [box, iconSize] = ICON_SIZES[size]
  const style: CSSProperties =
    status === 'done' || status === 'active'
      ? { background: color, color: 'var(--surface)' }
      : status === 'missed'
        ? { background: 'var(--surface-2)', color: 'var(--muted)' }
        : {
            background: `color-mix(in oklab, ${color} 14%, transparent)`,
            color,
            boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${color} 60%, transparent)`,
          }
  return (
    <span
      aria-hidden
      className={cx('inline-flex shrink-0 items-center justify-center', box, status === 'active' && 'animate-pulse')}
      style={style}
    >
      <Icon size={iconSize} strokeWidth={2.25} />
    </span>
  )
}

/** The legend of the icons' looks. */
export function AgendaLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <AgendaIcon kind="gym" status="done" size="xs" /> feito
      </span>
      <span className="flex items-center gap-1.5">
        <AgendaIcon kind="gym" status="planned" size="xs" /> programado
      </span>
      <span className="flex items-center gap-1.5">
        <AgendaIcon kind="run" status="planned" size="xs" /> corrida
      </span>
      <span className="flex items-center gap-1.5">
        <AgendaIcon kind="gym" status="missed" size="xs" /> não feito
      </span>
    </p>
  )
}

/** The second line of an item: when, how long, how far, or where it came from. */
export function describeItem(item: AgendaItem): string {
  if (item.status === 'active') return 'Em andamento'
  if (item.status === 'done') {
    const parts = [item.time !== undefined ? `Feito às ${formatTime(item.time)}` : 'Feito']
    if (item.session) {
      const summary = summarize(item.session)
      if (summary.durationMs) parts.push(formatDuration(summary.durationMs))
      parts.push(`${summary.sets} séries`)
    } else if (item.activity) {
      if (item.activity.distanceM) parts.push(formatDistance(item.activity.distanceM))
      parts.push(formatClock(item.activity.timerSec))
    }
    return parts.join(' · ')
  }
  const source = item.event ? ' · pelo Garmin' : ''
  if (item.status === 'missed') return `Não feito${source}`
  const when = item.plan?.time ?? (item.time !== undefined ? formatTime(item.time) : undefined)
  const what = item.plan ? 'Programado' : KIND_LABELS[item.kind]
  return `${what}${when ? ` às ${when}` : ''}${source}`
}

/** "hoje, 5 de novembro", "amanhã, …" or the weekday and date, for a day's heading. */
export function dayTitle(date: DayKey, today: DayKey): string {
  if (date === today) return `hoje, ${formatDay(date, "d 'de' MMMM")}`
  if (date === shiftDay(today, 1)) return `amanhã, ${formatDay(date, "d 'de' MMMM")}`
  return formatDay(date)
}

function ItemRow({
  item,
  today,
  onEdit,
  onTime,
}: {
  item: AgendaItem
  today: DayKey
  onEdit: (plan: WorkoutPlan) => void
  onTime: (item: AgendaItem) => void
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const start = useStartWorkout()
  const templates = useTemplates()
  const link = item.session
    ? `/treinos/sessao/${item.session.id}`
    : item.activity
      ? `/treinos/atividades/${item.activity.id}`
      : undefined
  const plan = item.plan
  const pending = plan && (item.status === 'planned' || item.status === 'missed')
  // A Garmin workout still ahead can get the time it's planned for.
  const timeable = item.eventKey && item.status === 'planned' && item.kind !== 'rest'
  const template = plan && templates?.find((t) => t.id === plan.templateId)

  const drop = () => {
    if (!plan) return
    void unschedule(plan.id)
    toast({ message: `${item.title} saiu do calendário.`, action: { label: 'Desfazer', onClick: () => void undoUnschedule(plan.id) } })
  }

  return (
    <li className="flex items-start gap-3 py-2.5">
      <AgendaIcon kind={item.kind} status={item.status} size="md" />
      <div className="min-w-0 flex-1">
        {link ? (
          <Link to={link} className="block truncate text-sm font-medium hover:text-accent-ink">
            {item.title}
          </Link>
        ) : (
          <p className={cx('truncate text-sm font-medium', item.status === 'missed' && 'text-ink-2 line-through')}>
            {item.title}
          </p>
        )}
        <p className="text-xs text-muted">{describeItem(item)}</p>
        {item.event?.description && item.status !== 'done' && (
          <p className="mt-0.5 line-clamp-3 text-xs whitespace-pre-line text-ink-2">{item.event.description}</p>
        )}
      </div>
      {item.status === 'active' && item.session && (
        <Button size="sm" variant="primary" onClick={() => navigate(`/treinos/sessao/${item.session!.id}`)}>
          Continuar
        </Button>
      )}
      {timeable && (
        <IconButton label={item.customTime ? `Mudar o horário de ${item.title}` : `Definir o horário de ${item.title}`} onClick={() => onTime(item)}>
          <Clock size={16} className={item.customTime ? 'text-accent-ink' : undefined} />
        </IconButton>
      )}
      {pending && (
        <div className="flex shrink-0 items-center gap-1">
          {item.date === today && template && (
            <Button size="sm" variant="primary" onClick={() => void start(template)}>
              <Play size={14} /> Iniciar
            </Button>
          )}
          <IconButton label={`Alterar ${item.title}`} onClick={() => onEdit(plan)}>
            <Pencil size={16} />
          </IconButton>
          <IconButton label={`Tirar ${item.title} do calendário`} onClick={drop}>
            <Trash2 size={16} />
          </IconButton>
        </div>
      )}
    </li>
  )
}

/** Items with their actions: start, change or unschedule what is scheduled; open what was done. */
export function AgendaItems({ items, today }: { items: AgendaItem[]; today: DayKey }) {
  const [editing, setEditing] = useState<WorkoutPlan>()
  const [timing, setTiming] = useState<AgendaItem>()
  return (
    <>
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <ItemRow key={item.key} item={item} today={today} onEdit={setEditing} onTime={setTiming} />
        ))}
      </ul>
      {editing && <PlanModal date={editing.date} today={today} plan={editing} onClose={() => setEditing(undefined)} />}
      {timing && <EventTimeModal item={timing} onClose={() => setTiming(undefined)} />}
    </>
  )
}

/** The time a Garmin workout (a SisRUN run) is planned for: the coach's plan only has the day. */
function EventTimeModal({ item, onClose }: { item: AgendaItem; onClose: () => void }) {
  const toast = useToast()
  const [time, setTime] = useState(item.customTime ?? (item.time !== undefined ? formatTime(item.time) : ''))
  const store = async (value: string | undefined) => {
    tapFeedback()
    await setEventTime(item.eventKey!, item.date, value)
    toast({ message: value ? `${item.title} às ${value}.` : `Horário de ${item.title} tirado.` })
    onClose()
  }
  return (
    <Modal open title="Horário planejado" onClose={onClose}>
      <p className="text-sm font-medium">{item.title}</p>
      <p className="mb-4 text-xs text-muted first-letter:uppercase">{formatDay(item.date)}</p>
      <Field label="Horário">
        <TextInput type="time" value={time} autoFocus onChange={(event) => setTime(event.target.value)} />
      </Field>
      <div className="mt-4 flex gap-2">
        {item.customTime && (
          <Button variant="ghost" onClick={() => void store(undefined)}>
            Tirar
          </Button>
        )}
        <Button className="ml-auto" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" disabled={!time} onClick={() => void store(time)}>
          Salvar
        </Button>
      </div>
    </Modal>
  )
}

/** A day of the calendar: what was done, what is planned, and scheduling a template there. */
export function DayDetails({ date, today }: { date: DayKey; today: DayKey }) {
  const items = useAgenda(date, date, today)
  const [adding, setAdding] = useState(false)
  return (
    <div>
      {!items ? (
        <SkeletonLines lines={2} />
      ) : items.length === 0 ? (
        <p className="py-3 text-sm text-muted">{date < today ? 'Nenhum treino neste dia.' : 'Nada programado ainda.'}</p>
      ) : (
        <AgendaItems items={items} today={today} />
      )}
      {date >= today && (
        <Button className="mt-3 w-full" onClick={() => setAdding(true)}>
          <CalendarPlus size={18} /> Programar treino de academia
        </Button>
      )}
      {adding && <PlanModal date={date} today={today} onClose={() => setAdding(false)} />}
    </div>
  )
}

/** Scheduling a template on a day, or changing one already scheduled (template, day, time). */
export function PlanModal({
  date,
  today,
  plan,
  onClose,
}: {
  date: DayKey
  today: DayKey
  plan?: WorkoutPlan
  onClose: () => void
}) {
  const toast = useToast()
  const templates = useTemplates()
  const sessions = useSessions()
  const plans = usePlans(date < today ? date : today, date < today ? today : date)
  const [templateId, setTemplateId] = useState(plan?.templateId)
  const [day, setDay] = useState(plan?.date ?? date)
  const [time, setTime] = useState(plan?.time ?? '')

  const loading = !templates || !sessions || !plans
  const suggested = !loading && !plan ? suggestTemplate(day, today, { templates, sessions, plans }) : undefined
  const chosen = templateId ?? suggested?.id
  const choices = (templates ?? []).filter((t) => !t.archived || t.id === plan?.templateId)

  const submit = async () => {
    if (!chosen || !day) return
    const name = choices.find((t) => t.id === chosen)?.name ?? 'Treino'
    tapFeedback()
    if (plan) await reschedule(plan.id, { templateId: chosen, date: day, time: time || undefined })
    else await schedule(day, chosen, time || undefined)
    toast({ message: `${name} programado para ${day === today ? 'hoje' : formatDay(day, 'EEEE, d/MM')}.` })
    onClose()
  }

  return (
    <Modal open title={plan ? 'Alterar treino programado' : 'Programar treino'} onClose={onClose}>
      {loading ? (
        <SkeletonLines lines={4} />
      ) : choices.length === 0 ? (
        <p className="py-4 text-sm text-ink-2">
          Nenhuma ficha ainda.{' '}
          <Link to="/treinos/ficha/nova" className="font-medium text-accent-ink underline underline-offset-2">
            Montar a primeira
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          <Field label="Ficha" group>
            <div role="radiogroup" aria-label="Ficha" className="space-y-1.5">
              {choices.map((template) => {
                const selected = template.id === chosen
                return (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={template.name}
                    onClick={() => setTemplateId(template.id)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                      selected ? 'border-accent-ink' : 'border-line hover:bg-surface-2',
                    )}
                    style={selected ? { background: 'color-mix(in oklab, var(--accent) 12%, transparent)' } : undefined}
                  >
                    <AgendaIcon kind="gym" status={selected ? 'done' : 'planned'} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{template.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {template.exercises.length} exercícios
                        {template.id === suggested?.id && ' · próxima da sequência'}
                        {template.archived ? ' · arquivada' : ''}
                      </span>
                    </span>
                    {selected && <Check size={18} className="shrink-0 text-accent-ink" />}
                  </button>
                )
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia">
              <TextInput type="date" value={day} min={plan ? undefined : today} onChange={(e) => setDay(e.target.value)} />
            </Field>
            <Field label="Horário" hint="Opcional">
              <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" className="flex-1" disabled={!chosen || !day} onClick={() => void submit()}>
              {plan ? 'Salvar' : 'Programar'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
