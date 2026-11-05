import { useEffect, useRef, useState } from 'react'
import { patch } from '../../db/repo'
import { db } from '../../db/schema'
import type { WorkoutSession } from '../../db/types'
import { Card, cx } from '../../components/ui'
import { formatTime } from '../../lib/dates'
import { DISCOMFORT_AREAS } from './discomfort'

const textareaClass =
  'w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent/30'

/** A blank comment is stored as none. */
const cleaned = (text: string) => (text.trim() ? text : undefined)

/** The workout's comment, saved shortly after typing stops and when the page closes. */
function SessionNotes({ session }: { session: WorkoutSession }) {
  const [text, setText] = useState(session.notes ?? '')
  const latest = useRef(text)
  const saved = useRef(text)
  const [savedAt, setSavedAt] = useState<number>()
  useEffect(() => {
    if (text === saved.current) return
    const timer = setTimeout(() => {
      saved.current = text
      void patch(db.workoutSessions, session.id, { notes: cleaned(text) }).then(() => setSavedAt(Date.now()))
    }, 700)
    return () => clearTimeout(timer)
  }, [text, session.id])
  useEffect(
    () => () => {
      if (latest.current !== saved.current) void patch(db.workoutSessions, session.id, { notes: cleaned(latest.current) })
    },
    [session.id],
  )
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-xs text-ink-2">Comentário: como foi, o que sentiu (vai para a análise do dia)</span>
      <textarea
        rows={3}
        maxLength={2000}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          latest.current = event.target.value
        }}
        placeholder="Ex.: Supino rendeu, subi a carga. Ombro esquerdo incomodou no desenvolvimento."
        className={textareaClass}
      />
      <span className="block h-4 text-right text-xs text-muted" aria-live="polite">
        {text !== saved.current ? 'Salvando…' : savedAt ? `Salvo às ${formatTime(savedAt)}` : ''}
      </span>
    </label>
  )
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

/**
 * After the workout: a comment, how hard it felt (RPE 1–10) and where it hurt. Goes into the daily
 * analysis, the correlations and the deload advice.
 */
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
      <SessionNotes key={session.id} session={session} />
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
