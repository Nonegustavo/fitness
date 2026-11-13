import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { useRemoveWithUndo } from '../../components/SwipeToDelete'
import { Button, clockHint, Field, Select, TextInput } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { db } from '../../db/schema'
import type { Activity, Race } from '../../db/types'
import { daysBetween, formatDay, formatTime } from '../../lib/dates'
import { formatClock } from '../../lib/format'
import { formatDistance, useActivities } from '../activities/activities'
import { raceRun } from '../calendar/agenda'
import { isRun } from '../running/running'
import { distanceInput, parseClock, parseDistance } from './race'
import { NO_RUN, saveRace } from './races'

const textareaClass =
  'w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent/30'

const runLabel = (run: Activity) =>
  `${formatDay(run.date, 'd/MM')} às ${formatTime(run.startTime)}${run.distanceM ? ` · ${formatDistance(run.distanceM)}` : ''} em ${formatClock(run.timerSec)}`

/**
 * A race time as typed, with a comma, a dot or a space taking the colon's place ("38,25"): Android's
 * numeric keypad has no colon. Whole numbers are minutes ("50" is 50:00).
 */
const readClock = (text: string) => parseClock(text.trim().replace(/\s*[,.]\s*|\s+/g, ':'))

/** A time typed in a field: empty is none (null); undefined when it can't be read. */
const clockField = (text: string) => (text.trim() ? readClock(text) : null)

/**
 * A race's sheet: putting one in the list or changing it (name, day, time, distance, goal). Once its
 * day comes, the run that was it (the longest of the day unless another is picked) and the official
 * time. `initial` fills a new one (a run said to be a race).
 */
export function RaceModal({ race, initial, onClose }: { race: Race | null; initial?: Partial<Race>; onClose: () => void }) {
  const today = useToday()
  const activities = useActivities()
  const removeWithUndo = useRemoveWithUndo()
  const start: Partial<Race> = race ?? initial ?? {}
  const [name, setName] = useState(start.name ?? '')
  const [date, setDate] = useState(start.date ?? today)
  const [time, setTime] = useState(start.time ?? '')
  const [distanceText, setDistanceText] = useState(distanceInput(start))
  const [goalText, setGoalText] = useState(start.goalSec ? formatClock(start.goalSec) : '')
  const [officialText, setOfficialText] = useState(start.officialSec ? formatClock(start.officialSec) : '')
  // Empty: the longest run of its day.
  const [runId, setRunId] = useState(start.activityId ?? '')
  const [notes, setNotes] = useState(start.notes ?? '')

  const distance = parseDistance(distanceText)
  const goal = clockField(goalText)
  const official = clockField(officialText)
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const valid = name.trim() !== '' && day && distance !== undefined && goal !== undefined && official !== undefined
  const past = day && date <= today
  // The runs it could be: the ones of its day and of the days around it.
  const runs = day ? (activities ?? []).filter((run) => isRun(run) && Math.abs(daysBetween(run.date, date)) <= 1) : []
  const longest = day ? raceRun({ date }, activities ?? []) : undefined

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    await saveRace({
      id: race?.id,
      name: name.trim(),
      date,
      ...(time && { time }),
      ...distance,
      ...(goal !== null && { goalSec: goal }),
      ...(past && official !== null && { officialSec: official }),
      ...(runId && { activityId: runId }),
      ...((race?.eventKey ?? initial?.eventKey) && { eventKey: race?.eventKey ?? initial?.eventKey }),
      ...(notes.trim() && { notes: notes.trim() }),
    })
    onClose()
  }

  return (
    <Modal open title={race ? 'Prova' : 'Nova prova'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <TextInput autoFocus={!race} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Rústica de Morungava" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Largada" hint="Opcional">
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Distância (km)" hint={distance === undefined ? 'Ex.: 10, 21,1 ou 6 a 8' : 'Ex.: 10 ou 6 a 8'}>
            <TextInput value={distanceText} onChange={(e) => setDistanceText(e.target.value)} placeholder="10" />
          </Field>
          <Field label="Meta de tempo" hint={clockHint(goalText, readClock) ?? 'Opcional'}>
            <TextInput value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="50:00" inputMode="numeric" />
          </Field>
        </div>
        {past && (
          <>
            <Field label="A corrida" hint="A do relógio que foi a prova: o tempo e o ritmo vêm dela.">
              <Select value={runId} onChange={(e) => setRunId(e.target.value)}>
                <option value="">{longest ? `A mais longa do dia (${runLabel(longest)})` : 'A mais longa do dia (nenhuma ainda)'}</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {runLabel(run)}
                  </option>
                ))}
                <option value={NO_RUN}>Não corri esta prova</option>
              </Select>
            </Field>
            <Field label="Tempo oficial" hint={clockHint(officialText, readClock) ?? 'Opcional: o do chip, quando é outro que o do relógio'}>
              <TextInput value={officialText} onChange={(e) => setOfficialText(e.target.value)} placeholder="38:12" inputMode="numeric" />
            </Field>
          </>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-2">Anotações</span>
          <textarea
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Colocação, categoria, número de peito…"
            className={textareaClass}
          />
        </label>
        <div className="flex gap-2">
          {race && (
            <Button
              variant="danger"
              onClick={() => {
                removeWithUndo(db.races, race.id, `${race.name} saiu das provas`)
                onClose()
              }}
            >
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
