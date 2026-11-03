import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { LineOverTime } from '../../components/TimeCharts'
import { Card, Empty, IconButton, Page, Stat } from '../../components/ui'
import { db } from '../../db/schema'
import type { ExerciseType, SessionExercise, WorkoutSession } from '../../db/types'
import { formatDay, type DayKey } from '../../lib/dates'
import { formatClock, formatFixed, formatNumber } from '../../lib/format'
import type { DayValue } from '../../lib/stats'
import { EQUIPMENT, formatSet, MUSCLES } from './catalog'
import { ExerciseForm } from './ExerciseForm'
import { bestE1rm, workingSets } from './stats'
import { useSessions } from './training'

const METRIC: Record<ExerciseType, { label: string; unit: string; digits: number; format: (value: number) => string }> = {
  weight_reps: { label: '1RM estimado', unit: 'kg', digits: 1, format: (v) => `${formatFixed(v)} kg` },
  reps: { label: 'Repetições na melhor série', unit: 'reps', digits: 0, format: (v) => String(v) },
  time: { label: 'Maior tempo', unit: 's', digits: 0, format: (v) => formatClock(v) },
}

interface Entry {
  session: WorkoutSession
  exercise: SessionExercise
}

/** The best value of each training day: estimated 1RM, most reps or longest time. */
function bestPerDay(entries: Entry[], type: ExerciseType): DayValue[] {
  const best = new Map<DayKey, number>()
  for (const { session, exercise } of entries) {
    const sets = workingSets(exercise)
    const value =
      type === 'weight_reps'
        ? (bestE1rm(sets) ?? 0)
        : Math.max(...sets.map((set) => (type === 'reps' ? (set.reps ?? 0) : (set.durationSec ?? 0))))
    if (value > 0) best.set(session.date, Math.max(best.get(session.date) ?? 0, value))
  }
  return [...best]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export default function ExerciseDetail() {
  const { id = '' } = useParams()
  const exercise = useLiveQuery(async () => (await db.exercises.get(id)) ?? null, [id])
  const sessions = useSessions()
  const [editing, setEditing] = useState(false)
  const type = exercise?.type ?? 'weight_reps'

  const entries = useMemo(
    () =>
      (sessions ?? [])
        .filter((session) => session.endedAt)
        .flatMap((session) =>
          session.exercises
            .filter((e) => e.exerciseId === id && workingSets(e).length > 0)
            .map((e) => ({ session, exercise: e })),
        ),
    [sessions, id],
  )
  const points = useMemo(() => bestPerDay(entries, type), [entries, type])

  if (exercise === undefined) return null
  const back = { to: '/treinos/exercicios', label: 'Exercícios' }
  if (exercise === null) {
    return (
      <Page title="Exercício" back={back}>
        <Card>
          <Empty>Exercício não encontrado.</Empty>
        </Card>
      </Page>
    )
  }

  const metric = METRIC[type]
  const best = points.length > 0 ? Math.max(...points.map((p) => p.value)) : undefined
  const heaviest =
    type === 'weight_reps'
      ? Math.max(0, ...entries.flatMap(({ exercise: e }) => workingSets(e).map((set) => set.weightKg ?? 0)))
      : 0

  return (
    <Page
      title={exercise.name}
      subtitle={`${MUSCLES[exercise.muscle]} · ${EQUIPMENT[exercise.equipment]}`}
      back={back}
      actions={
        <IconButton label="Editar exercício" onClick={() => setEditing(true)}>
          <Pencil size={18} />
        </IconButton>
      }
    >
      {exercise.deleted === 1 && <p className="text-sm text-muted">Este exercício foi excluído da biblioteca.</p>}
      {exercise.notes && (
        <Card>
          <p className="text-sm text-ink-2">{exercise.notes}</p>
        </Card>
      )}

      {entries.length === 0 ? (
        <Card>
          <Empty>Ainda não há treinos com este exercício.</Empty>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-3 gap-3">
              <Stat label={metric.label} value={best === undefined ? '—' : metric.format(best)} />
              {heaviest > 0 && <Stat label="Maior carga" value={`${formatNumber(heaviest, 2)} kg`} />}
              <Stat label="Treinos" value={entries.length} />
            </div>
          </Card>

          {points.length > 1 && (
            <Card title={`${metric.label} por dia`}>
              <LineOverTime points={points} unit={metric.unit} digits={metric.digits} label={metric.label} />
            </Card>
          )}

          <Card title="Histórico">
            <ul className="divide-y divide-line">
              {entries.map(({ session, exercise: e }) => (
                <li key={`${session.id}:${e.key}`}>
                  <Link to={`/treinos/sessao/${session.id}`} className="block py-2 hover:text-accent-ink">
                    <p className="text-sm font-medium">
                      {formatDay(session.date, "d 'de' MMM 'de' yyyy")}{' '}
                      <span className="font-normal text-ink-2">· {session.name}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {workingSets(e)
                        .map((set) => formatSet(set, type))
                        .join(' · ')}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {editing && <ExerciseForm exercise={exercise} onClose={() => setEditing(false)} />}
    </Page>
  )
}
