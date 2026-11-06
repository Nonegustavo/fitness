import { Repeat } from 'lucide-react'
import { Link } from 'react-router'
import { cx, Stat } from '../../components/ui'
import { useToday } from '../../db/hooks'
import type { Activity } from '../../db/types'
import { dayKey, formatDay, formatTime, relativeDay } from '../../lib/dates'
import { formatClock, formatNumber } from '../../lib/format'
import { formatDistance, formatSpeed, useActivities } from '../activities/activities'
import { checkSummary, checkWorkout } from '../activities/compliance'
import type { PlannedEvent } from '../garmin/calendar'
import { coachConfigured, useCoachPlan, type CoachWorkout } from '../sisrun/coachPlan'
import { eventDistance, eventTitle, fromCoach, isRace, type AgendaKind } from './agenda'
import { descriptionLines, lastSimilarRun, structureLines, type TextLine, type TextLineKind } from './eventText'

/** The mark of each kind of step: effort in the section's color, the easy parts lighter or gray. */
const MARKS: Record<Exclude<TextLineKind, 'repeat'>, string> = {
  step: 'var(--accent)',
  recovery: 'color-mix(in oklab, var(--accent) 40%, transparent)',
  warmup: 'var(--muted)',
  cooldown: 'var(--muted)',
}

const km = (value: number) => formatNumber(value, 2)

/** "00:35:00" → "35:00", "01:05:00" → "1:05:00"; anything else as it came. */
const shortTime = (text: string) => (/^\d{2}:\d{2}:\d{2}$/.test(text) ? text.replace(/^00:/, '').replace(/^0(\d)/, '$1') : text)

function range(low: string | undefined, high: string | undefined, unit = ''): string | undefined {
  if (low && high) return low === high ? `${low}${unit}` : `${low}–${high}${unit}`
  if (high) return `até ${high}${unit}`
  if (low) return `a partir de ${low}${unit}`
  return undefined
}

/**
 * A workout of the Garmin calendar in detail. A coach's run on SisRUN shows the prescription read
 * from SisRUN (the distance, the intensity, the heart rate and time ranges, the steps and the coach's
 * note); any other shows the distance its name gives and the steps its description lists. Then how
 * the last run of the same kind went.
 */
export function EventDetails({ event, kind, coach }: { event: PlannedEvent; kind: AgendaKind; coach?: CoachWorkout }) {
  const activities = useActivities()
  const plan = useCoachPlan()
  const today = useToday()
  const named = eventDistance(event.title)
  const race = isRace(event)
  const similar = kind === 'run' && !race && activities ? lastSimilarRun(event, activities) : undefined
  const coachSteps = coach ? structureLines(coach.structure) : []
  const described = descriptionLines(event.description)
  const paragraph = described.length === 1 && described[0].kind === 'step'
  const distance = coach?.distanceRangeKm
    ? `${km(coach.distanceRangeKm[0])}–${km(coach.distanceRangeKm[1])} km`
    : coach?.plannedKm
      ? `${coach.plannedKmEstimated ? '≈ ' : ''}${km(coach.plannedKm)} km`
      : named
      ? named.low === named.high
        ? `${km(named.high)} km`
        : `${km(named.low)}–${km(named.high)} km`
      : undefined
  const facts = coach
    ? [
        { label: 'Intensidade', value: coach.intensity },
        { label: 'FC', value: range(coach.hrMin?.toString(), coach.hrMax?.toString(), ' bpm') },
        { label: 'Tempo', value: range(coach.timeMin && shortTime(coach.timeMin), coach.timeMax && shortTime(coach.timeMax)) },
      ].filter((fact): fact is { label: string; value: string } => !!fact.value)
    : []

  return (
    <div className="space-y-5">
      {(distance || facts.length > 0) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {distance && (
            <Stat
              label={race ? 'Distância da prova' : 'Distância planejada'}
              value={distance}
              note={coach?.plannedKmEstimated && !coach.distanceRangeKm ? 'parte estimada pelo tempo' : undefined}
            />
          )}
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <p className="text-xs text-ink-2">{fact.label}</p>
              <p className="font-semibold">{fact.value}</p>
            </div>
          ))}
        </div>
      )}

      {coach ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Etapas</h3>
          {coachSteps.length > 0 ? (
            <StepLines lines={coachSteps} />
          ) : (
            <p className="text-sm text-ink-2">O treinador não detalhou as etapas deste treino no SisRUN.</p>
          )}
        </section>
      ) : (
        (described.length > 0 || !race) && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">{paragraph || race ? 'Descrição' : 'Etapas'}</h3>
            {described.length === 0 ? (
              <p className="text-sm text-ink-2">{withoutSteps(event, plan)}</p>
            ) : paragraph ? (
              <p className="text-sm whitespace-pre-line">{described[0].text}</p>
            ) : (
              <StepLines lines={described} />
            )}
            {described.length === 0 && fromCoach(event) && !coachConfigured(plan) && (
              <Link to="/ajustes" className="mt-1 inline-block text-sm font-medium text-accent-ink">
                Ligar o SisRUN em Ajustes
              </Link>
            )}
          </section>
        )
      )}

      {coach?.note && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Observação do treinador</h3>
          <p className="text-sm whitespace-pre-line">{coach.note}</p>
        </section>
      )}
      {coach && described.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">No calendário do Garmin</h3>
          <p className="text-sm whitespace-pre-line text-ink-2">{described.map((line) => line.text).join('\n')}</p>
        </section>
      )}
      {coach && plan?.fetchedAt && (
        <p className="text-xs text-muted">
          Do SisRUN, lido {relativeDay(dayKey(plan.fetchedAt), today)} às {formatTime(plan.fetchedAt)}.
        </p>
      )}

      {similar && <SimilarRun activity={similar} />}
    </div>
  )
}

/** Why a workout has no steps here, and when they'll come. */
function withoutSteps(event: PlannedEvent, plan: ReturnType<typeof useCoachPlan>): string {
  if (fromCoach(event) && coachConfigured(plan)) {
    return 'Este treino ainda não foi lido do SisRUN: o app lê os treinos de até duas semanas à frente, quando eles aparecem no calendário do Garmin. Depois da corrida, as etapas aparecem na atividade.'
  }
  if (fromCoach(event)) {
    return 'O calendário do Garmin trouxe só o nome deste treino. Lendo o SisRUN, as etapas aparecem aqui antes da corrida; sem isso, aparecem na atividade depois que ela for sincronizada.'
  }
  return 'O calendário do Garmin trouxe só o nome deste treino. As etapas, com os ritmos de cada uma, aparecem na atividade depois que ela for sincronizada.'
}

function StepLines({ lines }: { lines: TextLine[] }) {
  return (
    <ol className="space-y-1.5 text-sm">
      {lines.map((line, i) => (
        <li key={i} className={cx('flex items-start gap-2.5', line.depth > 0 && 'ml-1 border-l-2 border-line pl-3')}>
          {line.kind === 'repeat' ? (
            <>
              <Repeat size={14} aria-hidden className="mt-0.5 shrink-0 text-accent-ink" />
              <span className="font-semibold">{line.text}</span>
            </>
          ) : (
            <>
              <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: MARKS[line.kind] }} />
              <span>{line.text}</span>
            </>
          )}
        </li>
      ))}
    </ol>
  )
}

/** The last run of the same kind: what it was, how it went against its plan, and what was said of it. */
function SimilarRun({ activity }: { activity: Activity }) {
  const check = checkWorkout(activity)
  const name = eventTitle(activity.workout?.name ?? activity.title ?? 'Corrida')
  const numbers = [
    activity.distanceM ? formatDistance(activity.distanceM) : undefined,
    formatClock(activity.timerSec),
    activity.avgSpeed ? formatSpeed(activity.avgSpeed, 'pace') : undefined,
    activity.effort ? `PSE ${activity.effort}` : undefined,
  ].filter(Boolean)
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Da última vez</h3>
      <Link to={`/treinos/atividades/${activity.id}`} className="block rounded-xl bg-surface-2 px-3 py-2.5 transition hover:brightness-95">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted first-letter:uppercase">{formatDay(activity.date, "EEEE, d 'de' MMMM")}</p>
        <p className="mt-1 text-xs text-ink-2 tabular-nums">{numbers.join(' · ')}</p>
        {check && check.status !== 'mismatch' && <p className="text-xs text-ink-2 first-letter:uppercase">{checkSummary(check)}</p>}
        {activity.notes?.trim() && <p className="mt-1 line-clamp-2 text-xs text-ink-2 italic">“{activity.notes.trim()}”</p>}
      </Link>
    </section>
  )
}
