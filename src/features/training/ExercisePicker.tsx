import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button, cx, Empty, TextInput } from '../../components/ui'
import type { Exercise, MuscleGroup } from '../../db/types'
import { EQUIPMENT, MUSCLES } from './catalog'
import { ExerciseForm } from './ExerciseForm'
import { useExercises } from './training'

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export type MuscleFilter = MuscleGroup | 'all'

export function filterExercises(exercises: Exercise[], query: string, muscle: MuscleFilter): Exercise[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  return exercises.filter(
    (exercise) =>
      (muscle === 'all' || exercise.muscle === muscle) &&
      words.every((word) => normalize(exercise.name).includes(word)),
  )
}

/** Horizontal chips for the muscle groups present in the library. */
export function MuscleChips({
  exercises,
  value,
  onChange,
}: {
  exercises: Exercise[]
  value: MuscleFilter
  onChange: (value: MuscleFilter) => void
}) {
  const present = (Object.keys(MUSCLES) as MuscleGroup[]).filter((m) => exercises.some((e) => e.muscle === m))
  const chip = (key: MuscleFilter, label: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={value === key}
      onClick={() => onChange(key)}
      className={cx(
        'h-8 shrink-0 rounded-full px-3 text-sm whitespace-nowrap transition',
        value === key ? 'bg-ink text-plane' : 'bg-surface-2 text-ink-2 hover:text-ink',
      )}
    >
      {label}
    </button>
  )
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {chip('all', 'Todos')}
      {present.map((muscle) => chip(muscle, MUSCLES[muscle]))}
    </div>
  )
}

export function ExercisePicker({ onClose, onPick }: { onClose: () => void; onPick: (ids: string[]) => void }) {
  const exercises = useExercises() ?? []
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<MuscleFilter>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const filtered = filterExercises(exercises, query, muscle)

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  return (
    <Modal open title="Adicionar exercícios" onClose={onClose}>
      <div className="space-y-2">
        <TextInput
          type="search"
          autoFocus
          placeholder="Buscar exercício"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <MuscleChips exercises={exercises} value={muscle} onChange={setMuscle} />
      </div>
      <ul className="mt-2 max-h-[45dvh] divide-y divide-line overflow-y-auto">
        {filtered.map((exercise) => {
          const checked = selected.includes(exercise.id)
          return (
            <li key={exercise.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={exercise.name}
                onClick={() => toggle(exercise.id)}
                className="flex w-full items-center gap-3 py-2 text-left"
              >
                <span
                  className={cx(
                    'flex size-6 shrink-0 items-center justify-center rounded-md border',
                    checked ? 'border-accent bg-accent text-white' : 'border-baseline',
                  )}
                >
                  {checked && <Check size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{exercise.name}</span>
                  <span className="block text-xs text-muted">
                    {MUSCLES[exercise.muscle]} · {EQUIPMENT[exercise.equipment]}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {filtered.length === 0 && <Empty>Nenhum exercício encontrado.</Empty>}
      <div className="mt-3 flex gap-2">
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Criar
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={selected.length === 0}
          onClick={() => {
            onPick(selected)
            onClose()
          }}
        >
          Adicionar{selected.length > 0 && ` (${selected.length})`}
        </Button>
      </div>
      {creating && (
        <ExerciseForm
          exercise={null}
          initialName={query}
          onClose={() => setCreating(false)}
          onSaved={(exercise) => setSelected((current) => [...current, exercise.id])}
        />
      )}
    </Modal>
  )
}
