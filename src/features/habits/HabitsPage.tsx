import { Archive, ArchiveRestore, Check, Circle, ListChecks, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { DayNav } from '../../components/DayNav'
import { Modal } from '../../components/Modal'
import { SortableList } from '../../components/Sortable'
import { Button, Card, cx, DecimalInput, Field, IconButton, Page, Segmented, Switch, TextInput } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { patch, remove, save, saveOrder } from '../../db/repo'
import { db } from '../../db/schema'
import type { Habit, HabitLog } from '../../db/types'
import { dayRange, formatDay, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'
import { isAndroidApp } from '../healthconnect/plugin'
import { requestNotificationPermission } from '../notifications/native'
import { describeReminder, WEEKDAY_NAMES, WEEKDAYS } from '../notifications/reminders'
import { HabitCheckList } from './HabitCheckList'
import {
  daysByHabit,
  describeHabit,
  HABIT_SUGGESTIONS,
  habitTime,
  NO_DAYS,
  skippedBetween,
  streak,
  successRate,
  useHabitLogs,
  useHabits,
  type HabitDays,
  type HabitTemplate,
} from './habits'
import { defaultColor, HABIT_COLORS, HABIT_ICONS, HabitBadge, habitColor, showsBadges } from './look'

const HISTORY_WEEKS = 12

/** A skipped day in the history: stripes instead of a color. */
const SKIPPED_CELL = 'repeating-linear-gradient(135deg, var(--muted) 0 1px, var(--surface-2) 1px 3.5px)'

export default function HabitsPage() {
  const today = useToday()
  const [date, setDate] = useState(today)
  const habits = useHabits()
  const [editing, setEditing] = useState<Habit | 'new' | null>(null)

  const active = habits?.filter((habit) => habit.archived === 0) ?? []
  const archived = habits?.filter((habit) => habit.archived === 1) ?? []
  const nextOrder = habits?.length ? Math.max(...habits.map((habit) => habit.order)) + 1 : 0
  const badges = showsBadges(habits ?? [])

  async function addSuggestion(template: HabitTemplate) {
    await save(db.habits, { ...template, startDate: today, archived: 0, order: nextOrder })
  }

  return (
    <Page
      title="Hábitos"
      icon={ListChecks}
      tone="habits"
      subtitle="O que pode influenciar seu sono, peso e treino"
      actions={
        <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> Novo
        </Button>
      }
    >
      <Card>
        <DayNav date={date} today={today} onChange={setDate} />
        <HabitCheckList date={date} />
        {active.some((habit) => habit.polarity === 'good') && (
          <p className="mt-2 text-xs text-muted">Toque e segure um hábito a fazer para pular o dia (chuva, viagem…).</p>
        )}
      </Card>

      {habits && active.length < 3 && (
        <Card title="Sugestões">
          <div className="flex flex-wrap gap-2">
            {HABIT_SUGGESTIONS.filter((s) => !habits.some((h) => h.name === s.name)).map((suggestion) => (
              <Button key={suggestion.name} size="sm" onClick={() => void addSuggestion(suggestion)}>
                <Plus size={14} /> {suggestion.name}
                <span className="text-xs text-muted">{suggestion.polarity === 'bad' ? 'evitar' : 'fazer'}</span>
              </Button>
            ))}
          </div>
        </Card>
      )}

      {active.length > 0 && (
        <Card title={`Últimas ${HISTORY_WEEKS} semanas`}>
          <HabitHistory habits={active} today={today} badges={badges} />
        </Card>
      )}

      {habits && habits.length > 0 && (
        <Card title="Gerenciar">
          <SortableList
            className="divide-y divide-line"
            itemClassName="flex items-center gap-2 bg-surface py-1.5"
            items={active}
            getId={(habit) => habit.id}
            onReorder={(list) => void saveOrder(db.habits, [...list, ...archived])}
          >
            {(habit, handle) => (
              <>
                <span className="-ml-2 flex">{handle}</span>
                <HabitRow habit={habit} badge={badges} onEdit={() => setEditing(habit)} />
              </>
            )}
          </SortableList>
          {archived.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {archived.map((habit) => (
                <li key={habit.id} className="flex items-center gap-2 py-1.5">
                  <HabitRow habit={habit} badge={badges} onEdit={() => setEditing(habit)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {editing && (
        <HabitModal
          habit={editing === 'new' ? null : editing}
          today={today}
          nextOrder={nextOrder}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  )
}

/** "às 07:30", or the reminder's days and time. */
function whenText(habit: Habit): string | undefined {
  const time = habitTime(habit)
  if (habit.reminder) return `⏰ ${describeReminder({ time: time ?? habit.reminder.time, days: habit.reminder.days })}`
  return time && `às ${time}`
}

/** Tap the habit to edit it; archiving stays one tap away. */
function HabitRow({ habit, badge, onEdit }: { habit: Habit; badge: boolean; onEdit: () => void }) {
  const when = whenText(habit)
  return (
    <>
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left hover:text-accent-ink">
        {badge && <HabitBadge habit={habit} muted={habit.archived === 1} />}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {habit.name}
            {habit.archived === 1 && <span className="ml-2 text-xs font-normal text-muted">arquivado</span>}
          </span>
          <span className="block truncate text-xs text-muted">
            {describeHabit(habit)}
            {when && ` · ${when}`}
          </span>
        </span>
      </button>
      <IconButton
        label={habit.archived ? 'Desarquivar' : 'Arquivar'}
        onClick={() => void patch(db.habits, habit.id, { archived: habit.archived ? 0 : 1 })}
      >
        {habit.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
      </IconButton>
    </>
  )
}

function HabitHistory({ habits, today, badges }: { habits: Habit[]; today: DayKey; badges: boolean }) {
  // Week columns from Sunday, ending with the current week.
  const firstDay = shiftDay(weekStart(today), -7 * (HISTORY_WEEKS - 1))
  const lastDay = shiftDay(firstDay, 7 * HISTORY_WEEKS - 1)
  const days = useMemo(() => dayRange(firstDay, lastDay), [firstDay, lastDay])
  const logs = useHabitLogs(firstDay, today)
  const byHabit = useMemo(() => daysByHabit(logs ?? []), [logs])
  const notes = useMemo(() => new Map((logs ?? []).flatMap((log) => (log.note ? [[log.id, log.note] as const] : []))), [logs])
  // With colors of their own, the cells no longer say which kind of habit it is.
  const legend = [
    ...(badges
      ? [{ label: 'Fez ou aconteceu, na cor do hábito', background: 'var(--ink-2)' }]
      : [
          { label: 'Fez (hábito bom)', background: defaultColor('good') },
          { label: 'Aconteceu (hábito a evitar)', background: defaultColor('bad') },
        ]),
    { label: 'Pulado', background: SKIPPED_CELL },
  ]

  return (
    <>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {legend.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px]" style={{ background: item.background }} />
            {item.label}
          </li>
        ))}
      </ul>
      <ul className="space-y-4">
        {habits.map((habit) => {
          const habitDays = byHabit.get(habit.id) ?? NO_DAYS
          return (
            <li key={habit.id}>
              <HabitStats habit={habit} days={habitDays} today={today} badge={badges} />
              <Heatmap habit={habit} days={days} habitDays={habitDays} notes={notes} today={today} />
            </li>
          )
        })}
      </ul>
    </>
  )
}

function HabitStats({ habit, days, today, badge }: { habit: Habit; days: HabitDays; today: DayKey; badge: boolean }) {
  const from = shiftDay(today, -29)
  const current = streak(habit, days, today)
  const rate = successRate(habit, days, from, today)
  const skipped = skippedBetween(days, from, today).length
  const streakText =
    current === 0 ? 'sem sequência' : habit.polarity === 'good' ? `${current} dias seguidos` : `${current} dias sem`
  return (
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        {badge && <HabitBadge habit={habit} small />}
        <span className="min-w-0 truncate">{habit.name}</span>
      </span>
      <span className="text-xs text-ink-2">
        {streakText}
        {rate !== undefined && ` · ${formatNumber(rate * 100, 0)}% dos dias (30d)`}
        {skipped > 0 && ` · ${skipped} ${skipped === 1 ? 'pulado' : 'pulados'}`}
      </span>
    </div>
  )
}

function Heatmap({
  habit,
  days,
  habitDays,
  notes,
  today,
}: {
  habit: Habit
  days: DayKey[]
  habitDays: HabitDays
  notes: Map<HabitLog['id'], string>
  today: DayKey
}) {
  const color = habitColor(habit)
  const scale = habit.kind === 'count' ? Math.max(habit.target ?? 0, ...habitDays.values.values(), 1) : 1

  return (
    <div
      role="img"
      aria-label={`${habit.name}: registros das últimas ${HISTORY_WEEKS} semanas`}
      className="grid grid-flow-col grid-rows-7 justify-start gap-[3px]"
    >
      {days.map((day) => {
        const value = habitDays.values.get(day) ?? 0
        const outside = day > today || day < habit.startDate
        const skipped = habitDays.skipped.has(day)
        // One-hue ramp from the empty track to the full color, by amount.
        const strength = value > 0 ? 40 + 60 * Math.min(value / scale, 1) : 0
        const note = notes.get(`${habit.id}:${day}`)
        const title = skipped ? `pulado${note ? ` (${note})` : ''}` : String(value)
        return (
          <span
            key={day}
            title={outside && !skipped ? undefined : `${formatDay(day, "EEE, d 'de' MMM")}: ${title}`}
            className="size-3.5 rounded-[3px] sm:size-4"
            style={{
              background: skipped
                ? SKIPPED_CELL
                : outside
                  ? 'transparent'
                  : value > 0
                    ? `color-mix(in oklab, ${color} ${strength}%, var(--surface-2))`
                    : 'var(--surface-2)',
            }}
          />
        )
      })}
    </div>
  )
}

const TIME = /^\d{2}:\d{2}$/

function HabitModal({
  habit,
  today,
  nextOrder,
  onClose,
}: {
  habit: Habit | null
  today: DayKey
  nextOrder: number
  onClose: () => void
}) {
  const [name, setName] = useState(habit?.name ?? '')
  const [kind, setKind] = useState<Habit['kind']>(habit?.kind ?? 'check')
  const [polarity, setPolarity] = useState<Habit['polarity']>(habit?.polarity ?? 'good')
  const [unit, setUnit] = useState(habit?.unit ?? '')
  const [targetText, setTargetText] = useState(habit?.target !== undefined ? String(habit.target) : '')
  const [color, setColor] = useState(habit?.color)
  const [icon, setIcon] = useState(habit?.icon)
  // The habit's time is also its reminder's (older habits only had the reminder's).
  const [time, setTime] = useState((habit && habitTime(habit)) ?? '')
  const [remind, setRemind] = useState(!!habit?.reminder)
  const [days, setDays] = useState<number[]>(habit?.reminder?.days ?? [0, 1, 2, 3, 4, 5, 6])
  const target = parseDecimal(targetText)
  const valid =
    name.trim() !== '' &&
    (targetText.trim() === '' || (target !== undefined && target >= 0)) &&
    (time === '' || TIME.test(time)) &&
    (!remind || (days.length > 0 && TIME.test(time)))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    await save(db.habits, {
      id: habit?.id,
      name: name.trim(),
      kind,
      polarity,
      unit: kind === 'count' && unit.trim() ? unit.trim() : undefined,
      target: kind === 'count' ? target : undefined,
      startDate: habit?.startDate ?? today,
      archived: habit?.archived ?? 0,
      order: habit?.order ?? nextOrder,
      time: time || undefined,
      color,
      icon,
      // The reminder keeps its own copy of the time, which older versions of the app read.
      reminder: remind && time ? { time, days: [...days].sort() } : undefined,
    })
    onClose()
  }

  async function onDelete() {
    if (!habit) return
    await remove(db.habits, habit.id)
    onClose()
  }

  return (
    <Modal open title={habit ? 'Editar hábito' : 'Novo hábito'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Álcool" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Objetivo" group>
            <Segmented
              label="Objetivo"
              value={polarity}
              onChange={setPolarity}
              options={[
                { value: 'good', label: 'Fazer' },
                { value: 'bad', label: 'Evitar' },
              ]}
            />
          </Field>
          <Field label="Registro" group>
            <Segmented
              label="Tipo de registro"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'check', label: 'Sim/não' },
                { value: 'count', label: 'Quantidade' },
              ]}
            />
          </Field>
        </div>
        {kind === 'count' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unidade">
              <TextInput value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="doses, xícaras…" />
            </Field>
            <Field label={polarity === 'good' ? 'Meta diária' : 'Limite diário'} hint="Opcional">
              <DecimalInput value={targetText} onChange={(e) => setTargetText(e.target.value)} />
            </Field>
          </div>
        )}

        <ColorPicker value={color} polarity={polarity} onChange={setColor} />
        <IconPicker value={icon} color={habitColor({ color, polarity })} onChange={setIcon} />

        <div className="space-y-3 rounded-xl bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Horário</span>
              <span className="block text-xs text-muted">Opcional · ordena a lista do dia</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <TextInput
                type="time"
                aria-label="Horário"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-28"
              />
              {time && (
                <IconButton
                  label="Tirar o horário"
                  className="size-9"
                  onClick={() => {
                    setTime('')
                    setRemind(false)
                  }}
                >
                  <X size={16} />
                </IconButton>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Lembrete</span>
              <span className="block text-xs text-muted">
                {isAndroidApp()
                  ? `Uma notificação ${time ? `às ${time}` : 'no horário'} enquanto o dia não estiver marcado`
                  : 'A notificação toca no app Android; dá para marcar daqui'}
              </span>
            </span>
            <Switch
              checked={remind}
              label="Lembrete"
              onChange={(on) => {
                setRemind(on)
                // A reminder needs a time; the evening is where it used to start.
                if (on && !time) setTime('20:00')
                if (on) void requestNotificationPermission()
              }}
            />
          </div>
          {remind && (
            <div>
              <div role="group" aria-label="Dias da semana" className="flex gap-1">
                {WEEKDAYS.map((letter, day) => (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={days.includes(day)}
                    aria-label={WEEKDAY_NAMES[day]}
                    onClick={() =>
                      setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]))
                    }
                    className={cx(
                      'size-8 rounded-full text-xs font-semibold transition',
                      days.includes(day) ? 'bg-accent text-white' : 'bg-surface text-ink-2',
                    )}
                  >
                    {letter}
                  </button>
                ))}
              </div>
              {days.length === 0 && <p className="mt-2 text-xs text-critical">Escolha pelo menos um dia.</p>}
              {!TIME.test(time) && <p className="mt-2 text-xs text-critical">Escolha o horário do lembrete.</p>}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {habit && (
            <Button variant="danger" onClick={() => void onDelete()}>
              <Trash2 size={16} /> Excluir
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** The palette, after the automatic color (blue to do, orange to avoid). */
function ColorPicker({
  value,
  polarity,
  onChange,
}: {
  value: string | undefined
  polarity: Habit['polarity']
  onChange: (color: string | undefined) => void
}) {
  const options = [
    { key: undefined, label: `Automática (${polarity === 'good' ? 'azul' : 'laranja'})`, color: defaultColor(polarity) },
    ...HABIT_COLORS.map(({ key, label }) => ({ key, label, color: `var(--habit-${key})` })),
  ]
  return (
    <Field label="Cor" group>
      <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.key === value
          return (
            <button
              key={option.key ?? 'auto'}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              title={option.label}
              onClick={() => onChange(option.key)}
              className={cx(
                'inline-flex size-8 items-center justify-center rounded-full transition',
                selected && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
              )}
              style={{ background: option.color, color: 'var(--surface)' }}
            >
              {selected ? <Check size={16} strokeWidth={3} /> : option.key === undefined && <span className="text-[10px] font-bold">A</span>}
            </button>
          )
        })}
      </div>
    </Field>
  )
}

/** The icons, after "none" (the plain circle to check). */
function IconPicker({ value, color, onChange }: { value: string | undefined; color: string; onChange: (icon: string | undefined) => void }) {
  const options = [{ key: undefined, label: 'Sem ícone', icon: Circle }, ...HABIT_ICONS]
  return (
    <Field label="Ícone" group>
      <div role="radiogroup" aria-label="Ícone" className="grid grid-cols-8 gap-1">
        {options.map(({ key, label, icon: Icon }) => {
          const selected = key === value
          return (
            <button
              key={key ?? 'none'}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              onClick={() => onChange(key)}
              className={cx(
                'inline-flex aspect-square items-center justify-center rounded-lg transition',
                selected ? 'ring-2 ring-current' : 'text-ink-2 hover:bg-surface-2',
              )}
              style={selected ? { color, background: `color-mix(in oklab, ${color} 14%, transparent)` } : undefined}
            >
              <Icon size={20} />
            </button>
          )
        })}
      </div>
    </Field>
  )
}
