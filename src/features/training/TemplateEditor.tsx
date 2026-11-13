import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, Flame, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Confirm } from '../../components/Modal'
import { SortableList } from '../../components/Sortable'
import {
  Button,
  Card,
  clockHint,
  clockHintIfDifferent,
  cx,
  DecimalInput,
  Empty,
  Field,
  IconButton,
  Page,
  Switch,
  TextInput,
} from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { patch, remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Exercise, ExerciseType, GymSetup, PlannedSet, SetKind, WorkoutSession, WorkoutTemplate } from '../../db/types'
import { formatClock, parseClock, parseDecimal } from '../../lib/format'
import { newId } from '../../lib/ids'
import { EQUIPMENT, MUSCLES } from './catalog'
import { ExercisePicker } from './ExercisePicker'
import { DEFAULT_GYM, LOAD_STEP, lastPerformance } from './stats'
import { DEFAULT_REST_SEC, DEFAULT_WARMUP_REST_SEC, useExerciseMap, useSessions, useTemplates } from './training'
import { replaceWarmups, suggestWarmup, type WarmupSet } from './warmup'
import { WarmupPreview } from './WarmupPreview'

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
  /** The rest after a warm-up set. */
  warmupRest: string
  notes: string
  sets: DraftSet[]
  /** Bi-set with the next exercise. */
  superset: boolean
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

const draftWarmup = ({ weightKg, reps }: WarmupSet): DraftSet => ({
  key: newId(),
  kind: 'warmup',
  reps: String(reps),
  repsMax: '',
  weight: asText(weightKg),
  duration: '',
})

/** The first working set's load the last time the exercise was done. */
const lastLoad = (sessions: WorkoutSession[] | undefined, exerciseId: string): number | undefined =>
  lastPerformance(sessions ?? [], exerciseId, Infinity)?.exercise.sets.find((set) => set.done && set.kind === 'normal')
    ?.weightKg

const newDraftExercise = (exerciseId: string): DraftExercise => ({
  key: newId(),
  exerciseId,
  rest: formatClock(DEFAULT_REST_SEC),
  warmupRest: formatClock(DEFAULT_WARMUP_REST_SEC),
  notes: '',
  sets: [newDraftSet(), newDraftSet(), newDraftSet()],
  superset: false,
})

function toDraft(template: WorkoutTemplate): Draft {
  return {
    name: template.name,
    notes: template.notes ?? '',
    exercises: template.exercises.map((exercise) => ({
      key: exercise.key,
      exerciseId: exercise.exerciseId,
      rest: formatClock(exercise.restSec),
      warmupRest: formatClock(exercise.warmupRestSec ?? DEFAULT_WARMUP_REST_SEC),
      notes: exercise.notes ?? '',
      superset: !!exercise.supersetWithNext,
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
  // The route stays mounted when only the id changes: keyed by it, the form starts over for another
  // template instead of carrying the first one's draft into it.
  return <TemplateForm key={id} id={id} />
}

function TemplateForm({ id }: { id: string }) {
  const isNew = id === 'nova'
  const navigate = useNavigate()
  // null = not found; undefined = still loading.
  const template = useLiveQuery(async () => (isNew ? null : ((await db.workoutTemplates.get(id)) ?? null)), [id, isNew])
  const templates = useTemplates()
  const exercises = useExerciseMap()
  const sessions = useSessions()
  const gym = useSettings().gym ?? DEFAULT_GYM
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

  async function onSave() {
    if (!draft?.name.trim()) return
    const nextOrder = templates?.length ? Math.max(...templates.map((t) => t.order)) + 1 : 0
    await save(db.workoutTemplates, {
      id: isNew ? undefined : id,
      name: draft.name.trim(),
      notes: draft.notes.trim() || undefined,
      order: template?.order ?? nextOrder,
      archived: template?.archived,
      exercises: draft.exercises.map((exercise, i) => {
        const type = exercises.get(exercise.exerciseId)?.type ?? 'weight_reps'
        return {
          key: exercise.key,
          exerciseId: exercise.exerciseId,
          restSec: parseClock(exercise.rest) ?? DEFAULT_REST_SEC,
          warmupRestSec: parseClock(exercise.warmupRest) ?? DEFAULT_WARMUP_REST_SEC,
          notes: exercise.notes.trim() || undefined,
          sets: exercise.sets.map((set) => toPlannedSet(set, type)),
          // The last exercise has no next one to pair with.
          supersetWithNext: exercise.superset && i < draft.exercises.length - 1 ? true : undefined,
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
      {draft.exercises.length > 0 && (
        <SortableList
          as="div"
          className="space-y-4"
          itemClassName="rounded-2xl"
          items={draft.exercises}
          getId={(exercise) => exercise.key}
          onReorder={(list) => update((current) => ({ ...current, exercises: list }))}
        >
          {(exercise, handle) => (
            <ExerciseEditor
              exercise={exercise}
              info={exercises.get(exercise.exerciseId)}
              index={draft.exercises.indexOf(exercise)}
              isLast={draft.exercises.indexOf(exercise) === draft.exercises.length - 1}
              nextName={exercises.get(draft.exercises[draft.exercises.indexOf(exercise) + 1]?.exerciseId ?? '')?.name}
              lastKg={lastLoad(sessions, exercise.exerciseId)}
              gym={gym}
              handle={handle}
              onChange={(change) => updateExercise(exercise.key, change)}
              onRemove={() =>
                update((current) => ({ ...current, exercises: current.exercises.filter((e) => e.key !== exercise.key) }))
              }
            />
          )}
        </SortableList>
      )}

      <Button className="w-full" onClick={() => setPicking(true)}>
        <Plus size={18} /> Adicionar exercícios
      </Button>
      <div className="flex gap-2">
        {!isNew && (
          <Button variant="ghost" className="text-critical" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Excluir
          </Button>
        )}
        {template && (
          // Changes still unsaved in the form stay there; only the archive flag is written.
          <Button
            variant="ghost"
            title={template.archived ? 'Volta para o rodízio de fichas' : 'Sai do rodízio, mas continua guardada'}
            onClick={() => void patch(db.workoutTemplates, template.id, { archived: template.archived ? 0 : 1 })}
          >
            {template.archived ? (
              <>
                <ArchiveRestore size={16} /> Desarquivar
              </>
            ) : (
              <>
                <Archive size={16} /> Arquivar
              </>
            )}
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
  isLast,
  nextName,
  lastKg,
  gym,
  handle,
  onChange,
  onRemove,
}: {
  exercise: DraftExercise
  info: Exercise | undefined
  index: number
  isLast: boolean
  /** The exercise after this one, for the bi-set. */
  nextName?: string
  /** The first working set's load last time, for the warm-up when the template has none. */
  lastKg?: number
  gym: GymSetup
  /** The grip that drags the exercise to another position. */
  handle: ReactNode
  onChange: (change: (exercise: DraftExercise) => DraftExercise) => void
  onRemove: () => void
}) {
  const [warming, setWarming] = useState(false)
  const type = info?.type ?? 'weight_reps'
  // The warm-up climbs to the first working set's load, or last time's.
  const canWarm = type === 'weight_reps' && !!info && LOAD_STEP[info.equipment] > 0
  const firstWorking = exercise.sets.find((set) => set.kind === 'normal')
  const workKg = (firstWorking && parseDecimal(firstWorking.weight)) ?? lastKg
  const warmup = warming && canWarm && info && workKg !== undefined ? suggestWarmup(workKg, info.equipment, gym) : []
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
      <div className="-ml-2 flex items-start gap-1">
        {handle}
        <div className="min-w-0 flex-1 pt-1.5">
          <p className="font-medium">
            {index + 1}. {info?.name ?? 'Exercício removido'}
          </p>
          {info && (
            <p className="text-xs text-muted">
              {MUSCLES[info.muscle]} · {EQUIPMENT[info.equipment]}
            </p>
          )}
        </div>
        <IconButton label="Remover exercício" onClick={onRemove}>
          <Trash2 size={16} />
        </IconButton>
      </div>

      {/* On a phone the note goes under the two rests; wider, all three share the line. */}
      <div className="mt-3 grid grid-cols-[6.5rem_1fr] gap-3 sm:grid-cols-[6.5rem_auto_1fr]">
        <Field label="Descanso" hint={clockHint(exercise.rest) ?? 'min:seg'}>
          <TextInput
            inputMode="numeric"
            value={exercise.rest}
            onChange={(e) => onChange((current) => ({ ...current, rest: e.target.value }))}
            placeholder="1:30"
          />
        </Field>
        <Field label="Descanso do aquecimento" hint={clockHint(exercise.warmupRest) ?? 'min:seg'}>
          <TextInput
            className="max-w-[6.5rem]"
            inputMode="numeric"
            value={exercise.warmupRest}
            onChange={(e) => onChange((current) => ({ ...current, warmupRest: e.target.value }))}
            placeholder={formatClock(DEFAULT_WARMUP_REST_SEC)}
          />
        </Field>
        <div className="col-span-2 sm:col-span-1">
          <Field label="Observação">
            <TextInput
              value={exercise.notes}
              onChange={(e) => onChange((current) => ({ ...current, notes: e.target.value }))}
              placeholder="Ex.: pegada fechada"
            />
          </Field>
        </div>
      </div>
      {!isLast && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm">Bi-set com o próximo</span>
            <span className="block truncate text-xs text-muted">
              {nextName ? `Alterna com ${nextName}; o descanso vem depois do par` : 'O descanso vem depois do par'}
            </span>
          </span>
          <Switch
            label="Bi-set com o próximo"
            checked={exercise.superset}
            onChange={(on) => onChange((current) => ({ ...current, superset: on }))}
          />
        </div>
      )}

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
                <div className="min-w-0">
                  <TextInput
                    className="h-9 px-2 text-center"
                    inputMode="numeric"
                    placeholder="0:45"
                    aria-label="Tempo"
                    value={set.duration}
                    onChange={(e) => setSet(set.key, { duration: e.target.value })}
                    onBlur={() => {
                      // Written back as it was read ("130" becomes "2:10"), which also takes the hint away.
                      const seconds = parseClock(set.duration)
                      if (seconds !== undefined) setSet(set.key, { duration: formatClock(seconds) })
                    }}
                  />
                  {clockHintIfDifferent(set.duration) && (
                    <span className="mt-0.5 block text-center text-xs text-muted">
                      {clockHintIfDifferent(set.duration)}
                    </span>
                  )}
                </div>
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
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onChange((current) => ({ ...current, sets: [...current.sets, newDraftSet('normal', current.sets.at(-1))] }))
            }
          >
            <Plus size={16} /> Série
          </Button>
          {canWarm && (
            <Button size="sm" variant="ghost" onClick={() => setWarming(true)}>
              <Flame size={16} /> Gerar aquecimento
            </Button>
          )}
        </div>
        {warming && canWarm && (
          <WarmupPreview
            workKg={workKg}
            warmup={warmup}
            onClose={() => setWarming(false)}
            onUse={() => {
              setWarming(false)
              onChange((current) => ({ ...current, sets: replaceWarmups(current.sets, warmup.map(draftWarmup)) }))
            }}
          />
        )}
        <p className="text-xs text-muted">Toque no número da série para marcá-la como aquecimento (A).</p>
      </div>
    </Card>
  )
}
