import { useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import { cx, DecimalInput, Field, TextInput } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { updateSettings } from '../../db/settings'
import type { Exercise, GymSetup, WorkoutSession } from '../../db/types'
import { formatNumber, parseDecimal } from '../../lib/format'
import { EQUIPMENT, MUSCLES } from './catalog'
import { DEFAULT_GYM, PLATE_OPTIONS, platesPerSide } from './stats'

/** Plate colors as in most gyms (competition colors for the big ones, gray for the small). */
function plateStyle(kg: number): { background: string; color: string } {
  if (kg >= 25) return { background: '#d03b3b', color: '#fff' }
  if (kg >= 20) return { background: '#2a78d6', color: '#fff' }
  if (kg >= 15) return { background: '#e9a23b', color: '#111' }
  if (kg >= 10) return { background: '#16a34a', color: '#fff' }
  if (kg >= 5) return { background: '#e5e4df', color: '#111' }
  return { background: '#6b6a66', color: '#fff' }
}

const kg = (value: number) => `${formatNumber(value, 2)} kg`

/** What to put on each side of the bar for a load, with the gym's own bar and plates. */
export function PlatesModal({ initialKg, onClose }: { initialKg?: number; onClose: () => void }) {
  const settings = useSettings()
  const gym = settings.gym ?? DEFAULT_GYM
  const [totalText, setTotalText] = useState(initialKg ? formatNumber(initialKg, 2) : '')
  const [barText, setBarText] = useState(formatNumber(gym.barKg, 2))
  const total = parseDecimal(totalText)
  const bar = parseDecimal(barText) ?? gym.barKg
  const load = total !== undefined && total > 0 ? platesPerSide(total, bar, gym.plates) : undefined
  const reached = load && bar + 2 * load.perSide.reduce((sum, plate) => sum + plate, 0)

  // From the gym as stored: two plates tapped one right after the other both stay.
  const saveGym = (change: (stored: GymSetup) => Partial<GymSetup>) =>
    void updateSettings((settings) => {
      const stored = settings.gym ?? DEFAULT_GYM
      return { gym: { ...stored, ...change(stored) } }
    })
  const togglePlate = (plate: number) =>
    saveGym(({ plates }) => ({
      plates: plates.includes(plate) ? plates.filter((p) => p !== plate) : [...plates, plate].sort((a, b) => b - a),
    }))

  return (
    <Modal open title="Anilhas" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Carga total (kg)">
          <DecimalInput autoFocus value={totalText} onChange={(e) => setTotalText(e.target.value)} />
        </Field>
        <Field label="Barra (kg)">
          <DecimalInput
            value={barText}
            onChange={(e) => setBarText(e.target.value)}
            onBlur={() => {
              const value = parseDecimal(barText)
              if (value !== undefined && value >= 0 && value !== gym.barKg) saveGym(() => ({ barKg: value }))
            }}
          />
        </Field>
      </div>

      {load && (
        <div className="mt-4 rounded-xl bg-surface-2 p-4">
          <p className="text-sm text-ink-2">Em cada lado da barra</p>
          {load.perSide.length === 0 ? (
            <p className="mt-1 text-lg font-semibold">Só a barra</p>
          ) : (
            <>
              <div className="mt-3 flex items-center" aria-hidden>
                <span className="h-3 w-10 rounded-l-full bg-baseline" />
                {load.perSide.map((plate, i) => (
                  <span
                    key={i}
                    className="-ml-px flex w-7 items-center justify-center rounded-md text-[10px] font-semibold"
                    style={{ ...plateStyle(plate), height: `${Math.round(28 + plate * 2.4)}px` }}
                  >
                    {formatNumber(plate, 2)}
                  </span>
                ))}
                <span className="h-3 w-4 rounded-r-full bg-baseline" />
              </div>
              <p className="mt-3 text-lg font-semibold tabular-nums">
                {load.perSide.map((plate) => formatNumber(plate, 2)).join(' + ')} kg
              </p>
            </>
          )}
          {load.missing > 0 && reached !== undefined && (
            <p className="mt-1 text-xs text-critical">
              Não fecha com essas anilhas: o mais perto é {kg(reached)} (faltam {kg(load.missing)} por lado).
            </p>
          )}
        </div>
      )}

      <p className="mt-4 mb-2 text-sm font-medium text-ink-2">Anilhas que a academia tem</p>
      <div className="flex flex-wrap gap-2">
        {PLATE_OPTIONS.map((plate) => {
          const on = gym.plates.includes(plate)
          return (
            <button
              key={plate}
              type="button"
              aria-pressed={on}
              onClick={() => togglePlate(plate)}
              className={cx(
                'h-9 min-w-12 rounded-full border px-3 text-sm tabular-nums transition',
                on ? 'border-transparent bg-accent text-white' : 'border-line text-ink-2 hover:text-ink',
              )}
            >
              {formatNumber(plate, 2)}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

/**
 * Another exercise for the same muscle, when the machine is taken: the ones used most come first;
 * typing searches every exercise.
 */
export function SwapModal({
  current,
  exercises,
  sessions,
  onPick,
  onClose,
}: {
  current: Exercise
  exercises: Exercise[]
  sessions: WorkoutSession[]
  onPick: (exerciseId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const uses = useMemo(() => {
    const counts = new Map<string, number>()
    for (const session of sessions) for (const e of session.exercises) counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1)
    return counts
  }, [sessions])
  const words = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  const matches = (exercise: Exercise) => {
    const name = exercise.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return words.every((word) => name.includes(word))
  }
  const options = exercises
    .filter((exercise) => exercise.id !== current.id && (words.length > 0 ? matches(exercise) : exercise.muscle === current.muscle))
    .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 40)

  return (
    <Modal open title={`Trocar ${current.name}`} onClose={onClose}>
      <TextInput
        type="search"
        placeholder={`Outros de ${MUSCLES[current.muscle].toLowerCase()}, ou busque`}
        aria-label="Buscar exercício para trocar"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="mt-2 text-xs text-muted">As séries que faltam passam para o novo exercício; as já feitas ficam com este.</p>
      <ul className="scroll-fade-y mt-2 max-h-[50dvh] divide-y divide-line overflow-y-auto">
        {options.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              onClick={() => onPick(exercise.id)}
              className="flex w-full items-center gap-3 py-2.5 text-left hover:text-accent-ink"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{exercise.name}</span>
                <span className="block text-xs text-muted">
                  {MUSCLES[exercise.muscle]} · {EQUIPMENT[exercise.equipment]}
                </span>
              </span>
              {(uses.get(exercise.id) ?? 0) > 0 && (
                <span className="shrink-0 text-xs text-muted">{uses.get(exercise.id)}× feito</span>
              )}
            </button>
          </li>
        ))}
        {options.length === 0 && <li className="py-6 text-center text-sm text-muted">Nenhum exercício encontrado.</li>}
      </ul>
    </Modal>
  )
}
