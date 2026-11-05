import { NotebookPen } from 'lucide-react'
import { Link } from 'react-router'
import { Card, cx, SkeletonCard } from '../../components/ui'
import type { DayKey } from '../../lib/dates'
import { ENERGY, MOODS, saveJournal, useJournalEntry, type Level } from './journal'

/**
 * The diary on the Hoje screen, kept simple: a tap for the mood and the energy, and the day's
 * text as a preview that opens the diary to write.
 */
export function TodayJournalCard({ today }: { today: DayKey }) {
  const entry = useJournalEntry(today)
  if (entry === undefined) return <SkeletonCard lines={3} />
  const text = entry?.text?.trim()
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
