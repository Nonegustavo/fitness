import { Archive, ArchiveRestore, Dumbbell, History, Play, Plus, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { SortableList } from '../../components/Sortable'
import { Button, Card, Columns, cx, Empty, IconButton, Page, SkeletonCard, Stack, Stat } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { patch, saveOrder } from '../../db/repo'
import { db } from '../../db/schema'
import type { Exercise, MuscleGroup, WorkoutSession } from '../../db/types'
import { relativeDay, shiftDay, weekStart } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
import { useActivities } from '../activities/activities'
import { ActivityRow, FitHowTo, ImportFitButton } from '../activities/components'
import { UpcomingCard } from '../calendar/cards'
import { useTodayTemplate } from '../calendar/plans'
import { MUSCLES } from './catalog'
import { MuscleMap } from './MuscleMap'
import { PastWorkoutModal } from './PastWorkoutModal'
import { Elapsed, useStartWorkout } from './components'
import { needsDeload, recentEffort, setsByMuscle, stalledExercises, summarize } from './stats'
import { DISCOMFORT_AREAS } from './discomfort'
import { findActive, useExerciseMap, useSessions, useTemplates } from './training'

const HISTORY_LIMIT = 10

export default function TrainingPage() {
  const navigate = useNavigate()
  const today = useToday()
  const templates = useTemplates()
  const sessions = useSessions()
  const exercises = useExerciseMap()
  const start = useStartWorkout()
  const todays = useTodayTemplate(today)
  const [showAll, setShowAll] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [loggingPast, setLoggingPast] = useState(false)
  if (!templates || !sessions) {
    return (
      <Page title="Treinos" icon={Dumbbell} tone="training" wide>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={6} />
      </Page>
    )
  }

  const rotation = templates.filter((template) => !template.archived)
  const archived = templates.filter((template) => template.archived)
  const active = findActive(sessions)
  const finished = sessions.filter((session) => session.endedAt)
  const next = todays?.template
  const thisWeek = weekStart(today)
  const week = finished.filter((session) => session.date >= thisWeek)
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
      wide
      actions={
        <Button size="sm" variant="primary" onClick={() => navigate('/treinos/ficha/nova')}>
          <Plus size={16} /> Ficha
        </Button>
      }
    >
      <Columns>
        <Stack>
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
                              {todays?.plan ? 'hoje' : 'próximo'}
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

          <Card title="Esta semana">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Treinos" value={week.length} />
              <Stat label="Séries" value={weekTotals.sets} />
              <Stat label="Volume" value={`${formatNumber(weekTotals.volumeKg, 0)} kg`} />
            </div>
            <MuscleMap counts={setsByMuscle(finished, exercises, thisWeek, today)} />
          </Card>
        </Stack>

        <Stack>
          <UpcomingCard today={today} />

          <ProgressCard sessions={finished} exercises={exercises} today={today} />

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
            {/* A workout done without the app: quiet, under the history, so it never competes with starting one. */}
            <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => setLoggingPast(true)}>
              <History size={16} /> Registrar treino passado
            </Button>
          </Card>
        </Stack>
      </Columns>

      {loggingPast && (
        <PastWorkoutModal
          templates={templates}
          sessions={sessions}
          exercises={exercises}
          initialTemplateId={next?.id ?? rotation[0]?.id}
          onClose={() => setLoggingPast(false)}
        />
      )}
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
          <span className="flex gap-3">
            <Link to="/corrida" className="text-sm font-medium text-accent-ink">
              Corrida
            </Link>
            <Link to="/treinos/atividades" className="text-sm font-medium text-accent-ink">
              Ver todas
            </Link>
          </span>
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

/**
 * Exercises that stopped progressing, the advice of a lighter week when it's time, and the
 * discomforts noted in the last two weeks.
 */
function ProgressCard({
  sessions,
  exercises,
  today,
}: {
  sessions: WorkoutSession[]
  exercises: Map<string, Exercise>
  today: string
}) {
  const stalls = stalledExercises(sessions, today)
  const effort = recentEffort(sessions)
  const deload = needsDeload(stalls, effort)
  const since = shiftDay(today, -14)
  const pains = new Map<string, number>()
  for (const session of sessions) {
    if (session.date < since) continue
    for (const area of session.discomfort ?? []) pains.set(area, (pains.get(area) ?? 0) + 1)
  }
  if (stalls.length === 0 && pains.size === 0 && effort === undefined) return null
  return (
    <Card title="Progresso" icon={TrendingUp} tone="training">
      {deload && (
        <div className="mb-3 rounded-xl bg-(--tone-training)/12 p-3 text-sm">
          <p className="font-medium">Hora de uma semana mais leve (deload)</p>
          <p className="mt-1 text-xs text-ink-2">
            {stalls.length} exercícios sem evoluir
            {effort !== undefined && effort >= 9 ? ' e treinos perto do limite' : ''}. Uma semana com as mesmas fichas,
            metade das séries e uns 10% menos de carga costuma destravar a progressão.
          </p>
        </div>
      )}
      {stalls.length > 0 ? (
        <>
          <p className="mb-1 text-xs text-ink-2">Sem bater o melhor 1RM estimado</p>
          <ul className="divide-y divide-line">
            {stalls.map((stall) => (
              <li key={stall.exerciseId}>
                <Link to={`/treinos/exercicios/${stall.exerciseId}`} className="flex items-center gap-3 py-1.5 text-sm hover:text-accent-ink">
                  <span className="min-w-0 flex-1 truncate">{exercises.get(stall.exerciseId)?.name ?? 'Exercício'}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {stall.sessions} treinos · melhor {formatNumber(stall.bestKg, 0)} kg
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-ink-2">Todos os exercícios recentes estão evoluindo.</p>
      )}
      {(effort !== undefined || pains.size > 0) && (
        <p className="mt-3 text-xs text-ink-2">
          {effort !== undefined && `Esforço médio dos últimos treinos: ${formatNumber(effort)}/10. `}
          {pains.size > 0 &&
            `Desconforto em 14 dias: ${[...pains]
              .sort((a, b) => b[1] - a[1])
              .map(([area, n]) => `${DISCOMFORT_AREAS[area] ?? area}${n > 1 ? ` (${n}×)` : ''}`)
              .join(', ')}.`}
        </p>
      )}
    </Card>
  )
}
