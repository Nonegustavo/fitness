import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, Field, Select, TextInput } from '../../components/ui'
import { remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Equipment, Exercise, ExerciseType, MuscleGroup } from '../../db/types'
import { EQUIPMENT, EXERCISE_TYPES, MUSCLES } from './catalog'

export function ExerciseForm({
  exercise,
  initialName = '',
  onClose,
  onSaved,
}: {
  exercise: Exercise | null
  initialName?: string
  onClose: () => void
  onSaved?: (exercise: Exercise) => void
}) {
  const [name, setName] = useState(exercise?.name ?? initialName)
  const [muscle, setMuscle] = useState<MuscleGroup>(exercise?.muscle ?? 'chest')
  const [equipment, setEquipment] = useState<Equipment>(exercise?.equipment ?? 'machine')
  const [type, setType] = useState<ExerciseType>(exercise?.type ?? 'weight_reps')
  const [notes, setNotes] = useState(exercise?.notes ?? '')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    const saved = await save(db.exercises, {
      id: exercise?.id,
      name: name.trim(),
      muscle,
      equipment,
      type,
      notes: notes.trim() || undefined,
    })
    onSaved?.(saved)
    onClose()
  }

  async function onDelete() {
    if (!exercise) return
    // Past workouts keep showing the name: deleted exercises stay in the local table.
    await remove(db.exercises, exercise.id)
    onClose()
  }

  return (
    <Modal open title={exercise ? 'Editar exercício' : 'Novo exercício'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Remada máquina" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Grupo muscular">
            <Select value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleGroup)}>
              {Object.entries(MUSCLES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Equipamento">
            <Select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
              {Object.entries(EQUIPMENT).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Como registrar">
          <Select value={type} onChange={(e) => setType(e.target.value as ExerciseType)}>
            {Object.entries(EXERCISE_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Observações">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </Field>
        <div className="flex gap-2">
          {exercise && (
            <Button variant="danger" onClick={() => void onDelete()}>
              <Trash2 size={16} /> Excluir
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" disabled={!name.trim()}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
