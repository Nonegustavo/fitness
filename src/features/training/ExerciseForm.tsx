import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Confirm, Modal } from '../../components/Modal'
import { useRemoveWithUndo } from '../../components/SwipeToDelete'
import { Button, Field, Select, TextInput } from '../../components/ui'
import { remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Equipment, Exercise, ExerciseType, MuscleGroup } from '../../db/types'
import { EQUIPMENT, EXERCISE_TYPES, MUSCLES } from './catalog'
import { exerciseThumb, mediaIdOf, mediaLabel, noMedia } from './exerciseMedia'
import { MediaPicker, MediaThumb } from './HowTo'
import { useSessions, useTemplates } from './training'

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
  // The free-exercise-db exercise linked for the pictures and steps; saved with the rest.
  const [mediaId, setMediaId] = useState(exercise?.mediaId)
  const [picking, setPicking] = useState(false)
  const media = { id: exercise?.id ?? '', mediaId }
  const templates = useTemplates()
  const sessions = useSessions()
  const removeWithUndo = useRemoveWithUndo()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const uses = (list: { exercises: { exerciseId: string }[] }[] | undefined) =>
    list?.filter((item) => item.exercises.some((e) => e.exerciseId === exercise?.id)).length
  const inTemplates = uses(templates)
  const inSessions = uses(sessions)
  const linked = mediaIdOf(media)

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
      mediaId,
    })
    onSaved?.(saved)
    onClose()
  }

  // One never used goes at once, with "Desfazer"; one in a template or a past workout asks first. Still
  // loading counts as used.
  function onDelete() {
    if (!exercise) return
    if (inTemplates === 0 && inSessions === 0) {
      removeWithUndo(db.exercises, exercise.id, 'Exercício apagado')
      onClose()
    } else setConfirmDelete(true)
  }

  const usedIn = [
    inTemplates && (inTemplates === 1 ? '1 ficha' : `${inTemplates} fichas`),
    inSessions && (inSessions === 1 ? '1 treino' : `${inSessions} treinos`),
  ].filter(Boolean)

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
        <Field label="Fotos e passo a passo" group>
          <div className="flex items-center gap-3">
            <MediaThumb src={exerciseThumb(media)} className="h-10 w-14" />
            <span className="min-w-0 flex-1 truncate text-sm">
              {linked ? mediaLabel(linked) : <span className="text-muted">Nenhum</span>}
            </span>
            <Button size="sm" onClick={() => setPicking(true)}>
              {linked ? 'Trocar' : 'Vincular fotos'}
            </Button>
          </div>
        </Field>
        <div className="flex gap-2">
          {exercise && (
            <Button variant="danger" onClick={onDelete}>
              <Trash2 size={16} /> Apagar
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" disabled={!name.trim()}>
            Salvar
          </Button>
        </div>
      </form>
      {picking && (
        <MediaPicker
          query={name}
          current={linked}
          onClose={() => setPicking(false)}
          onPick={(next) => setMediaId(next ?? noMedia(exercise?.id))}
        />
      )}
      {/* Past workouts and templates keep showing the name: deleted exercises stay in the local table. */}
      {confirmDelete && exercise && (
        <Confirm
          title="Apagar exercício?"
          message={`${usedIn.length > 0 ? `${exercise.name} está em ${usedIn.join(' e ')}. ` : ''}Ele sai da lista de exercícios; os treinos já feitos e as fichas continuam mostrando o nome.`}
          confirmLabel="Apagar"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => void remove(db.exercises, exercise.id).then(onClose)}
        />
      )}
    </Modal>
  )
}
