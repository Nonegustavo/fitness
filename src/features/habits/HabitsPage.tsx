import { startOfWeek } from 'date-fns'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Legend } from '../../components/Chart'
import { DayNav } from '../../components/DayNav'
import { Modal } from '../../components/Modal'
import { Button, Card, DecimalInput, Field, IconButton, Page, Segmented, TextInput } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { patch, remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Habit } from '../../db/types'
import { dayKey, dayRange, formatDay, parseDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'
import { HabitCheckList } from './HabitCheckList'
import {
  describeHabit,
  HABIT_SUGGESTIONS,
  streak,
  successRate,
  useHabitLogs,
  useHabits,
  valuesByHabit,
  type HabitTemplate,
} from './habits'

const HISTORY_WEEKS = 12

export default function HabitsPage() {
  const today = useToday()
  const [date, setDate] = useState(today)
  const habits = useHabits()
  const [editing, setEditing] = useState<Habit | 'new' | null>(null)

  const active = habits?.filter((habit) => habit.archived === 0) ?? []
  const archived = habits?.filter((habit) => habit.archived === 1) ?? []
  const nextOrder = habits?.length ? Math.max(...habits.map((habit) => habit.order)) + 1 : 0

  async function addSuggestion(template: HabitTemplate) {
    await save(db.habits, { ...template, startDate: today, archived: 0, order: nextOrder })
  }

  return (
    <Page
      title="Hábitos"
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
          <HabitHistory habits={active} today={today} />
        </Card>
      )}

      {habits && habits.length > 0 && (
        <Card title="Gerenciar">
          <ul className="divide-y divide-line">
            {[...active, ...archived].map((habit) => (
              <li key={habit.id} className="flex items-center gap-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {habit.name}
                    {habit.archived === 1 && <span className="ml-2 text-xs font-normal text-muted">arquivado</span>}
                  </p>
                  <p className="text-xs text-muted">{describeHabit(habit)}</p>
                </div>
                <IconButton
                  label={habit.archived ? 'Desarquivar' : 'Arquivar'}
                  onClick={() => void patch(db.habits, habit.id, { archived: habit.archived ? 0 : 1 })}
                >
                  {habit.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </IconButton>
                <IconButton label="Editar hábito" onClick={() => setEditing(habit)}>
                  <Pencil size={16} />
                </IconButton>
              </li>
            ))}
          </ul>
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

function HabitHistory({ habits, today }: { habits: Habit[]; today: DayKey }) {
  // Week columns from Monday, ending with the current week.
  const firstDay = shiftDay(dayKey(startOfWeek(parseDay(today), { weekStartsOn: 1 })), -7 * (HISTORY_WEEKS - 1))
  const lastDay = shiftDay(firstDay, 7 * HISTORY_WEEKS - 1)
  const days = useMemo(() => dayRange(firstDay, lastDay), [firstDay, lastDay])
  const logs = useHabitLogs(firstDay, today)
  const values = useMemo(() => valuesByHabit(logs ?? []), [logs])

  return (
    <>
      <Legend
        items={[
          { label: 'Fez (hábito bom)', color: 'var(--series-1)', kind: 'dot' },
          { label: 'Aconteceu (hábito a evitar)', color: 'var(--series-2)', kind: 'dot' },
        ]}
      />
      <ul className="space-y-4">
        {habits.map((habit) => {
          const habitValues = values.get(habit.id) ?? new Map<DayKey, number>()
          return (
            <li key={habit.id}>
              <HabitStats habit={habit} values={habitValues} today={today} />
              <Heatmap habit={habit} days={days} values={habitValues} today={today} />
            </li>
          )
        })}
      </ul>
    </>
  )
}

function HabitStats({ habit, values, today }: { habit: Habit; values: Map<DayKey, number>; today: DayKey }) {
  const current = streak(habit, values, today)
  const rate = successRate(habit, values, shiftDay(today, -29), today)
  const streakText =
    current === 0 ? 'sem sequência' : habit.polarity === 'good' ? `${current} dias seguidos` : `${current} dias sem`
  return (
    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
      <span className="text-sm font-medium">{habit.name}</span>
      <span className="text-xs text-ink-2">
        {streakText}
        {rate !== undefined && ` · ${formatNumber(rate * 100, 0)}% dos dias (30d)`}
      </span>
    </div>
  )
}

function Heatmap({
  habit,
  days,
  values,
  today,
}: {
  habit: Habit
  days: DayKey[]
  values: Map<DayKey, number>
  today: DayKey
}) {
  const color = habit.polarity === 'good' ? 'var(--series-1)' : 'var(--series-2)'
  const scale = habit.kind === 'count' ? Math.max(habit.target ?? 0, ...values.values(), 1) : 1

  return (
    <div
      role="img"
      aria-label={`${habit.name}: registros das últimas ${HISTORY_WEEKS} semanas`}
      className="grid grid-flow-col grid-rows-7 justify-start gap-[3px]"
    >
      {days.map((day) => {
        const value = values.get(day) ?? 0
        const outside = day > today || day < habit.startDate
        // One-hue ramp from the empty track to the full color, by amount.
        const strength = value > 0 ? 40 + 60 * Math.min(value / scale, 1) : 0
        return (
          <span
            key={day}
            title={outside ? undefined : `${formatDay(day, "EEE, d 'de' MMM")}: ${value}`}
            className="size-3.5 rounded-[3px] sm:size-4"
            style={{
              background: outside
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
  const target = parseDecimal(targetText)
  const valid = name.trim() !== '' && (targetText.trim() === '' || (target !== undefined && target >= 0))

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
