import { startOfWeek } from 'date-fns'
import { Pencil, Play, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, Card, Empty, IconButton, Page, Stat } from '../../components/ui'
import { useToday } from '../../db/hooks'
import type { MuscleGroup, WorkoutSession } from '../../db/types'
import { dayKey, parseDay, relativeDay } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
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
  if (!templates || !sessions) return null

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
          <ul className="divide-y divide-line">
            {templates.map((template) => {
              const isNext = !active && next?.id === template.id
              const sets = template.exercises.reduce((n, e) => n + e.sets.filter((s) => s.kind === 'normal').length, 0)
              const muscles = [
                ...new Set(template.exercises.map((e) => exercises.get(e.exerciseId)?.muscle).filter(Boolean)),
              ] as MuscleGroup[]
              return (
                <li key={template.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
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
                  </div>
                  <IconButton label="Editar ficha" onClick={() => navigate(`/treinos/ficha/${template.id}`)}>
                    <Pencil size={16} />
                  </IconButton>
                  <Button size="sm" variant={isNext ? 'primary' : 'secondary'} onClick={() => void start(template)}>
                    <Play size={14} /> Iniciar
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="Esta semana">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Treinos" value={week.length} />
          <Stat label="Séries" value={weekTotals.sets} />
          <Stat label="Volume" value={`${formatNumber(weekTotals.volumeKg, 0)} kg`} />
        </div>
        <MuscleBars counts={setsByMuscle(finished, exercises, weekStart, today)} />
      </Card>

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
