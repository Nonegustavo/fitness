import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Confirm } from '../../components/Modal'
import { Button, Card, cx, DecimalInput, Empty, Field, IconButton, Page, TextInput } from '../../components/ui'
import { remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Exercise, ExerciseType, PlannedSet, SetKind, WorkoutTemplate } from '../../db/types'
import { formatClock, parseClock, parseDecimal } from '../../lib/format'
import { newId } from '../../lib/ids'
import { EQUIPMENT, MUSCLES } from './catalog'
import { ExercisePicker } from './ExercisePicker'
import { DEFAULT_REST_SEC, useExerciseMap, useTemplates } from './training'

// The form keeps numbers as typed ("62,5") and parses them on save.
interface DraftSet {
  key: string
  kind: SetKind
  reps: string
  repsMax: string
  weight: string
  duration: string
}

interface DraftExercise {
  key: string
  exerciseId: string
  rest: string
  notes: string
  sets: DraftSet[]
}

interface Draft {
  name: string
  notes: string
  exercises: DraftExercise[]
}

const asText = (value?: number) => (value === undefined ? '' : String(value).replace('.', ','))
const parseCount = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined)

const newDraftSet = (kind: SetKind = 'normal', from?: DraftSet): DraftSet => ({
  key: newId(),
  kind,
  reps: from?.reps ?? '8',
  repsMax: from?.repsMax ?? '12',
  weight: from?.weight ?? '',
  duration: from?.duration ?? '',
})

const newDraftExercise = (exerciseId: string): DraftExercise => ({
  key: newId(),
  exerciseId,
  rest: formatClock(DEFAULT_REST_SEC),
  notes: '',
  sets: [newDraftSet(), newDraftSet(), newDraftSet()],
})

function toDraft(template: WorkoutTemplate): Draft {
  return {
    name: template.name,
    notes: template.notes ?? '',
    exercises: template.exercises.map((exercise) => ({
      key: exercise.key,
      exerciseId: exercise.exerciseId,
      rest: formatClock(exercise.restSec),
      notes: exercise.notes ?? '',
      sets: exercise.sets.map((set) => ({
        key: newId(),
        kind: set.kind,
        reps: asText(set.reps),
        repsMax: asText(set.repsMax),
        weight: asText(set.weightKg),
        duration: set.durationSec === undefined ? '' : formatClock(set.durationSec),
      })),
    })),
  }
}

function toPlannedSet(set: DraftSet, type: ExerciseType): PlannedSet {
  if (type === 'time') return { kind: set.kind, durationSec: parseClock(set.duration) }
  const reps = parseCount(set.reps)
  const repsMax = parseCount(set.repsMax)
  return {
    kind: set.kind,
    reps,
    repsMax: repsMax !== undefined && (reps === undefined || repsMax > reps) ? repsMax : undefined,
    weightKg: type === 'weight_reps' ? parseDecimal(set.weight) : undefined,
  }
}

export default function TemplateEditor() {
  const { id = 'nova' } = useParams()
  const isNew = id === 'nova'
  const navigate = useNavigate()
  // null = not found; undefined = still loading.
  const template = useLiveQuery(async () => (isNew ? null : ((await db.workoutTemplates.get(id)) ?? null)), [id, isNew])
  const templates = useTemplates()
  const exercises = useExerciseMap()
  const [draft, setDraft] = useState<Draft | null>(isNew ? { name: '', notes: '', exercises: [] } : null)
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!draft && template) setDraft(toDraft(template))
  }, [draft, template])

  const back = { to: '/treinos', label: 'Treinos' }
  if (!isNew && (template === null || template?.deleted)) {
    return (
      <Page title="Ficha" back={back}>
        <Card>
          <Empty>Ficha não encontrada.</Empty>
        </Card>
      </Page>
    )
  }
  if (!draft) return null

  const update = (change: (current: Draft) => Draft) => setDraft((current) => current && change(current))
  const updateExercise = (key: string, change: (exercise: DraftExercise) => DraftExercise) =>
    update((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => (exercise.key === key ? change(exercise) : exercise)),
    }))

  function move(index: number, delta: number) {
    update((current) => {
      const list = [...current.exercises]
      const [item] = list.splice(index, 1)
      list.splice(index + delta, 0, item)
      return { ...current, exercises: list }
    })
  }

  async function onSave() {
    if (!draft?.name.trim()) return
    const nextOrder = templates?.length ? Math.max(...templates.map((t) => t.order)) + 1 : 0
    await save(db.workoutTemplates, {
      id: isNew ? undefined : id,
      name: draft.name.trim(),
      notes: draft.notes.trim() || undefined,
      order: template?.order ?? nextOrder,
      exercises: draft.exercises.map((exercise) => {
        const type = exercises.get(exercise.exerciseId)?.type ?? 'weight_reps'
        return {
          key: exercise.key,
          exerciseId: exercise.exerciseId,
          restSec: parseClock(exercise.rest) ?? DEFAULT_REST_SEC,
          notes: exercise.notes.trim() || undefined,
          sets: exercise.sets.map((set) => toPlannedSet(set, type)),
        }
      }),
    })
    navigate('/treinos')
  }

  return (
    <Page
      title={isNew ? 'Nova ficha' : 'Editar ficha'}
      back={back}
      actions={
        <Button variant="primary" disabled={!draft.name.trim()} onClick={() => void onSave()}>
          Salvar
        </Button>
      }
    >
      <Card>
        <div className="space-y-3">
          <Field label="Nome">
            <TextInput
              autoFocus={isNew}
              value={draft.name}
              onChange={(e) => update((current) => ({ ...current, name: e.target.value }))}
              placeholder="Ex.: Treino A · Peito e tríceps"
            />
          </Field>
          <Field label="Observações">
            <TextInput
              value={draft.notes}
              onChange={(e) => update((current) => ({ ...current, notes: e.target.value }))}
              placeholder="Opcional"
            />
          </Field>
        </div>
      </Card>

      {draft.exercises.length === 0 && (
        <Card>
          <Empty>Adicione os exercícios da ficha.</Empty>
        </Card>
      )}
      {draft.exercises.map((exercise, index) => (
        <ExerciseEditor
          key={exercise.key}
          exercise={exercise}
          info={exercises.get(exercise.exerciseId)}
          index={index}
          total={draft.exercises.length}
          onChange={(change) => updateExercise(exercise.key, change)}
          onMove={(delta) => move(index, delta)}
          onRemove={() =>
            update((current) => ({ ...current, exercises: current.exercises.filter((e) => e.key !== exercise.key) }))
          }
        />
      ))}

      <Button className="w-full" onClick={() => setPicking(true)}>
        <Plus size={18} /> Adicionar exercícios
      </Button>
      <div className="flex gap-2">
        {!isNew && (
          <Button variant="ghost" className="text-critical" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Excluir ficha
          </Button>
        )}
        <Button variant="primary" className="ml-auto" disabled={!draft.name.trim()} onClick={() => void onSave()}>
          Salvar
        </Button>
      </div>

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(ids) =>
            update((current) => ({ ...current, exercises: [...current.exercises, ...ids.map(newDraftExercise)] }))
          }
        />
      )}
      {confirmDelete && (
        <Confirm
          title="Excluir ficha?"
          message="Os treinos já feitos com ela continuam no histórico."
          confirmLabel="Excluir"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => void remove(db.workoutTemplates, id).then(() => navigate('/treinos'))}
        />
      )}
    </Page>
  )
}

function ExerciseEditor({
  exercise,
  info,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  exercise: DraftExercise
  info: Exercise | undefined
  index: number
  total: number
  onChange: (change: (exercise: DraftExercise) => DraftExercise) => void
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const type = info?.type ?? 'weight_reps'
  const columns =
    type === 'weight_reps'
      ? 'grid-cols-[2.5rem_1fr_1fr_1fr_2.5rem]'
      : type === 'reps'
        ? 'grid-cols-[2.5rem_1fr_1fr_2.5rem]'
        : 'grid-cols-[2.5rem_1fr_2.5rem]'
  const setSet = (key: string, change: Partial<DraftSet>) =>
    onChange((current) => ({ ...current, sets: current.sets.map((s) => (s.key === key ? { ...s, ...change } : s)) }))
  let normalCount = 0

  return (
    <Card>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {index + 1}. {info?.name ?? 'Exercício removido'}
          </p>
          {info && (
            <p className="text-xs text-muted">
              {MUSCLES[info.muscle]} · {EQUIPMENT[info.equipment]}
            </p>
          )}
        </div>
        <IconButton label="Mover para cima" disabled={index === 0} onClick={() => onMove(-1)}>
          <ChevronUp size={18} />
        </IconButton>
        <IconButton label="Mover para baixo" disabled={index === total - 1} onClick={() => onMove(1)}>
          <ChevronDown size={18} />
        </IconButton>
        <IconButton label="Remover exercício" onClick={onRemove}>
          <Trash2 size={16} />
        </IconButton>
      </div>

      <div className="mt-3 grid grid-cols-[6.5rem_1fr] gap-3">
        <Field label="Descanso" hint="min:seg">
          <TextInput
            inputMode="numeric"
            value={exercise.rest}
            onChange={(e) => onChange((current) => ({ ...current, rest: e.target.value }))}
            placeholder="1:30"
          />
        </Field>
        <Field label="Observação">
          <TextInput
            value={exercise.notes}
            onChange={(e) => onChange((current) => ({ ...current, notes: e.target.value }))}
            placeholder="Ex.: pegada fechada"
          />
        </Field>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className={cx('grid items-end gap-2 text-xs text-muted', columns)}>
          <span>Série</span>
          {type === 'time' ? (
            <span>Tempo</span>
          ) : (
            <>
              <span>Reps</span>
              <span>até</span>
            </>
          )}
          {type === 'weight_reps' && <span>Carga (kg)</span>}
          <span />
        </div>
        {exercise.sets.map((set) => {
          const warmup = set.kind === 'warmup'
          if (!warmup) normalCount++
          return (
            <div key={set.key} className={cx('grid items-center gap-2', columns)}>
              <button
                type="button"
                title="Tocar para alternar entre aquecimento e série válida"
                aria-label={warmup ? 'Série de aquecimento' : `Série ${normalCount}`}
                onClick={() => setSet(set.key, { kind: warmup ? 'normal' : 'warmup' })}
                className={cx(
                  'h-9 rounded-lg text-sm font-semibold',
                  warmup ? 'bg-surface-2 text-muted' : 'bg-surface-2 text-ink',
                )}
              >
                {warmup ? 'A' : normalCount}
              </button>
              {type === 'time' ? (
                <TextInput
                  className="h-9 px-2 text-center"
                  inputMode="numeric"
                  placeholder="0:45"
                  aria-label="Tempo"
                  value={set.duration}
                  onChange={(e) => setSet(set.key, { duration: e.target.value })}
                />
              ) : (
                <>
                  <TextInput
                    className="h-9 px-2 text-center"
                    inputMode="numeric"
                    aria-label="Repetições"
                    value={set.reps}
                    onChange={(e) => setSet(set.key, { reps: e.target.value })}
                  />
                  <TextInput
                    className="h-9 px-2 text-center"
                    inputMode="numeric"
                    aria-label="Até quantas repetições"
                    placeholder="—"
                    value={set.repsMax}
                    onChange={(e) => setSet(set.key, { repsMax: e.target.value })}
                  />
                </>
              )}
              {type === 'weight_reps' && (
                <DecimalInput
                  className="h-9 px-2 text-center"
                  aria-label="Carga em kg"
                  placeholder="—"
                  value={set.weight}
                  onChange={(e) => setSet(set.key, { weight: e.target.value })}
                />
              )}
              <IconButton
                label="Remover série"
                className="size-9"
                onClick={() =>
                  onChange((current) => ({ ...current, sets: current.sets.filter((s) => s.key !== set.key) }))
                }
              >
                <X size={16} />
              </IconButton>
            </div>
          )
        })}
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange((current) => ({ ...current, sets: [...current.sets, newDraftSet('normal', current.sets.at(-1))] }))
          }
        >
          <Plus size={16} /> Série
        </Button>
        <p className="text-xs text-muted">Toque no número da série para marcá-la como aquecimento (A).</p>
      </div>
    </Card>
  )
}
