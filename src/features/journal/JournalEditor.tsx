import { useEffect, useRef, useState } from 'react'
import { cx } from '../../components/ui'
import type { JournalEntry } from '../../db/types'
import { formatTime, type DayKey } from '../../lib/dates'
import { ENERGY, MOODS, saveJournal, useJournalEntry, type Level } from './journal'

/** Mood, energy and free text for one day, saved as they change. */
export function JournalEditor({ date, rows = 6 }: { date: DayKey; rows?: number }) {
  const entry = useJournalEntry(date)
  if (entry === undefined) return null
  // A new day starts a fresh editor, so typing never mixes two days.
  return <Editor key={date} date={date} entry={entry} rows={rows} />
}

function Editor({ date, entry, rows }: { date: DayKey; entry: JournalEntry | null; rows: number }) {
  const [text, setText] = useState(entry?.text ?? '')
  const latest = useRef(text)
  const saved = useRef(text)
  const [savedAt, setSavedAt] = useState<number>()

  // Text saves shortly after typing stops, and whatever is left when the editor goes away.
  useEffect(() => {
    if (text === saved.current) return
    const timer = setTimeout(() => {
      saved.current = text
      void saveJournal(date, { text }).then(() => setSavedAt(Date.now()))
    }, 700)
    return () => clearTimeout(timer)
  }, [text, date])
  useEffect(
    () => () => {
      if (latest.current !== saved.current) void saveJournal(date, { text: latest.current })
    },
    [date],
  )

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <LevelPicker
          label="Humor"
          levels={MOODS}
          value={entry?.mood}
          onChange={(mood) => void saveJournal(date, { mood })}
        />
        <LevelPicker
          label="Energia"
          levels={ENERGY}
          value={entry?.energy}
          onChange={(energy) => void saveJournal(date, { energy })}
        />
      </div>
      <label className="block">
        <span className="sr-only">Como foi o dia</span>
        <textarea
          value={text}
          rows={rows}
          onChange={(event) => {
            setText(event.target.value)
            latest.current = event.target.value
          }}
          placeholder="Como foi o dia? O que pode ter influenciado o sono, o treino ou a fome: trabalho, viagem, dor, remédio, festa…"
          className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent/30"
        />
      </label>
      <p className="h-4 text-right text-xs text-muted" aria-live="polite">
        {text !== saved.current ? 'Salvando…' : savedAt ? `Salvo às ${formatTime(savedAt)}` : ''}
      </p>
    </div>
  )
}

/** Five faces from worst to best; tapping the chosen one again clears it. */
function LevelPicker({
  label,
  levels,
  value,
  onChange,
}: {
  label: string
  levels: Level[]
  value?: number
  onChange: (value: number | undefined) => void
}) {
  const chosen = levels.find((level) => level.value === value)
  return (
    <div>
      <p className="mb-1 flex items-baseline justify-between text-sm font-medium text-ink-2">
        {label}
        <span className="text-xs font-normal text-muted">{chosen?.label}</span>
      </p>
      <div role="radiogroup" aria-label={label} className="flex gap-1.5">
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
              onClick={() => onChange(selected ? undefined : level.value)}
              className={cx(
                'flex h-11 flex-1 items-center justify-center rounded-xl text-xl transition',
                selected ? 'scale-110 bg-accent/15 ring-2 ring-accent-ink' : 'bg-surface-2 opacity-60 grayscale hover:opacity-100 hover:grayscale-0',
              )}
            >
              {level.emoji}
            </button>
          )
        })}
      </div>
    </div>
  )
}
