import { Minus, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toast'
import { Button, Card, cx, Field, IconButton, TextInput } from '../../components/ui'
import type { Pain } from '../../db/types'
import { formatDay, relativeDay, shiftDay, type DayKey } from '../../lib/dates'
import { addPain, intensity, painsOn, painSuggestions, removePain, SCORES, scoreDay, scoreOn, setPainScore, usePains } from './pains'

/**
 * "Dores e desconfortos" of a day: each pain going on, with the day's score (the last one carried
 * over until changed), and adding one in the user's own words. `openAdd` opens the adding form
 * (the "+" links to /diario?dor=nova); `onOpened` lets the page drop that from the address.
 */
export function PainsCard({
  date,
  today,
  openAdd,
  onOpened,
}: {
  date: DayKey
  today: DayKey
  openAdd: boolean
  onOpened: () => void
}) {
  const pains = usePains()
  const [adding, setAdding] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openAdd) return
    setAdding(true)
    onOpened()
    box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [openAdd, onOpened])

  const going = painsOn(pains ?? [], date)
  return (
    <div ref={box} className="scroll-mt-4">
      <Card
        title="Dores e desconfortos"
        action={
          !adding && (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus size={16} /> Adicionar dor
            </Button>
          )
        }
      >
        {adding && <AddPain key={date} pains={pains ?? []} date={date} onDone={() => setAdding(false)} />}
        {going.length > 0 ? (
          <ul className="divide-y divide-line">
            {going.map((pain) => (
              <PainRow key={pain.id} pain={pain} date={date} today={today} />
            ))}
          </ul>
        ) : (
          !adding && pains && <p className="text-sm text-muted">Nenhuma dor neste dia.</p>
        )}
      </Card>
    </div>
  )
}

/** "ontem", "em 3 de nov." */
const onDay = (date: DayKey, today: DayKey) => {
  const day = relativeDay(date, today)
  return day === 'hoje' || day === 'ontem' ? day : `em ${day}`
}

function PainRow({ pain, date, today }: { pain: Pain; date: DayKey; today: DayKey }) {
  const toast = useToast()
  const score = scoreOn(pain, date) ?? 1
  const from = scoreDay(pain, date)
  const own = from === date
  const since = pain.start === date ? (date === today ? 'começou hoje' : 'começou neste dia') : `desde ${formatDay(pain.start, "d 'de' MMM")}`

  async function onRemove() {
    const undo = await removePain(pain, date)
    toast({
      message: date <= pain.start ? `Dor apagada: ${pain.name}` : `${pain.name}: terminou ${onDay(shiftDay(date, -1), today)}`,
      action: { label: 'Desfazer', onClick: () => void undo() },
    })
  }

  return (
    <li className="flex items-center gap-1 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium first-letter:uppercase">{pain.name}</p>
        <p className="truncate text-xs text-muted">
          {since} · {own || !from ? intensity(score) : `nota de ${relativeDay(from, today)}`}
        </p>
      </div>
      <IconButton label={`Diminuir a nota de ${pain.name}`} className="size-9" disabled={score <= 1} onClick={() => void setPainScore(pain, date, score - 1)}>
        <Minus size={16} />
      </IconButton>
      {/* A score carried from an earlier day shows lighter, until it's changed. */}
      <span className="w-12 text-center tabular-nums">
        <span className={cx('text-lg font-semibold', !own && 'text-muted')}>{score}</span>
        <span className="text-xs text-muted">/10</span>
        {!own && <span className="sr-only"> (repetida)</span>}
      </span>
      <IconButton label={`Aumentar a nota de ${pain.name}`} className="size-9" disabled={score >= 10} onClick={() => void setPainScore(pain, date, score + 1)}>
        <Plus size={16} />
      </IconButton>
      <IconButton label={`Remover ${pain.name}`} className="size-9" onClick={() => void onRemove()}>
        <X size={16} />
      </IconButton>
    </li>
  )
}

/** What hurts, in the user's words (with the earlier ones offered), and how much from 1 to 10. */
function AddPain({ pains, date, onDone }: { pains: Pain[]; date: DayKey; onDone: () => void }) {
  const [name, setName] = useState('')
  const [score, setScore] = useState<number>()
  const suggestions = painSuggestions(pains, date, name)
  const valid = name.trim() !== '' && score !== undefined

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    await addPain(name, score, date)
    onDone()
  }

  return (
    <form onSubmit={submit} className="mb-3 space-y-3 rounded-xl bg-surface-2 p-3">
      <Field label="O que dói?">
        <TextInput
          autoFocus
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: canela direita ao correr"
        />
      </Field>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Dores de antes">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setName(suggestion)}
              className="rounded-full bg-surface px-3 py-1 text-sm text-ink-2 transition hover:text-ink"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <div>
        <p className="mb-1 flex items-baseline justify-between text-sm font-medium text-ink-2">
          Quanto dói
          <span className="text-xs font-normal text-muted">{score ? `${score} · ${intensity(score)}` : 'de 1 a 10'}</span>
        </p>
        <div role="radiogroup" aria-label="Quanto dói, de 1 a 10" className="grid grid-cols-5 gap-1.5">
          {SCORES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === score}
              onClick={() => setScore(value)}
              className={cx(
                'h-10 rounded-lg text-sm font-semibold tabular-nums transition',
                value === score ? 'bg-accent text-white' : 'bg-surface text-ink-2',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>
          Adicionar
        </Button>
      </div>
    </form>
  )
}
