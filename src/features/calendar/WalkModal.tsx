import { CalendarOff } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, cx, DecimalInput, Field, Segmented, Switch, TextInput } from '../../components/ui'
import type { WorkoutPlan } from '../../db/types'
import { formatDay, type DayKey } from '../../lib/dates'
import { tapFeedback } from '../../lib/haptics'
import { WEEKDAY_NAMES, WEEKDAYS } from '../notifications/reminders'
import { changeWalk, dropWalk, refreshRoutineDay, scheduleWalk, setWalkRoutine, useWalkRoutine } from './plans'
import { goalOf, nextRoutine, walkTarget, weekdayOf, weekdaysText, type WalkFields, type WalkGoal } from './walks'

const GOALS: { value: WalkGoal; label: string }[] = [
  { value: 'none', label: 'Sem meta' },
  { value: 'min', label: 'Tempo' },
  { value: 'km', label: 'Distância' },
]

const weeklyText = (days: number[], fields: WalkFields) =>
  `Caminhada semanal: ${weekdaysText(days)}${fields.time ? ` às ${fields.time}` : ''}.`

/**
 * Scheduling a walk on a day, or changing one: a time, a goal (minutes or km) and, to repeat it,
 * the weekdays (Settings.walkRoutine). A walk of the weekly routine changes on its day only or
 * every week, and the routine can end from here.
 */
export function WalkModal({
  date,
  today,
  plan,
  repeats = false,
  onClose,
}: {
  date: DayKey
  today: DayKey
  /** The walk being changed; none to schedule one. */
  plan?: WorkoutPlan
  /** It is one of the weekly routine's. */
  repeats?: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const routine = useWalkRoutine() ?? undefined
  const [day, setDay] = useState(plan?.date ?? date)
  const [time, setTime] = useState(plan?.time ?? '')
  const [goal, setGoal] = useState<WalkGoal>(goalOf(plan))
  const [amount, setAmount] = useState(
    plan?.targetKm ? String(plan.targetKm).replace('.', ',') : plan?.targetMin ? String(plan.targetMin) : '',
  )
  const [repeat, setRepeat] = useState(repeats)
  // Until changed, the routine's days (and, for a new one, this day's weekday).
  const [picked, setPicked] = useState<number[]>()
  const weekday = weekdayOf(day)
  const days =
    picked ?? (repeats ? (routine?.days ?? [weekday]) : [...new Set([...(routine?.days ?? []), weekday])].sort((a, b) => a - b))

  const target = walkTarget(goal, amount)
  const fields: WalkFields | null = target && { ...(time && { time }), ...target }
  const when = (key: DayKey) => (key === today ? 'hoje' : formatDay(key, "EEEE, d/MM"))

  // A new walk or one scheduled on its own: on its day, or every week on the days picked.
  const submit = async () => {
    if (!fields || !day) return
    tapFeedback()
    if (repeat) {
      await setWalkRoutine(nextRoutine(routine, days, fields, today))
      // The day itself gets a walk of its own when it isn't one of the weekly days.
      const covered = days.includes(weekday)
      if (plan) await (covered ? dropWalk(plan) : changeWalk(plan, { ...fields, date: day }))
      else if (!covered) await scheduleWalk(day, fields)
      toast({ message: weeklyText(days, fields) })
    } else {
      if (plan) await changeWalk(plan, { ...fields, date: day })
      else await scheduleWalk(day, fields)
      toast({ message: `Caminhada programada para ${when(day)}.` })
    }
    onClose()
  }

  // A walk of the routine: this day only, or the routine itself.
  const saveDay = async () => {
    if (!fields || !plan) return
    tapFeedback()
    await changeWalk(plan, fields)
    toast({ message: `Caminhada de ${when(plan.date)} alterada.` })
    onClose()
  }
  const saveWeek = async () => {
    if (!fields || !plan || days.length === 0) return
    tapFeedback()
    await setWalkRoutine(nextRoutine(routine, days, fields, today))
    await refreshRoutineDay(plan.id, fields)
    toast({ message: weeklyText(days, fields) })
    onClose()
  }
  const stop = async () => {
    const previous = routine
    tapFeedback()
    await setWalkRoutine(undefined)
    toast({ message: 'Caminhada semanal encerrada.', action: { label: 'Desfazer', onClick: () => void setWalkRoutine(previous) } })
    onClose()
  }

  const timeField = (
    <Field label="Horário" hint="Opcional">
      <TextInput type="time" value={time} onChange={(event) => setTime(event.target.value)} />
    </Field>
  )

  return (
    <Modal open title={plan ? 'Alterar caminhada' : 'Programar caminhada'} onClose={onClose}>
      <div className="space-y-4">
        {repeats && plan ? (
          <>
            <p className="text-sm text-ink-2 first-letter:uppercase">{formatDay(plan.date)} · toda semana</p>
            {timeField}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia">
              <TextInput type="date" value={day} min={plan ? undefined : today} onChange={(event) => setDay(event.target.value)} />
            </Field>
            {timeField}
          </div>
        )}

        <Field label="Meta" group hint={goal === 'none' ? 'Opcional' : undefined}>
          <Segmented label="Meta da caminhada" value={goal} onChange={setGoal} options={GOALS} />
          {goal !== 'none' && (
            <div className="mt-2 flex items-center gap-2">
              <DecimalInput
                aria-label={goal === 'min' ? 'Minutos de caminhada' : 'Quilômetros de caminhada'}
                placeholder={goal === 'min' ? '40' : '3'}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-28"
              />
              <span className="text-sm text-ink-2">{goal === 'min' ? 'minutos' : 'km'}</span>
            </div>
          )}
        </Field>

        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          {repeats ? (
            <p className="text-sm font-medium">Dias da semana</p>
          ) : (
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Repetir toda semana</span>
                <span className="block text-xs text-muted">
                  {routine
                    ? `Já há caminhada ${weekdaysText(routine.days)}${routine.time ? ` às ${routine.time}` : ''}: os dias e a meta daqui passam a valer para ela.`
                    : 'A partir de hoje, nos dias marcados.'}
                </span>
              </span>
              <Switch checked={repeat} label="Repetir toda semana" onChange={setRepeat} />
            </div>
          )}
          {repeat && (
            <>
              <WeekdayPicker value={days} onChange={setPicked} />
              {days.length === 0 && <p className="mt-1 text-xs text-critical">Escolha pelo menos um dia.</p>}
              {repeats && <p className="mt-1 text-xs text-muted">Os dias valem para “Toda semana”.</p>}
            </>
          )}
        </div>

        {repeats && plan ? (
          <>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={!fields} onClick={() => void saveDay()}>
                Só neste dia
              </Button>
              <Button variant="primary" className="flex-1" disabled={!fields || days.length === 0} onClick={() => void saveWeek()}>
                Toda semana
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => void stop()}>
              <CalendarOff size={16} /> Parar de repetir
            </Button>
          </>
        ) : (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={!fields || !day || (!plan && day < today) || (repeat && days.length === 0)}
              onClick={() => void submit()}
            >
              {plan ? 'Salvar' : 'Programar'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div role="group" aria-label="Dias da semana" className="mt-2 flex justify-between gap-1">
      {WEEKDAYS.map((letter, day) => {
        const on = value.includes(day)
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            aria-label={WEEKDAY_NAMES[day]}
            onClick={() => onChange(on ? value.filter((other) => other !== day) : [...value, day].sort((a, b) => a - b))}
            className={cx(
              'size-9 rounded-full text-sm font-semibold transition',
              on ? 'bg-accent text-white' : 'bg-surface text-ink-2 hover:text-ink',
            )}
          >
            {letter}
          </button>
        )
      })}
    </div>
  )
}
