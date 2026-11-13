import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { PeriodBars } from '../../components/PeriodBars'
import { PeriodControl, usePeriod } from '../../components/PeriodControl'
import { PeriodLine } from '../../components/TimeCharts'
import { Card, Empty, IconButton, Page, Stat } from '../../components/ui'
import { db } from '../../db/schema'
import type { ExerciseType, PerformedSet, SessionExercise, WorkoutSession } from '../../db/types'
import { formatDay, type DayKey } from '../../lib/dates'
import { formatClock, formatFixed, formatNumber } from '../../lib/format'
import type { DayValue } from '../../lib/stats'
import { EQUIPMENT, formatSetWithRir, MUSCLES } from './catalog'
import { ExerciseForm } from './ExerciseForm'
import { HowToCard } from './HowTo'
import { bestE1rm, workingSets } from './stats'
import { useSessions } from './training'

const METRIC: Record<ExerciseType, { label: string; unit: string; digits: number; format: (value: number) => string }> = {
  weight_reps: { label: '1RM estimado', unit: 'kg', digits: 1, format: (v) => `${formatFixed(v)} kg` },
  reps: { label: 'Repetições na melhor série', unit: 'reps', digits: 0, format: (v) => String(v) },
  time: { label: 'Maior tempo', unit: 's', digits: 0, format: (v) => formatClock(v) },
}

/** What a workout's sets of the exercise add up to: kg × reps, reps or time. */
const VOLUME: Record<
  ExerciseType,
  { of: (set: PerformedSet) => number; format: (value: number) => string; axis: (value: number) => string; step: number }
> = {
  weight_reps: {
    of: (set) => (set.weightKg ?? 0) * (set.reps ?? 0),
    format: (v) => `${formatNumber(v, 0)} kg`,
    axis: (v) => (v >= 1000 ? `${formatNumber(v / 1000, 1)} mil` : formatNumber(v, 0)),
    step: 100,
  },
  reps: { of: (set) => set.reps ?? 0, format: (v) => `${formatNumber(v, 0)} reps`, axis: (v) => formatNumber(v, 0), step: 10 },
  time: { of: (set) => set.durationSec ?? 0, format: formatClock, axis: formatClock, step: 60 },
}

const WORKOUTS = ['treino', 'treinos'] as const

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
  const volumes = useMemo(
    () =>
      entries.map(({ session, exercise: e }) => ({
        date: session.date,
        value: workingSets(e).reduce((total, set) => total + VOLUME[type].of(set), 0),
      })),
    [entries, type],
  )
  const period = usePeriod('exercicio', { grain: 'week', earliest: points[0]?.date })

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
      {exercise.deleted === 1 && <p className="text-sm text-muted">Este exercício foi apagado da biblioteca.</p>}
      {exercise.notes && (
        <Card>
          <p className="text-sm text-ink-2">{exercise.notes}</p>
        </Card>
      )}
      <HowToCard exercise={exercise} />

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
            <Card title="Evolução">
              <PeriodControl period={period} />
              <p className="mb-1 text-sm font-medium">{metric.label}</p>
              <PeriodLine
                periods={period.window}
                values={points}
                how="max"
                unit={metric.unit}
                digits={metric.digits}
                // Times read as 1:30; kilos and reps as plain numbers on the axis, with the unit in the tooltip.
                format={type === 'time' ? metric.format : undefined}
                label={metric.label}
                noun={WORKOUTS}
              />
              {volumes.some((volume) => volume.value > 0) && (
                <>
                  <p className="mt-5 mb-1 text-sm font-medium">Volume</p>
                  <PeriodBars
                    periods={period.window}
                    values={volumes}
                    how="sum"
                    format={VOLUME[type].format}
                    axisFormat={VOLUME[type].axis}
                    noun={WORKOUTS}
                    label={`Volume de ${exercise.name}`}
                    step={VOLUME[type].step}
                  />
                </>
              )}
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
                        .map((set) => formatSetWithRir(set, type))
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
