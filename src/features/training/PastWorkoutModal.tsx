import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Modal } from '../../components/Modal'
import { Button, Field, Select, TextInput } from '../../components/ui'
import { useToday } from '../../db/hooks'
import type { Exercise, WorkoutSession, WorkoutTemplate } from '../../db/types'
import { dayTime, formatTime } from '../../lib/dates'
import { logPastWorkout, usualMinutes } from './training'

/** The "Treino livre" choice of the template list. */
const FREE = ''

/**
 * A workout done without the app (forgotten, or a dead phone): which template, when and for how long.
 * Saving logs it finished, its sets filled with what was most likely done, and opens it to correct.
 */
export function PastWorkoutModal({
  templates,
  sessions,
  exercises,
  initialTemplateId,
  onClose,
}: {
  templates: WorkoutTemplate[]
  sessions: WorkoutSession[]
  exercises: Map<string, Exercise>
  initialTemplateId?: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const today = useToday()
  const [templateId, setTemplateId] = useState(initialTemplateId ?? FREE)
  const [date, setDate] = useState(today)
  const [minutesText, setMinutesText] = useState(() => String(usualMinutes(sessions, initialTemplateId)))
  // A length typed by hand stays when another template is picked.
  const [minutesTyped, setMinutesTyped] = useState(false)
  // Ended about now, on the quarter hour.
  const [time, setTime] = useState(() => {
    const quarter = 15 * 60_000
    return formatTime(Math.floor((Date.now() - usualMinutes(sessions, initialTemplateId) * 60_000) / quarter) * quarter)
  })
  const [saving, setSaving] = useState(false)

  const rotation = templates.filter((template) => !template.archived)
  const archived = templates.filter((template) => template.archived)
  const template = templates.find((t) => t.id === templateId)
  const minutes = /^\d+$/.test(minutesText.trim()) ? Number(minutesText.trim()) : undefined
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today
  const startedAt = validDay && /^\d{2}:\d{2}$/.test(time) ? dayTime(date, time) : undefined
  const future = startedAt !== undefined && startedAt > Date.now()
  const valid = startedAt !== undefined && !future && minutes !== undefined && minutes > 0 && minutes <= 600

  function pick(id: string) {
    setTemplateId(id)
    if (!minutesTyped) setMinutesText(String(usualMinutes(sessions, id === FREE ? undefined : id)))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    try {
      const id = await logPastWorkout(
        template,
        startedAt,
        minutes,
        sessions,
        (exerciseId) => exercises.get(exerciseId)?.type ?? 'weight_reps',
      )
      onClose()
      navigate(`/treinos/sessao/${id}`)
    } finally {
      // A save that failed leaves the sheet open to try again (the app says it couldn't save).
      setSaving(false)
    }
  }

  return (
    <Modal open title="Registrar treino passado" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Ficha">
          <Select value={templateId} onChange={(e) => pick(e.target.value)}>
            {rotation.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            {archived.length > 0 && (
              <optgroup label="Arquivadas">
                {archived.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={FREE}>Treino livre</option>
          </Select>
        </Field>
        <Field label="Dia" hint={/^\d{4}-\d{2}-\d{2}$/.test(date) && !validDay ? <span className="text-critical">Só dias que já passaram</span> : undefined}>
          <TextInput type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início" hint={future ? <span className="text-critical">Ainda não chegou</span> : undefined}>
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Duração (min)">
            <TextInput
              inputMode="numeric"
              value={minutesText}
              onChange={(e) => {
                setMinutesText(e.target.value)
                setMinutesTyped(true)
              }}
            />
          </Field>
        </div>
        <p className="text-xs text-muted">
          {template
            ? 'As séries vêm preenchidas com as da última vez (ou com as da ficha) e marcadas como feitas: depois é só corrigir o que foi diferente.'
            : 'Depois de salvar, adicione os exercícios que você fez.'}
        </p>
        <Button type="submit" variant="primary" className="w-full" disabled={!valid || saving}>
          Registrar
        </Button>
      </form>
    </Modal>
  )
}
