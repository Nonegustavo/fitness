import { Bandage, NotebookPen } from 'lucide-react'
import { Link } from 'react-router'
import { Card, cx, SkeletonCard } from '../../components/ui'
import type { DayKey } from '../../lib/dates'
import { ENERGY, MOODS, saveJournal, useJournalEntry, type Level } from './journal'
import { painsOn, scoreOn, usePains } from './pains'

/**
 * The diary on the Hoje screen, kept simple: a tap for the mood and the energy, the pains going on,
 * and the day's text as a preview that opens the diary to write.
 */
export function TodayJournalCard({ today }: { today: DayKey }) {
  const entry = useJournalEntry(today)
  const pains = usePains()
  // The pains too, or their line would come in after the card.
  if (entry === undefined || !pains) return <SkeletonCard lines={3} />
  const text = entry?.text?.trim()
  const hurting = painsOn(pains, today)
  return (
    <Card
      icon={NotebookPen}
      tone="journal"
      title="Diário"
      action={
        <Link to="/diario" className="text-sm font-medium text-accent-ink">
          {text ? 'Editar' : 'Escrever'}
        </Link>
      }
    >
      <div className="space-y-2">
        <Faces label="Humor" levels={MOODS} value={entry?.mood} onPick={(mood) => void saveJournal(today, { mood })} />
        <Faces label="Energia" levels={ENERGY} value={entry?.energy} onPick={(energy) => void saveJournal(today, { energy })} />
      </div>
      {hurting.length > 0 && (
        <Link to="/diario" className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <Bandage size={16} aria-hidden className="shrink-0 text-muted" />
          <span className="min-w-0 truncate">
            {hurting.map((pain) => `${pain.name} ${scoreOn(pain, today) ?? '?'}/10`).join(' · ')}
          </span>
        </Link>
      )}
      <Link
        to="/diario"
        className={cx('mt-3 block rounded-xl bg-surface-2 px-3 py-2 text-sm', text ? 'line-clamp-3 text-ink' : 'text-muted')}
      >
        {text || 'Como foi o dia? Toque para escrever.'}
      </Link>
    </Card>
  )
}

/** Five faces in a row; tapping the chosen one again clears it. */
function Faces({ label, levels, value, onPick }: { label: string; levels: Level[]; value?: number; onPick: (value: number | undefined) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1.5">
      <span className="w-16 shrink-0 text-xs text-ink-2">{label}</span>
      {levels.map((level) => {
        const selected = level.value === value
        return (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={level.label}
            title={level.label}
            onClick={() => onPick(selected ? undefined : level.value)}
            className={cx(
              'flex h-9 flex-1 items-center justify-center rounded-lg text-lg transition',
              selected ? 'bg-accent/15 ring-2 ring-accent-ink' : 'bg-surface-2 opacity-60 grayscale',
            )}
          >
            {level.emoji}
          </button>
        )
      })}
    </div>
  )
}
