import { Repeat } from 'lucide-react'
import { Link } from 'react-router'
import { cx, Stat } from '../../components/ui'
import type { Activity } from '../../db/types'
import { formatDay } from '../../lib/dates'
import { formatClock, formatNumber } from '../../lib/format'
import { formatDistance, formatSpeed, useActivities } from '../activities/activities'
import { checkSummary, checkWorkout } from '../activities/compliance'
import type { PlannedEvent } from '../garmin/calendar'
import { eventDistance, eventTitle, isRace, type AgendaKind } from './agenda'
import { descriptionLines, lastSimilarRun, type TextLine, type TextLineKind } from './eventText'

/** The mark of each kind of step: effort in the section's color, the easy parts lighter or gray. */
const MARKS: Record<Exclude<TextLineKind, 'repeat'>, string> = {
  step: 'var(--accent)',
  recovery: 'color-mix(in oklab, var(--accent) 40%, transparent)',
  warmup: 'var(--muted)',
  cooldown: 'var(--muted)',
}

const km = (value: number) => formatNumber(value, 2)

/**
 * A workout of the Garmin calendar (a coach's run on SisRUN) in detail: the distance its name gives,
 * the steps its description lists, and how the last run of the same kind went.
 */
export function EventDetails({ event, kind }: { event: PlannedEvent; kind: AgendaKind }) {
  const activities = useActivities()
  const distance = eventDistance(event.title)
  const lines = descriptionLines(event.description)
  const race = isRace(event)
  const similar = kind === 'run' && !race && activities ? lastSimilarRun(event, activities) : undefined
  const paragraph = lines.length === 1 && lines[0].kind === 'step'

  return (
    <div className="space-y-5">
      {distance && (
        <Stat
          label={race ? 'Distância da prova' : 'Distância planejada'}
          value={distance.low === distance.high ? `${km(distance.high)} km` : `${km(distance.low)}–${km(distance.high)} km`}
        />
      )}
      {(lines.length > 0 || !race) && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">{paragraph || race ? 'Descrição' : 'Etapas'}</h3>
          {lines.length === 0 ? (
            <p className="text-sm text-ink-2">
              O calendário do Garmin trouxe só o nome deste treino. As etapas, com os ritmos de cada uma, aparecem na
              atividade depois que ela for sincronizada.
            </p>
          ) : paragraph ? (
            <p className="text-sm whitespace-pre-line">{lines[0].text}</p>
          ) : (
            <StepLines lines={lines} />
          )}
        </section>
      )}
      {similar && <SimilarRun activity={similar} />}
    </div>
  )
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
