import {
  Activity as ActivityIcon,
  BedDouble,
  Bike,
  Check,
  ChevronRight,
  Clock,
  Dumbbell,
  EyeOff,
  Footprints,
  MessageSquareText,
  Pencil,
  PersonStanding,
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
import { TemplateSheet } from '../training/TemplateDetails'
import { useSessions, useTemplates } from '../training/training'
import { WorkoutWeatherDetails, WorkoutWeatherLine } from '../weather/components'
import { workoutWeather, type WorkoutWeather } from '../weather/forecast'
import { useForecast } from '../weather/store'
import { suggestTemplate, type AgendaItem, type AgendaKind, type AgendaStatus } from './agenda'
import { EventDetails } from './EventDetails'
import { coachSummary, descriptionPreview } from './eventText'
import {
  dropWalk,
  reschedule,
  schedule,
  setEventHidden,
  setEventTime,
  undoDropWalk,
  unschedule,
  undoUnschedule,
  useAgenda,
  usePlans,
} from './plans'
import { WalkModal } from './WalkModal'
import { tapFeedback } from '../../lib/haptics'

export const KIND_ICONS: Record<AgendaKind, LucideIcon> = {
  gym: Dumbbell,
  run: Footprints,
  // Its own figure, so a walk never reads as a run.
  walk: PersonStanding,
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
        <AgendaIcon kind="walk" status="planned" size="xs" /> caminhada
      </span>
      <span className="flex items-center gap-1.5">
        <AgendaIcon kind="gym" status="missed" size="xs" /> não feito
      </span>
    </p>
  )
}

/** The second line of an item: when, how long, how far, or where it came from. */
export function describeItem(item: AgendaItem): string {
  // "Caminhada" is feminine: "feita", "programada".
  const walk = item.kind === 'walk'
  if (item.status === 'active') return 'Em andamento'
  if (item.status === 'done') {
    const done = walk ? 'Feita' : 'Feito'
    const parts = [item.time !== undefined ? `${done} às ${formatTime(item.time)}` : done]
    if (item.session) {
      const summary = summarize(item.session)
      if (summary.durationMs) parts.push(formatDuration(summary.durationMs))
      parts.push(`${summary.sets} séries`)
    } else if (item.activity) {
      if (item.activity.distanceM) parts.push(formatDistance(item.activity.distanceM))
      parts.push(formatClock(item.activity.timerSec))
      if (item.activity.effort) parts.push(`PSE ${item.activity.effort}`)
    }
    return parts.join(' · ')
  }
  const source = item.event ? ' · pelo Garmin' : item.repeats ? ' · toda semana' : ''
  if (item.status === 'missed') return `${walk ? 'Não feita' : 'Não feito'}${source}`
  const when = item.plan?.time ?? (item.time !== undefined ? formatTime(item.time) : undefined)
  const what = item.plan ? (walk ? 'Programada' : 'Programado') : KIND_LABELS[item.kind]
  return `${what}${when ? ` às ${when}` : ''}${source}`
}

/** "hoje, 5 de novembro", "amanhã, …" or the weekday and date, for a day's heading. */
export function dayTitle(date: DayKey, today: DayKey): string {
  if (date === today) return `hoje, ${formatDay(date, "d 'de' MMMM")}`
  if (date === shiftDay(today, 1)) return `amanhã, ${formatDay(date, "d 'de' MMMM")}`
  return formatDay(date)
}

/** Takes a Garmin workout off the agenda on its day, with a way back. */
function useHideEvent() {
  const toast = useToast()
  return async (item: AgendaItem) => {
    const key = item.eventKey
    if (!key) return
    tapFeedback()
    await setEventHidden(key, item.date, true)
    toast({
      message: `Treino oculto: ${item.title}.`,
      action: { label: 'Desfazer', onClick: () => void setEventHidden(key, item.date, false) },
    })
  }
}

function ItemRow({
  item,
  today,
  day,
  weather,
  onEdit,
  onTime,
  onDetails,
}: {
  item: AgendaItem
  today: DayKey
  /** The day it's for, when the list mixes days. */
  day?: string
  /** The forecast for it, while it's ahead and within the forecast's days. */
  weather?: WorkoutWeather
  onEdit: (item: AgendaItem) => void
  onTime: (item: AgendaItem) => void
  onDetails: (item: AgendaItem) => void
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const start = useStartWorkout()
  const templates = useTemplates()
  const hide = useHideEvent()
  const link = item.session
    ? `/treinos/sessao/${item.session.id}`
    : item.activity
      ? `/treinos/atividades/${item.activity.id}`
      : undefined
  const plan = item.plan
  const pending = plan && (item.status === 'planned' || item.status === 'missed')
  // A Garmin workout still ahead can get the time it's planned for (and be hidden from that sheet);
  // one that passed undone (the copy of a race listed twice, say) can be hidden right here.
  const timeable = item.eventKey && item.status === 'planned' && item.kind !== 'rest'
  const hideable = item.eventKey && item.status === 'missed'
  const template = plan?.templateId ? templates?.find((t) => t.id === plan.templateId) : undefined
  // What isn't done yet opens its ficha: a gym workout's template, a Garmin workout's steps (a rest
  // day only when the coach wrote something for it), a walk's forecast. What was done opens its own
  // page instead.
  const details =
    !link &&
    (!!plan?.templateId || (!!item.event && (item.kind !== 'rest' || !!item.event.description)) || (plan?.kind === 'walk' && !!weather))
  // The steps in a line: the coach's from SisRUN, else the Garmin calendar's description.
  const preview =
    item.status === 'done'
      ? ''
      : item.coach
        ? coachSummary(item.coach, { short: true })
        : item.event?.description
          ? descriptionPreview(item.event.description)
          : ''

  const drop = () => {
    if (!plan) return
    const walk = plan.kind === 'walk'
    void (walk ? dropWalk(plan) : unschedule(plan.id))
    toast({
      message: `${item.title} saiu do calendário${item.repeats ? ' neste dia' : ''}.`,
      action: { label: 'Desfazer', onClick: () => void (walk ? undoDropWalk(plan.id) : undoUnschedule(plan.id)) },
    })
  }

  // Spans, not paragraphs: the text sits inside a button when it opens the ficha.
  const text = (
    <>
      {day && <span className="block text-xs font-semibold text-accent-ink">{day}</span>}
      {link ? (
        <Link to={link} className="block truncate text-sm font-medium hover:text-accent-ink">
          {item.title}
        </Link>
      ) : (
        <span className={cx('flex min-w-0 items-center gap-0.5 text-sm font-medium', item.status === 'missed' && 'text-ink-2')}>
          <span className={cx('truncate', item.status === 'missed' && 'line-through')}>{item.title}</span>
          {details && <ChevronRight size={15} aria-hidden className="shrink-0 text-muted" />}
        </span>
      )}
      <span className="block text-xs text-muted">{describeItem(item)}</span>
      {weather && <WorkoutWeatherLine weather={weather} />}
      {item.activity?.notes?.trim() && (
        <span className="mt-0.5 flex items-start gap-1 text-xs text-ink-2">
          <MessageSquareText size={12} aria-label="Comentário" className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{item.activity.notes}</span>
        </span>
      )}
      {preview && <span className="mt-0.5 line-clamp-2 text-xs text-ink-2">{preview}</span>}
    </>
  )

  return (
    <li className="flex items-start gap-3 py-2.5">
      <AgendaIcon kind={item.kind} status={item.status} size="md" />
      {details ? (
        <button
          type="button"
          onClick={() => onDetails(item)}
          aria-haspopup="dialog"
          className="relative min-w-0 flex-1 rounded-lg text-left transition hover:text-accent-ink active:opacity-70"
        >
          {text}
          <span className="sr-only">{plan?.templateId ? 'Ver a ficha' : plan?.kind === 'walk' ? 'Ver a previsão' : 'Ver os detalhes'}</span>
        </button>
      ) : (
        <div className="min-w-0 flex-1">{text}</div>
      )}
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
      {hideable && (
        <IconButton label={`Ocultar ${item.title}`} onClick={() => void hide(item)}>
          <EyeOff size={16} />
        </IconButton>
      )}
      {pending && (
        <div className="flex shrink-0 items-center gap-1">
          {item.date === today && template && (
            <Button size="sm" variant="primary" onClick={() => void start(template)}>
              <Play size={14} /> Iniciar
            </Button>
          )}
          <IconButton label={`Alterar ${item.title}`} onClick={() => onEdit(item)}>
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
/** "Amanhã", or the weekday and date ("Sexta, 7/11"), for an item that isn't today's. */
export function itemDay(date: DayKey, today: DayKey): string {
  if (date === shiftDay(today, 1)) return 'Amanhã'
  const label = formatDay(date, 'EEE, d/MM')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** A list of workouts; `showDay` names the day of the ones that aren't today's. */
export function AgendaItems({ items, today, showDay = false }: { items: AgendaItem[]; today: DayKey; showDay?: boolean }) {
  const [editing, setEditing] = useState<AgendaItem>()
  const [timing, setTiming] = useState<AgendaItem>()
  const [viewing, setViewing] = useState<AgendaItem>()
  // The forecast is only fetched for lists with something still ahead (not a past day's).
  const { forecast } = useForecast({ active: items.some((item) => item.status === 'planned' && item.date >= today) })
  const plan = editing?.plan
  const close = () => setEditing(undefined)
  return (
    <>
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <ItemRow
            key={item.key}
            item={item}
            today={today}
            day={showDay && item.date !== today ? itemDay(item.date, today) : undefined}
            weather={workoutWeather(item, forecast, today)}
            onEdit={setEditing}
            onTime={setTiming}
            onDetails={setViewing}
          />
        ))}
      </ul>
      {plan &&
        (plan.kind === 'walk' ? (
          <WalkModal date={plan.date} today={today} plan={plan} repeats={editing.repeats} onClose={close} />
        ) : (
          <PlanModal date={plan.date} today={today} plan={plan} onClose={close} />
        ))}
      {timing && <EventTimeModal item={timing} onClose={() => setTiming(undefined)} />}
      {viewing && <ItemDetails item={viewing} today={today} onClose={() => setViewing(undefined)} />}
    </>
  )
}

/** When a workout is: "sexta-feira, 7 de novembro · às 07:00 · pelo Garmin", and whether it was missed. */
function whenLine(item: AgendaItem, today: DayKey): string {
  const walk = item.kind === 'walk'
  return [
    dayTitle(item.date, today),
    item.time !== undefined && `às ${formatTime(item.time)}`,
    item.event && 'pelo Garmin',
    item.status === 'missed' && (walk ? 'não feita' : 'não feito'),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * The ficha of a workout not done yet: a scheduled template's exercises (with Iniciar on its day), or
 * what the Garmin calendar says of a coach's workout; for a walk, its forecast. Each with the
 * weather expected, within the forecast's days.
 */
function ItemDetails({ item, today, onClose }: { item: AgendaItem; today: DayKey; onClose: () => void }) {
  const templateId = item.plan?.templateId
  if (templateId) {
    return (
      <TemplateSheet
        templateId={templateId}
        subtitle={whenLine(item, today)}
        canStart={item.date === today && item.status === 'planned'}
        onClose={onClose}
      >
        <WorkoutWeatherDetails item={item} today={today} />
      </TemplateSheet>
    )
  }
  if (!item.event && item.plan?.kind !== 'walk') return null
  return (
    <Modal open title={item.title} onClose={onClose}>
      <p className="-mt-1 mb-4 text-xs text-muted first-letter:uppercase">{whenLine(item, today)}</p>
      <WorkoutWeatherDetails item={item} today={today} />
      {item.event && <EventDetails event={item.event} kind={item.kind} coach={item.coach} />}
    </Modal>
  )
}

/**
 * The time a Garmin workout (a SisRUN run) is planned for: the coach's plan only has the day. Also
 * where it can be hidden, when the feed lists it twice.
 */
function EventTimeModal({ item, onClose }: { item: AgendaItem; onClose: () => void }) {
  const toast = useToast()
  const hide = useHideEvent()
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
      <div className="mt-5 border-t border-line pt-3">
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            void hide(item)
            onClose()
          }}
        >
          <EyeOff size={16} /> Ocultar este treino
        </Button>
        <p className="mt-1 text-center text-xs text-muted">
          Só neste dia, para um treino repetido (a mesma prova pelo Garmin e pelo SisRUN). Ele volta pela lista Ocultos do
          Calendário.
        </p>
      </div>
    </Modal>
  )
}

/** A day of the calendar: what was done, what is planned, and scheduling a template or a walk there. */
export function DayDetails({ date, today }: { date: DayKey; today: DayKey }) {
  const items = useAgenda(date, date, today)
  const [adding, setAdding] = useState<'gym' | 'walk'>()
  const close = () => setAdding(undefined)
  const { gym: GymIcon, walk: WalkIcon } = KIND_ICONS
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
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-muted">Programar neste dia</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setAdding('gym')}>
              <GymIcon size={18} /> Academia
            </Button>
            <Button onClick={() => setAdding('walk')}>
              <WalkIcon size={18} /> Caminhada
            </Button>
          </div>
        </div>
      )}
      {adding === 'gym' && <PlanModal date={date} today={today} onClose={close} />}
      {adding === 'walk' && <WalkModal date={date} today={today} onClose={close} />}
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
