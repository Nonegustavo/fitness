import { ClipboardCopy, MessageSquareText } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, Card, cx } from '../../components/ui'
import type { Activity } from '../../db/types'
import { formatTime } from '../../lib/dates'
import { tapFeedback } from '../../lib/haptics'
import { DISCOMFORT_AREAS } from '../training/discomfort'
import { effortHint } from '../training/SessionFeedback'
import { coachMessage, saveActivityFeedback } from './activities'

const textareaClass =
  'w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent/30'

/** A blank comment is stored as none. */
const cleaned = (text: string) => (text.trim() ? text : undefined)

/**
 * After a run (or any workout the watch recorded): the comment for the coach, how hard it felt
 * (PSE, 1–10) and where it hurt. Saved as it changes; goes into the daily analysis too. `focus`
 * opens it ready to type (from "Agora").
 */
export function ActivityFeedback({ activity, focus = false }: { activity: Activity; focus?: boolean }) {
  const toast = useToast()
  const [text, setText] = useState(activity.notes ?? '')
  const latest = useRef(text)
  const saved = useRef(text)
  const [savedAt, setSavedAt] = useState<number>()
  const [fallback, setFallback] = useState<string>()
  const field = useRef<HTMLTextAreaElement>(null)

  // The comment saves shortly after typing stops, and whatever is left when the page closes.
  useEffect(() => {
    if (text === saved.current) return
    const timer = setTimeout(() => {
      saved.current = text
      void saveActivityFeedback(activity.id, { notes: cleaned(text) }).then(() => setSavedAt(Date.now()))
    }, 700)
    return () => clearTimeout(timer)
  }, [text, activity.id])
  useEffect(
    () => () => {
      if (latest.current !== saved.current) void saveActivityFeedback(activity.id, { notes: cleaned(latest.current) })
    },
    [activity.id],
  )
  useEffect(() => {
    if (!focus) return
    field.current?.scrollIntoView({ block: 'center' })
    field.current?.focus()
  }, [focus])

  const discomfort = new Set(activity.discomfort ?? [])
  const setEffort = (effort: number | undefined) => {
    tapFeedback()
    void saveActivityFeedback(activity.id, { effort })
  }
  const toggleArea = (area: string) => {
    const next = new Set(discomfort)
    if (next.has(area)) next.delete(area)
    else next.add(area)
    void saveActivityFeedback(activity.id, { discomfort: next.size ? [...next] : undefined })
  }

  const something = Boolean(text.trim() || activity.effort || discomfort.size)
  const copy = async () => {
    const message = coachMessage({ ...activity, notes: text })
    try {
      await navigator.clipboard.writeText(message)
      toast({ message: 'Copiado. É só colar na mensagem para o treinador.' })
    } catch {
      // Some WebViews block the clipboard: show the text to copy by hand.
      setFallback(message)
    }
  }

  return (
    <Card icon={MessageSquareText} tone="today" title="Como foi?">
      <label className="block">
        <span className="mb-1 block text-xs text-ink-2">Comentário: o que você conta para o treinador</span>
        <textarea
          ref={field}
          rows={4}
          maxLength={2000}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            latest.current = event.target.value
          }}
          placeholder="Ex.: Tiros no ritmo, o último mais pesado. Panturrilha esquerda cansada no fim."
          className={textareaClass}
        />
      </label>
      <p className="h-4 text-right text-xs text-muted" aria-live="polite">
        {text !== saved.current ? 'Salvando…' : savedAt ? `Salvo às ${formatTime(savedAt)}` : ''}
      </p>

      <p className="mt-2 mb-2 text-xs text-ink-2">
        Esforço (PSE) {activity.effort ? `${activity.effort}/10 · ${effortHint(activity.effort)}` : '(1 a 10)'}
      </p>
      <div role="radiogroup" aria-label="Esforço da corrida" className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={activity.effort === value}
            onClick={() => setEffort(activity.effort === value ? undefined : value)}
            className={cx(
              'h-10 rounded-lg text-sm font-medium tabular-nums transition',
              activity.effort === value ? 'bg-(--tone-today) text-white' : 'bg-surface-2 text-ink-2 hover:text-ink',
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

      <Button className="mt-4 w-full" disabled={!something} onClick={() => void copy()}>
        <ClipboardCopy size={16} /> Copiar para mandar ao treinador
      </Button>

      {fallback && (
        <Modal open title="Copie a mensagem" onClose={() => setFallback(undefined)}>
          <p className="mb-2 text-sm text-ink-2">O celular bloqueou a cópia automática. Toque no texto, selecione tudo e copie.</p>
          <textarea
            readOnly
            autoFocus
            rows={8}
            value={fallback}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink"
          />
        </Modal>
      )}
    </Card>
  )
}
