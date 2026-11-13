import { NotebookPen } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DayNav, DayPager } from '../../components/DayNav'
import { Button, Card, Empty, Page, TextInput } from '../../components/ui'
import { useToday } from '../../db/hooks'
import type { JournalEntry } from '../../db/types'
import { formatDay, type DayKey } from '../../lib/dates'
import { JournalEditor } from './JournalEditor'
import { ENERGY, levelOf, matchesSearch, MOODS, useJournal } from './journal'
import { PainsCard } from './PainsCard'

const PAGE = 30

export default function JournalPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const date = params.get('data') ?? today
  const setDate = (next: DayKey) => setParams(next === today ? {} : { data: next }, { replace: true })
  // "?dor=nova" opens the form to add a pain; once open, the address keeps only the day.
  const addPain = params.get('dor') === 'nova'
  const onPainFormOpened = useCallback(
    () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('dor')
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const entries = useJournal()
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)

  // The search's matches, the day each page shows left out of them there.
  const matches = (entries ?? []).filter((entry) => !query.trim() || matchesSearch(entry, query))

  return (
    <Page title="Diário" icon={NotebookPen} tone="journal" subtitle="O que os números não contam, nas suas palavras">
      {/* All of the screen is the day's page: dragged sideways, everything moves with the finger. */}
      <DayPager date={date} today={today} onChange={setDate} className="space-y-4">
        {(day) => (
          <>
            <Card>
              <DayNav date={day} today={today} onChange={setDate} />
              <JournalEditor date={day} />
            </Card>
            <PainsCard date={day} today={today} openAdd={addPain && day === date} onOpened={onPainFormOpened} />
            <OtherDays
              others={matches.filter((entry) => entry.id !== day)}
              query={query}
              shown={shown}
              onQuery={(text) => {
                setQuery(text)
                setShown(PAGE)
              }}
              onMore={() => setShown((count) => count + PAGE)}
              onPick={(picked) => {
                setDate(picked)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          </>
        )}
      </DayPager>
    </Page>
  )
}

/** The other days written, newest first, with a search; tapping one opens it. */
function OtherDays({
  others,
  query,
  shown,
  onQuery,
  onMore,
  onPick,
}: {
  others: JournalEntry[]
  query: string
  shown: number
  onQuery: (text: string) => void
  onMore: () => void
  onPick: (date: DayKey) => void
}) {
  return (
    <Card title="Outros dias">
      <TextInput type="search" aria-label="Buscar no diário" placeholder="Buscar no diário" value={query} onChange={(event) => onQuery(event.target.value)} />
      {others.length === 0 ? (
        <Empty>{query.trim() ? 'Nada encontrado.' : 'Os outros dias que você escrever aparecem aqui.'}</Empty>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {others.slice(0, shown).map((entry) => {
            const mood = levelOf(MOODS, entry.mood)
            const energy = levelOf(ENERGY, entry.energy)
            return (
              <li key={entry.id}>
                <button type="button" onClick={() => onPick(entry.id)} className="w-full py-2.5 text-left hover:text-accent-ink">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium first-letter:uppercase">{formatDay(entry.id, "EEEE, d 'de' MMM")}</span>
                    <span
                      className="shrink-0 text-base"
                      aria-label={[mood && `Humor: ${mood.label}`, energy && `Energia: ${energy.label}`].filter(Boolean).join(', ')}
                    >
                      {mood?.emoji}
                      {energy?.emoji}
                    </span>
                  </span>
                  {entry.text.trim() && (
                    <span className="mt-0.5 line-clamp-2 block text-sm text-ink-2 whitespace-pre-line">{entry.text}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {others.length > shown && (
        <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={onMore}>
          Mostrar mais
        </Button>
      )}
    </Card>
  )
}
