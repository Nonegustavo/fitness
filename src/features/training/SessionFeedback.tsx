import { patch } from '../../db/repo'
import { db } from '../../db/schema'
import type { WorkoutSession } from '../../db/types'
import { Card, cx } from '../../components/ui'

/** Where a session can hurt or feel off, for the discomfort chips and the training page. */
export const DISCOMFORT_AREAS: Record<string, string> = {
  neck: 'Pescoço',
  shoulder: 'Ombro',
  elbow: 'Cotovelo',
  wrist: 'Punho',
  upperBack: 'Costas (alto)',
  lowerBack: 'Lombar',
  hip: 'Quadril',
  knee: 'Joelho',
  ankle: 'Tornozelo',
}

const EFFORT_HINT: Record<number, string> = {
  1: 'muito leve',
  3: 'leve',
  5: 'moderado',
  7: 'pesado',
  8: 'bem pesado',
  9: 'quase no limite',
  10: 'no limite',
}

export const effortHint = (value: number): string => {
  const keys = Object.keys(EFFORT_HINT).map(Number)
  const key = keys.filter((k) => k <= value).at(-1) ?? 1
  return EFFORT_HINT[key]
}

/** After the workout: how hard it felt (RPE 1–10) and where it hurt. Goes into the correlations and the deload advice. */
export function SessionFeedback({ session }: { session: WorkoutSession }) {
  const discomfort = new Set(session.discomfort ?? [])
  const setEffort = (effort: number | undefined) => void patch(db.workoutSessions, session.id, { effort })
  const toggleArea = (area: string) => {
    const next = new Set(discomfort)
    if (next.has(area)) next.delete(area)
    else next.add(area)
    void patch(db.workoutSessions, session.id, { discomfort: next.size ? [...next] : undefined })
  }
  return (
    <Card title="Como foi o treino?">
      <p className="mb-2 text-xs text-ink-2">
        Esforço {session.effort ? `${session.effort}/10 · ${effortHint(session.effort)}` : '(1 a 10)'}
      </p>
      <div role="radiogroup" aria-label="Esforço do treino" className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={session.effort === value}
            onClick={() => setEffort(session.effort === value ? undefined : value)}
            className={cx(
              'h-10 rounded-lg text-sm font-medium tabular-nums transition',
              session.effort === value ? 'bg-(--tone-training) text-white' : 'bg-surface-2 text-ink-2 hover:text-ink',
            )}
          >
            {value}
          </button>
        ))}
      </div>
      <p className="mt-4 mb-2 text-xs text-ink-2">Dor ou desconforto</p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(DISCOMFORT_AREAS).map(([area, label]) => (
          <button
            key={area}
            type="button"
            aria-pressed={discomfort.has(area)}
            onClick={() => toggleArea(area)}
            className={cx(
              'h-9 rounded-full border px-3 text-sm transition',
              discomfort.has(area) ? 'border-critical bg-critical/15 text-ink' : 'border-line text-ink-2 hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </Card>
  )
}
