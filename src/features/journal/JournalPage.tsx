import { NotebookPen } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DayNav } from '../../components/DayNav'
import { Button, Card, Empty, Page, TextInput } from '../../components/ui'
import { useToday } from '../../db/hooks'
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

  const others = (entries ?? []).filter((entry) => entry.id !== date && (!query.trim() || matchesSearch(entry, query)))

  return (
    <Page title="Diário" icon={NotebookPen} tone="journal" subtitle="O que os números não contam, nas suas palavras">
      <Card>
        <DayNav date={date} today={today} onChange={setDate} />
        <JournalEditor date={date} />
      </Card>

      <PainsCard date={date} today={today} openAdd={addPain} onOpened={onPainFormOpened} />

      <Card title="Outros dias">
        <TextInput
          type="search"
          placeholder="Buscar no diário"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setShown(PAGE)
          }}
        />
        {others.length === 0 ? (
          <Empty>{query.trim() ? 'Nada encontrado.' : 'Os outros dias que você escrever aparecem aqui.'}</Empty>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {others.slice(0, shown).map((entry) => {
              const mood = levelOf(MOODS, entry.mood)
              const energy = levelOf(ENERGY, entry.energy)
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDate(entry.id)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="w-full py-2.5 text-left hover:text-accent-ink"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium first-letter:uppercase">
                        {formatDay(entry.id, "EEEE, d 'de' MMM")}
                      </span>
                      <span className="shrink-0 text-base" aria-label={[mood && `Humor: ${mood.label}`, energy && `Energia: ${energy.label}`].filter(Boolean).join(', ')}>
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
          <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setShown((count) => count + PAGE)}>
            Mostrar mais
          </Button>
        )}
      </Card>
    </Page>
  )
}
