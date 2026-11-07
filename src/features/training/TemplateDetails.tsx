import { Link2, Pencil, Play, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Modal } from '../../components/Modal'
import { Button, SkeletonLines } from '../../components/ui'
import type { Exercise, TemplateExercise, WorkoutSession, WorkoutTemplate } from '../../db/types'
import { formatDay } from '../../lib/dates'
import { formatClock, formatDuration, formatNumber } from '../../lib/format'
import { EQUIPMENT, MUSCLES } from './catalog'
import { useStartWorkout } from './components'
import { lastPerformance, loadSuggestion, summarize } from './stats'
import { doneSetsText, lastTemplateSession, plannedSetsText, templateTotals } from './templateText'
import { DEFAULT_WARMUP_REST_SEC, exerciseBlocks, useExerciseMap, useSessions, useTemplates } from './training'

type Numbered = TemplateExercise & { number: number }

/**
 * A ficha to read before the workout: each exercise with its sets, rest and notes, what was done last
 * time and whether it's time to go up in load. Bi-sets are boxed together.
 */
export function TemplateDetails({ template }: { template: WorkoutTemplate }) {
  const exercises = useExerciseMap()
  const sessions = useSessions()
  if (!sessions) return <SkeletonLines lines={4} />
  const totals = templateTotals(template, exercises)
  const last = lastTemplateSession(sessions, template.id)
  const lastSummary = last ? summarize(last) : undefined
  const blocks = exerciseBlocks<Numbered>(template.exercises.map((exercise, i) => ({ ...exercise, number: i + 1 })))
  const now = Date.now()

  return (
    <div>
      <p className="text-sm text-ink-2">
        {totals.exercises === 1 ? '1 exercício' : `${totals.exercises} exercícios`} ·{' '}
        {totals.sets === 1 ? '1 série' : `${totals.sets} séries`}
        {totals.muscles.length > 0 && ` · ${totals.muscles.map((muscle) => MUSCLES[muscle]).join(', ')}`}
      </p>
      {last && lastSummary && (
        <p className="text-xs text-muted">
          Última vez: {formatDay(last.date, 'EEE, d/MM')}
          {lastSummary.durationMs ? ` · ${formatDuration(lastSummary.durationMs)}` : ''} · {lastSummary.sets} séries
        </p>
      )}
      {template.notes?.trim() && (
        <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm whitespace-pre-line text-ink-2">{template.notes.trim()}</p>
      )}
      {template.exercises.length === 0 ? (
        <p className="py-4 text-sm text-muted">Esta ficha ainda não tem exercícios.</p>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {blocks.map((block) =>
            block.length === 1 ? (
              <ExerciseItem key={block[0].number} exercise={block[0]} info={exercises.get(block[0].exerciseId)} sessions={sessions} now={now} />
            ) : (
              <li key={block[0].number} className="py-2">
                <div className="rounded-2xl border border-line px-3 pt-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-ink">
                    <Link2 size={13} aria-hidden /> Bi-set: um depois do outro, descanso no fim do par
                  </p>
                  <ol className="divide-y divide-line">
                    {block.map((exercise) => (
                      <ExerciseItem
                        key={exercise.number}
                        exercise={exercise}
                        info={exercises.get(exercise.exerciseId)}
                        sessions={sessions}
                        now={now}
                      />
                    ))}
                  </ol>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  )
}

function ExerciseItem({
  exercise,
  info,
  sessions,
  now,
}: {
  exercise: Numbered
  info: Exercise | undefined
  sessions: WorkoutSession[]
  now: number
}) {
  const type = info?.type ?? 'weight_reps'
  const warmups = exercise.sets.filter((set) => set.kind === 'warmup')
  const work = exercise.sets.filter((set) => set.kind === 'normal')
  const last = lastPerformance(sessions, exercise.exerciseId, now)
  const lastText = last ? doneSetsText(last.exercise, type) : ''
  const suggestion = last && info && type === 'weight_reps' ? loadSuggestion(last.exercise.sets, info.equipment) : undefined
  const rest = exercise.supersetWithNext
    ? 'Sem descanso: segue para o próximo'
    : `Descanso ${formatClock(exercise.restSec)}${
        warmups.length > 0 ? ` · ${formatClock(exercise.warmupRestSec ?? DEFAULT_WARMUP_REST_SEC)} depois do aquecimento` : ''
      }`

  return (
    <li className="flex gap-3 py-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2 tabular-nums"
      >
        {exercise.number}
      </span>
      <div className="min-w-0 flex-1">
        {info ? (
          <Link to={`/treinos/exercicios/${info.id}`} className="font-medium hover:text-accent-ink">
            {info.name}
          </Link>
        ) : (
          <p className="font-medium text-ink-2">Exercício apagado</p>
        )}
        {info && (
          <p className="text-xs text-muted">
            {MUSCLES[info.muscle]} · {EQUIPMENT[info.equipment]}
          </p>
        )}
        <p className="mt-1 text-sm font-semibold tabular-nums">{plannedSetsText(work, type) || 'Sem séries de trabalho'}</p>
        {warmups.length > 0 && (
          <p className="text-xs text-ink-2 tabular-nums">Aquecimento: {plannedSetsText(warmups, type)}</p>
        )}
        <p className="text-xs text-muted">{rest}</p>
        {last && lastText && (
          <p className="mt-1 text-xs text-ink-2">
            Última vez ({formatDay(last.session.date, 'd/M')}): <span className="tabular-nums">{lastText}</span>
          </p>
        )}
        {suggestion && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-accent-ink">
            <TrendingUp size={13} aria-hidden /> Que tal {formatNumber(suggestion.weightKg, 2)} kg desta vez?
          </p>
        )}
        {exercise.notes?.trim() && <p className="mt-1 text-xs whitespace-pre-line text-ink-2 italic">{exercise.notes.trim()}</p>}
      </div>
    </li>
  )
}

/**
 * The ficha in a sheet, from the calendar or the Hoje card: what it is, when, and the buttons to start
 * it (on its day) or edit it.
 */
export function TemplateSheet({
  templateId,
  subtitle,
  canStart,
  onClose,
  children,
}: {
  templateId: string
  /** When it's planned: "sexta-feira, 7 de novembro · às 12:00". */
  subtitle?: string
  canStart: boolean
  onClose: () => void
  /** More about that day, above the exercises (the weather expected). */
  children?: ReactNode
}) {
  const templates = useTemplates()
  const navigate = useNavigate()
  const start = useStartWorkout()
  const template = templates?.find((candidate) => candidate.id === templateId)
  return (
    <Modal open title={template?.name ?? 'Ficha'} onClose={onClose}>
      {subtitle && <p className="-mt-1 mb-3 text-xs text-muted first-letter:uppercase">{subtitle}</p>}
      {!templates ? (
        <SkeletonLines lines={4} />
      ) : !template ? (
        <p className="py-4 text-sm text-ink-2">Esta ficha foi apagada.</p>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            {canStart && (
              <Button variant="primary" className="flex-1" onClick={() => void start(template)}>
                <Play size={16} /> Iniciar
              </Button>
            )}
            <Button className="flex-1" onClick={() => navigate(`/treinos/ficha/${template.id}`)}>
              <Pencil size={16} /> Editar ficha
            </Button>
          </div>
          {children}
          <TemplateDetails template={template} />
        </>
      )}
    </Modal>
  )
}
