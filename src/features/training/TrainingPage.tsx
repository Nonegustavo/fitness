import { startOfWeek } from 'date-fns'
import { Archive, ArchiveRestore, Dumbbell, Play, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { SortableList } from '../../components/Sortable'
import { Button, Card, cx, Empty, IconButton, Page, Stat } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { patch, saveOrder } from '../../db/repo'
import { db } from '../../db/schema'
import type { MuscleGroup, WorkoutSession } from '../../db/types'
import { dayKey, parseDay, relativeDay } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
import { useActivities } from '../activities/activities'
import { ActivityRow, FitHowTo, ImportFitButton } from '../activities/components'
import { UpcomingWorkoutsCard } from '../garmin/UpcomingWorkouts'
import { MUSCLES } from './catalog'
import { Elapsed, useStartWorkout } from './components'
import { nextTemplate, setsByMuscle, summarize } from './stats'
import { findActive, useExerciseMap, useSessions, useTemplates } from './training'

const HISTORY_LIMIT = 10

export default function TrainingPage() {
  const navigate = useNavigate()
  const today = useToday()
  const templates = useTemplates()
  const sessions = useSessions()
  const exercises = useExerciseMap()
  const start = useStartWorkout()
  const [showAll, setShowAll] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  if (!templates || !sessions) return null

  const rotation = templates.filter((template) => !template.archived)
  const archived = templates.filter((template) => template.archived)
  const active = findActive(sessions)
  const finished = sessions.filter((session) => session.endedAt)
  const next = nextTemplate(templates, finished)
  const weekStart = dayKey(startOfWeek(parseDay(today), { weekStartsOn: 1 }))
  const week = finished.filter((session) => session.date >= weekStart)
  const weekTotals = week.map(summarize).reduce(
    (total, s) => ({ sets: total.sets + s.sets, volumeKg: total.volumeKg + s.volumeKg }),
    { sets: 0, volumeKg: 0 },
  )
  const listed = showAll ? finished : finished.slice(0, HISTORY_LIMIT)

  return (
    <Page
      title="Treinos"
      icon={Dumbbell}
      tone="training"
      actions={
        <Button size="sm" variant="primary" onClick={() => navigate('/treinos/ficha/nova')}>
          <Plus size={16} /> Ficha
        </Button>
      }
    >
      {active && (
        <Card className="border-accent">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-2">Em andamento</p>
              <p className="truncate font-medium">
                {active.name} · <Elapsed since={active.startedAt} />
              </p>
            </div>
            <Button variant="primary" onClick={() => navigate(`/treinos/sessao/${active.id}`)}>
              Continuar
            </Button>
          </div>
        </Card>
      )}

      <Card
        title="Fichas"
        action={
          <Button size="sm" variant="ghost" onClick={() => void start()}>
            Treino livre
          </Button>
        }
      >
        {templates.length === 0 ? (
          <Empty>
            Nenhuma ficha ainda.{' '}
            <Link to="/treinos/ficha/nova" className="font-medium text-accent-ink underline underline-offset-2">
              Montar a primeira
            </Link>
          </Empty>
        ) : (
          // The order is also the rotation: A, then B, then C.
          <SortableList
            className="divide-y divide-line"
            itemClassName="flex items-center gap-2 bg-surface py-2"
            items={rotation}
            getId={(template) => template.id}
            onReorder={(list) => void saveOrder(db.workoutTemplates, [...list, ...archived])}
          >
            {(template, handle) => {
              const isNext = !active && next?.id === template.id
              const sets = template.exercises.reduce((n, e) => n + e.sets.filter((s) => s.kind === 'normal').length, 0)
              const muscles = [
                ...new Set(template.exercises.map((e) => exercises.get(e.exerciseId)?.muscle).filter(Boolean)),
              ] as MuscleGroup[]
              return (
                <>
                  <span className="-ml-2 flex">{handle}</span>
                  <Link
                    to={`/treinos/ficha/${template.id}`}
                    aria-label={`Editar ${template.name}`}
                    className="min-w-0 flex-1 hover:text-accent-ink"
                  >
                    <p className="truncate font-medium">
                      {template.name}
                      {isNext && (
                        <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 align-middle text-xs font-normal text-ink-2">
                          próximo
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {template.exercises.length} exercícios · {sets} séries
                      {muscles.length > 0 && ` · ${muscles.map((m) => MUSCLES[m]).join(', ')}`}
                    </p>
                  </Link>
                  <Button size="sm" variant={isNext ? 'primary' : 'secondary'} onClick={() => void start(template)}>
                    <Play size={14} /> Iniciar
                  </Button>
                </>
              )
            }}
          </SortableList>
        )}
        {archived.length > 0 && (
          <div className={cx(rotation.length > 0 && 'mt-1 border-t border-line pt-1')}>
            <Button size="sm" variant="ghost" className="w-full" onClick={() => setShowArchived(!showArchived)}>
              <Archive size={16} />
              {showArchived ? 'Ocultar' : 'Mostrar'} {archived.length === 1 ? '1 arquivada' : `${archived.length} arquivadas`}
            </Button>
            {showArchived && (
              <ul className="divide-y divide-line">
                {archived.map((template) => (
                  <li key={template.id} className="flex items-center gap-2 py-1.5">
                    <Link
                      to={`/treinos/ficha/${template.id}`}
                      aria-label={`Editar ${template.name}`}
                      className="min-w-0 flex-1 hover:text-accent-ink"
                    >
                      <p className="truncate text-sm font-medium text-ink-2">{template.name}</p>
                      <p className="truncate text-xs text-muted">{template.exercises.length} exercícios</p>
                    </Link>
                    <IconButton
                      label={`Voltar ${template.name} para o rodízio`}
                      onClick={() => void patch(db.workoutTemplates, template.id, { archived: 0 })}
                    >
                      <ArchiveRestore size={16} />
                    </IconButton>
                    <IconButton label={`Iniciar ${template.name}`} onClick={() => void start(template)}>
                      <Play size={16} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <UpcomingWorkoutsCard today={today} />

      <Card title="Esta semana">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Treinos" value={week.length} />
          <Stat label="Séries" value={weekTotals.sets} />
          <Stat label="Volume" value={`${formatNumber(weekTotals.volumeKg, 0)} kg`} />
        </div>
        <MuscleBars counts={setsByMuscle(finished, exercises, weekStart, today)} />
      </Card>

      <ActivitiesCard today={today} />

      <Card
        title="Histórico"
        action={
          <Link to="/treinos/exercicios" className="text-sm font-medium text-accent-ink">
            Exercícios
          </Link>
        }
      >
        {finished.length === 0 ? (
          <Empty>Os treinos finalizados aparecem aqui.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {listed.map((session) => (
              <HistoryRow key={session.id} session={session} today={today} />
            ))}
          </ul>
        )}
        {!showAll && finished.length > HISTORY_LIMIT && (
          <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setShowAll(true)}>
            Mostrar todos ({finished.length})
          </Button>
        )}
      </Card>
    </Page>
  )
}

const RECENT_ACTIVITIES = 5

/** The latest Garmin activities, with the import button. */
function ActivitiesCard({ today }: { today: string }) {
  const activities = useActivities()
  if (!activities) return null
  return (
    <Card
      title="Atividades do relógio"
      action={
        activities.length > 0 ? (
          <Link to="/treinos/atividades" className="text-sm font-medium text-accent-ink">
            Ver todas
          </Link>
        ) : undefined
      }
    >
      {activities.length === 0 ? (
        <FitHowTo />
      ) : (
        <ul className="divide-y divide-line">
          {activities.slice(0, RECENT_ACTIVITIES).map((activity) => (
            <ActivityRow key={activity.id} activity={activity} today={today} />
          ))}
        </ul>
      )}
      <div className="mt-3">
        <ImportFitButton />
      </div>
    </Card>
  )
}

function HistoryRow({ session, today }: { session: WorkoutSession; today: string }) {
  const summary = summarize(session)
  return (
    <li>
      <Link to={`/treinos/sessao/${session.id}`} className="flex items-center gap-3 py-2 hover:text-accent-ink">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{session.name}</p>
          <p className="text-xs text-muted first-letter:uppercase">
            {relativeDay(session.date, today)} · {formatDuration(summary.durationMs ?? 0)}
          </p>
        </div>
        <span className="text-sm text-ink-2 tabular-nums">{summary.sets} séries</span>
      </Link>
    </li>
  )
}

/** Working sets per muscle this week, as a bar list: one series, value at the bar's tip. */
function MuscleBars({ counts }: { counts: Map<MuscleGroup, number> }) {
  const rows = [...counts].sort((a, b) => b[1] - a[1])
  if (rows.length === 0) return <p className="mt-3 text-sm text-muted">Nenhuma série nesta semana ainda.</p>
  const max = Math.max(...rows.map(([, sets]) => sets))
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-ink-2">Séries por grupo muscular</p>
      <ul className="space-y-1.5">
        {rows.map(([muscle, sets]) => (
          <li key={muscle} className="grid grid-cols-[8.5rem_1fr] items-center gap-2 text-sm">
            <span className="truncate text-ink-2">{MUSCLES[muscle]}</span>
            <span className="flex items-center gap-2">
              <span
                className="block h-3 rounded-r-[4px] bg-series-1"
                style={{ width: `calc((100% - 2rem) * ${sets / max})` }}
              />
              <span className="tabular-nums">{sets}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
