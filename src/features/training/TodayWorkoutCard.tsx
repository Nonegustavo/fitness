import { CircleCheck, Dumbbell, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, Card, SkeletonCard } from '../../components/ui'
import type { DayKey } from '../../lib/dates'
import { formatDuration } from '../../lib/format'
import { Elapsed, useStartWorkout } from './components'
import { nextTemplate, summarize } from './stats'
import { findActive, useSessions, useTemplates } from './training'

/** The workout in progress, today's finished one, or the next template in the rotation. */
export function TodayWorkoutCard({ today }: { today: DayKey }) {
  const navigate = useNavigate()
  const templates = useTemplates()
  const sessions = useSessions()
  const start = useStartWorkout()
  if (!templates || !sessions) return <SkeletonCard lines={2} />

  const active = findActive(sessions)
  const finished = sessions.filter((session) => session.endedAt)
  const doneToday = finished.find((session) => session.date === today)
  const next = nextTemplate(templates, finished)

  let body
  if (active) {
    body = (
      <Row label="Em andamento" title={active.name} detail={<Elapsed since={active.startedAt} />}>
        <Button variant="primary" onClick={() => navigate(`/treinos/sessao/${active.id}`)}>
          Continuar
        </Button>
      </Row>
    )
  } else if (doneToday) {
    const summary = summarize(doneToday)
    body = (
      <Row
        label={
          <span className="flex items-center gap-1 text-good">
            <CircleCheck size={14} /> Feito hoje
          </span>
        }
        title={doneToday.name}
        detail={`${formatDuration(summary.durationMs ?? 0)} · ${summary.sets} séries`}
      >
        <Button onClick={() => navigate(`/treinos/sessao/${doneToday.id}`)}>Ver</Button>
      </Row>
    )
  } else if (next) {
    body = (
      <Row label="Próximo da sequência" title={next.name} detail={`${next.exercises.length} exercícios`}>
        <Button variant="primary" onClick={() => void start(next)}>
          <Play size={16} /> Iniciar
        </Button>
      </Row>
    )
  } else {
    body = (
      <p className="text-sm text-muted">
        Nenhuma ficha ainda.{' '}
        <Link to="/treinos/ficha/nova" className="font-medium text-accent-ink underline underline-offset-2">
          Montar a primeira
        </Link>
      </p>
    )
  }

  return (
    <Card
      icon={Dumbbell}
      tone="training"
      title="Treino"
      action={
        <Link to="/treinos" className="text-sm font-medium text-accent-ink">
          Fichas
        </Link>
      }
    >
      {body}
    </Card>
  )
}

function Row({
  label,
  title,
  detail,
  children,
}: {
  label: ReactNode
  title: string
  detail: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-2">{label}</p>
        <p className="truncate font-medium">{title}</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
      {children}
    </div>
  )
}
