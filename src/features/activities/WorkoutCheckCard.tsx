import { ListChecks } from 'lucide-react'
import { Card, cx } from '../../components/ui'
import type { Activity } from '../../db/types'
import { formatClock } from '../../lib/format'
import { stepDuration, stepTarget } from '../garmin/workout'
import { formatDistance, formatSpeed, speedKind } from './activities'
import { checkSummary, isWork, stepLabel, type StepCheck, type TargetCheck, type WorkoutCheck } from './compliance'

const VERDICTS: Record<TargetCheck, string> = {
  ok: '✓',
  fast: '↑ rápido',
  slow: '↓ lento',
  high: '↑ FC alta',
  low: '↓ FC baixa',
}

/** What the lap did, in the terms of the step's target: the pace, or the heart rate. */
function doneValue(check: StepCheck, activity: Activity): string {
  const lap = check.lap!
  if (check.step.targetType === 'HEART_RATE') return lap.avgHr !== undefined ? `${lap.avgHr} bpm` : '—'
  const kind = speedKind(activity)
  return lap.avgSpeed && lap.distanceM ? formatSpeed(lap.avgSpeed, kind) : lap.avgHr !== undefined ? `${lap.avgHr} bpm` : '—'
}

/** How long the lap was: its distance, or its time for a time step. */
const doneLength = (check: StepCheck) => {
  const lap = check.lap!
  if (check.step.durationType === 'TIME' || !lap.distanceM) return formatClock(lap.timerSec)
  return formatDistance(lap.distanceM)
}

function Row({ check, activity, foot }: { check: StepCheck; activity: Activity; foot: boolean }) {
  const lap = check.lap
  const verdict = check.target && VERDICTS[check.target]
  const cut = check.length === 'short' || check.length === 'long'
  return (
    <tr className={cx(!isWork(check.step) && 'text-ink-2', !lap && 'opacity-60')}>
      <td className="py-1.5 pr-2 align-top">
        <span className={cx('block font-medium', isWork(check.step) && 'text-ink')}>{stepLabel(check, foot)}</span>
        <span className="block text-xs text-muted">{stepDuration(check.step) ?? '—'}</span>
      </td>
      <td className="py-1.5 pr-2 align-top text-xs whitespace-nowrap">{stepTarget(check.step, foot) ?? '—'}</td>
      <td className="py-1.5 pr-2 align-top whitespace-nowrap">
        {lap ? (
          <>
            <span className="block">{doneValue(check, activity)}</span>
            <span className={cx('block text-xs', cut ? 'font-medium text-critical' : 'text-muted')}>
              {doneLength(check)}
              {check.length === 'short' && ' · curta'}
              {check.length === 'long' && ' · longa'}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted">não feita</span>
        )}
      </td>
      <td
        className={cx(
          'py-1.5 text-right align-top text-xs font-medium whitespace-nowrap',
          check.target === 'ok' ? 'text-good' : 'text-critical',
        )}
      >
        {verdict ?? <span className="text-muted">—</span>}
      </td>
    </tr>
  )
}

/**
 * The coach's workout step by step against what was done: each step's target, the lap that ran it
 * and whether it hit the target, with the count on top ("6 de 8 tiros no alvo"). When the laps don't
 * line up with the steps, it says so instead of guessing.
 */
export function WorkoutCheckCard({ activity, check }: { activity: Activity; check: WorkoutCheck }) {
  const foot = speedKind(activity) === 'pace'
  const summary = checkSummary(check)
  return (
    <Card icon={ListChecks} tone="today" title="Planejado × feito">
      {check.status === 'mismatch' ? (
        <p className="text-sm text-ink-2">
          Não deu para comparar etapa por etapa: {summary}.
          {check.steps.length > 0 &&
            ' Quando o relógio segue o treino, ele faz uma volta por etapa; aqui as voltas não correspondem (o treino pode ter sido feito sem segui-lo no relógio).'}
        </p>
      ) : (
        <>
          <p className="mb-1 font-semibold first-letter:uppercase">{summary}</p>
          {check.extraLaps > 0 && (
            <p className="text-xs text-muted">
              {check.extraLaps === 1 ? '1 volta ficou' : `${check.extraLaps} voltas ficaram`} fora do treino (antes de começar ou depois
              de terminar).
            </p>
          )}
          <div className="scroll-fade-x -mx-4 mt-3 overflow-x-auto px-4">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs whitespace-nowrap text-muted">
                  <th className="py-1 pr-2 font-normal">Etapa</th>
                  <th className="py-1 pr-2 font-normal">Alvo</th>
                  <th className="py-1 pr-2 font-normal">Feito</th>
                  <th className="py-1 text-right font-normal">
                    <span className="sr-only">Resultado</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {check.steps.map((step, i) => (
                  <Row key={i} check={step} activity={activity} foot={foot} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
