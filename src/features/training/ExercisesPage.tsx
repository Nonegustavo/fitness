import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, Empty, Page, SkeletonCard, TextInput } from '../../components/ui'
import { useNewFromLink } from '../../components/useNewFromLink'
import type { MuscleGroup } from '../../db/types'
import { EQUIPMENT, MUSCLES } from './catalog'
import { ExerciseForm } from './ExerciseForm'
import { filterExercises, MuscleChips, type MuscleFilter } from './ExercisePicker'
import { useExercises } from './training'

export default function ExercisesPage() {
  const exercises = useExercises()
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<MuscleFilter>('all')
  const [creating, setCreating] = useState(false)
  useNewFromLink('exercicio', () => setCreating(true))
  if (!exercises) {
    return (
      <Page title="Exercícios" back={{ to: '/treinos', label: 'Treinos' }}>
        <SkeletonCard lines={8} />
      </Page>
    )
  }

  const filtered = filterExercises(exercises, query, muscle)
  const groups = (Object.keys(MUSCLES) as MuscleGroup[])
    .map((group) => [group, filtered.filter((exercise) => exercise.muscle === group)] as const)
    .filter(([, list]) => list.length > 0)

  return (
    <Page
      title="Exercícios"
      subtitle={`${exercises.length} na biblioteca`}
      back={{ to: '/treinos', label: 'Treinos' }}
      actions={
        <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> Novo
        </Button>
      }
    >
      <div className="space-y-2">
        <TextInput
          type="search"
          placeholder="Buscar exercício"
          aria-label="Buscar exercício"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <MuscleChips exercises={exercises} value={muscle} onChange={setMuscle} />
      </div>

      {groups.map(([group, list]) => (
        <Card key={group} title={MUSCLES[group]}>
          <ul className="divide-y divide-line">
            {list.map((exercise) => (
              <li key={exercise.id}>
                <Link
                  to={`/treinos/exercicios/${exercise.id}`}
                  className="flex items-center justify-between gap-3 py-2 hover:text-accent-ink"
                >
                  <span className="truncate text-sm">{exercise.name}</span>
                  <span className="shrink-0 text-xs text-muted">{EQUIPMENT[exercise.equipment]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {groups.length === 0 && (
        <Card>
          <Empty>Nenhum exercício encontrado.</Empty>
        </Card>
      )}

      {creating && <ExerciseForm exercise={null} initialName={query} onClose={() => setCreating(false)} />}
    </Page>
  )
}
