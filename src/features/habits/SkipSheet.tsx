import { Undo2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, Field, TextInput } from '../../components/ui'
import type { Habit, HabitLog } from '../../db/types'
import { relativeDay, type DayKey } from '../../lib/dates'
import { isSkipped, skipHabitDay, unskipHabitDay, weeklyTimes } from './habits'

/**
 * The long press on a habit to do: "Hoje não vou fazer", with an optional reason, or the undo of
 * it. `onChange` runs before anything is saved (the list holds its order for a moment).
 */
export function SkipSheet({
  habit,
  date,
  today,
  log,
  onChange,
  onClose,
}: {
  habit: Habit
  date: DayKey
  today: DayKey
  log: HabitLog | undefined
  onChange: () => void
  onClose: () => void
}) {
  const skipped = isSkipped(log)
  const [note, setNote] = useState(log?.note ?? '')
  // "hoje", "ontem" or "em 3 de nov."
  const day = relativeDay(date, today)
  const when = day === 'hoje' || day === 'ontem' ? day : `em ${day}`
  // A weekly habit loses the day, not any of its target.
  const times = weeklyTimes(habit)
  const effect =
    times === undefined
      ? 'o dia não conta para a sequência nem para a porcentagem'
      : `o dia sai da semana, mas a meta continua ${times} ${times === 1 ? 'vez' : 'vezes'}`

  function submit(event: FormEvent) {
    event.preventDefault()
    onChange()
    onClose()
    void skipHabitDay(habit, date, note, log)
  }

  function undo() {
    onChange()
    onClose()
    if (log) void unskipHabitDay(log)
  }

  return (
    <Modal open title={habit.name} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-2">
          {skipped
            ? `Pulado ${when}: ${effect}.`
            : `Para os dias em que não dá (chuva, viagem…): ${effect}${times === undefined ? ', sem quebrar nada' : ''}${habit.reminder && date >= today ? ', e o lembrete não toca' : ''}.`}
        </p>
        <Field label="Motivo" hint="Opcional">
          <TextInput value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: chuva" maxLength={120} />
        </Field>
        {skipped ? (
          <div className="flex gap-2">
            <Button onClick={undo}>
              <Undo2 size={16} /> Desfazer
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={note.trim() === (log?.note ?? '')}>
              Salvar motivo
            </Button>
          </div>
        ) : (
          <Button type="submit" variant="primary" className="w-full">
            {date === today ? 'Hoje não vou fazer' : 'Pular este dia'}
          </Button>
        )}
      </form>
    </Modal>
  )
}
