import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeftRight,
  ArrowUpDown,
  Check,
  Disc3,
  Ellipsis,
  Flame,
  Heart,
  History,
  Link2,
  Minus,
  Plus,
  Trash2,
  TrendingUp,
  Trophy,
  Unlink2,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { celebrate } from '../../components/celebrate'
import { Confirm, Modal } from '../../components/Modal'
import { SortableList } from '../../components/Sortable'
import {
  Button,
  Card,
  clockHintIfDifferent,
  cx,
  DecimalInput,
  Empty,
  IconButton,
  Page,
  SkeletonCard,
  Stat,
  TextInput,
} from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { mutate } from '../../db/repo'
import { db } from '../../db/schema'
import type { Exercise, ExerciseType, PerformedSet, SessionExercise, WorkoutSession } from '../../db/types'
import { formatDay } from '../../lib/dates'
import { formatClock, formatDuration, formatNumber, parseClock, parseDecimal } from '../../lib/format'
import { setPeakHeartRates, useActivityStream, useWorkoutActivity } from '../activities/activities'
import { WorkoutWatchCard } from '../activities/WorkoutWatchCard'
import { ShareSessionButton } from '../activities/ShareButtons'
import { EQUIPMENT, formatComparison, formatE1rm, formatReps, formatSet, MUSCLES } from './catalog'
import { Elapsed } from './components'
import { ExercisePicker } from './ExercisePicker'
import { startRest, stopRest } from './restTimer'
import { checkedValues, previousSets } from './setValues'
import { RirPicker, RirToggle } from './RirPicker'
import { cancelSetTimer, completeSetTimer, startSetTimer, stopSetTimer, useSetTimer } from './setTimer'
import { SetTimerButton, SetTimerClock } from './SetTimerControls'
import { firstWorkingLoad, replaceWarmups, suggestWarmup, warmupSets } from './warmup'
import { WarmupPreview } from './WarmupPreview'
import { PlatesModal, SwapModal } from './GymTools'
import {
  compareSet,
  DEFAULT_GYM,
  LOAD_STEP,
  lastPerformance,
  loadSuggestion,
  personalRecords,
  setE1rm,
  summarize,
  type Performance,
  type SetComparison,
  type Trend,
} from './stats'
import {
  addSet,
  changeExercise,
  changeSet,
  completeSet,
  deleteWorkout,
  exerciseBlocks,
  finishWorkout,
  lastCheckedSet,
  matchTemplate,
  newSessionExercise,
  removeExercise,
  reorderExercises,
  restOf,
  restSecAfter,
  swapExercise,
  templateInOrder,
  updateSession,
  useExerciseMap,
  useSessions,
} from './training'
import { useWakeLock } from './wakeLock'
import { SessionFeedback } from './SessionFeedback'
import { tapFeedback } from '../../lib/haptics'

const asText = (value?: number) => (value === undefined ? '' : String(value).replace('.', ','))
const parseCount = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined)

export default function SessionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  // null = not found; undefined = still loading.
  const session = useLiveQuery(async () => (await db.workoutSessions.get(id)) ?? null, [id])
  const sessions = useSessions()
  const exercises = useExerciseMap()
  const [picking, setPicking] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [dialog, setDialog] = useState<'finish' | 'discard' | 'delete' | null>(null)
  const active = !!session && session.deleted === 0 && !session.endedAt
  useWakeLock(active)

  const history = useMemo(() => sessions ?? [], [sessions])
  const library = useMemo(() => [...exercises.values()], [exercises])
  const records = useMemo(
    () => (session && !active ? personalRecords(session, history) : new Set<string>()),
    [session, active, history],
  )
  // The Garmin activity recorded alongside, once its .FIT is imported.
  const watchActivity = useWorkoutActivity(session)
  const watchStream = useActivityStream(watchActivity?.id)
  const peaks = useMemo(
    () => (session && watchActivity && watchStream ? setPeakHeartRates(session, watchActivity, watchStream) : undefined),
    [session, watchActivity, watchStream],
  )

  const back = { to: '/treinos', label: 'Treinos' }
  if (session === undefined) {
    return (
      <Page title="Treino" back={back}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={5} />
      </Page>
    )
  }
  if (session === null || session.deleted) {
    return (
      <Page title="Treino" back={back}>
        <Card>
          <Empty>Treino não encontrado.</Empty>
        </Card>
      </Page>
    )
  }

  const summary = summarize(session)
  const pending = session.exercises.reduce((total, e) => total + e.sets.filter((set) => !set.done).length, 0)

  return (
    <Page
      title={session.name}
      back={back}
      subtitle={
        active ? (
          <>
            Em andamento · <Elapsed since={session.startedAt} />
          </>
        ) : (
          `${formatDay(session.date, "EEEE, d 'de' MMMM")} · ${formatDuration(summary.durationMs ?? 0)}`
        )
      }
      actions={
        active && (
          <Button variant="primary" onClick={() => setDialog('finish')}>
            <Check size={18} /> Finalizar
          </Button>
        )
      }
    >
      {!active && (
        <Card>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Duração" value={formatDuration(summary.durationMs ?? 0)} />
            <Stat label="Séries" value={summary.sets} />
            <Stat label="Volume" value={`${formatNumber(summary.volumeKg, 0)} kg`} />
          </div>
          {records.size > 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm">
              <Trophy size={16} className="text-accent-ink" />
              {records.size === 1 ? '1 recorde' : `${records.size} recordes`} de carga (1RM estimado)
            </p>
          )}
          {session.loggedLater && (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-2">
              <History size={16} className="shrink-0" aria-hidden /> Treino registrado depois: confira as séries.
            </p>
          )}
          <ShareSessionButton session={session} exercises={exercises} records={records} />
        </Card>
      )}

      {!active && <SessionFeedback session={session} />}

      {!active && watchActivity && (
        <WorkoutWatchCard session={session} activity={watchActivity} stream={watchStream} exercises={exercises} />
      )}

      {session.exercises.map((exercise) => (
        <ExerciseCard
          key={exercise.key}
          session={session}
          index={session.exercises.indexOf(exercise)}
          library={library}
          history={history}
          exercise={exercise}
          info={exercises.get(exercise.exerciseId)}
          last={lastPerformance(history, exercise.exerciseId, session.startedAt)}
          active={active}
          record={records.has(exercise.exerciseId)}
          peaks={peaks}
          onReorder={session.exercises.length > 1 ? () => setReordering(true) : undefined}
        />
      ))}
      {session.exercises.length === 0 && (
        <Card>
          <Empty>Nenhum exercício ainda.</Empty>
        </Card>
      )}

      <Button className="w-full" onClick={() => setPicking(true)}>
        <Plus size={18} /> Adicionar exercício
      </Button>
      {active ? (
        <Button variant="ghost" className="w-full" onClick={() => setDialog('discard')}>
          Descartar treino
        </Button>
      ) : (
        <Button variant="ghost" className="w-full text-critical" onClick={() => setDialog('delete')}>
          <Trash2 size={16} /> Excluir treino
        </Button>
      )}
      {/* Room for the rest timer, which floats over the bottom of the page. */}
      <div className="h-16" aria-hidden />

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(ids) =>
            void updateSession(session.id, (current) => ({
              ...current,
              exercises: [
                ...current.exercises,
                ...ids.map((exerciseId) => newSessionExercise(exerciseId, history, current.startedAt)),
              ],
            }))
          }
        />
      )}
      {reordering && <ReorderModal session={session} exercises={exercises} onClose={() => setReordering(false)} />}
      {dialog === 'finish' && (
        <Confirm
          title="Finalizar treino?"
          message={
            pending > 0
              ? `${pending === 1 ? '1 série não marcada será descartada' : `${pending} séries não marcadas serão descartadas`}.`
              : 'Todas as séries foram marcadas. Bom treino!'
          }
          confirmLabel="Finalizar"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            stopRest()
            cancelSetTimer(session.id)
            void finishWorkout(session.id).then(celebrate)
          }}
        />
      )}
      {(dialog === 'discard' || dialog === 'delete') && (
        <Confirm
          title={dialog === 'discard' ? 'Descartar treino?' : 'Excluir treino?'}
          message={dialog === 'discard' ? 'Nada deste treino será salvo.' : 'O treino sai do histórico.'}
          confirmLabel={dialog === 'discard' ? 'Descartar' : 'Excluir'}
          danger
          onClose={() => setDialog(null)}
          onConfirm={() => {
            stopRest()
            cancelSetTimer(session.id)
            void deleteWorkout(session.id).then(() => navigate('/treinos'))
          }}
        />
      )}
    </Page>
  )
}

function ExerciseCard({
  session,
  index,
  library,
  history,
  exercise,
  info,
  last,
  active,
  record,
  peaks,
  onReorder,
}: {
  session: WorkoutSession
  /** Its place in the workout, for the bi-sets. */
  index: number
  /** Every exercise, to swap this one for another. */
  library: Exercise[]
  history: WorkoutSession[]
  exercise: SessionExercise
  info: Exercise | undefined
  last: Performance | undefined
  active: boolean
  record: boolean
  /** Peak heart rate of each set (by key), from the watch. */
  peaks?: Map<string, number>
  /** Opens the reordering of the workout's exercises (with two or more). */
  onReorder?: () => void
}) {
  const [menu, setMenu] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [plates, setPlates] = useState(false)
  const [warming, setWarming] = useState(false)
  // Where the user moved the RIR picker, holding while the same set stays the one checked last.
  const [rirChoice, setRirChoice] = useState<{ key: string | null; after: string | undefined }>()
  const gym = useSettings().gym ?? DEFAULT_GYM
  const setPeaks = exercise.sets.flatMap((set) => {
    const peak = peaks?.get(set.key)
    return peak === undefined ? [] : [peak]
  })
  const type = info?.type ?? 'weight_reps'
  const update = (change: (exercise: SessionExercise) => SessionExercise | null) =>
    void updateSession(session.id, (current) => changeExercise(current, exercise.key, change))

  const suggestion = active && info && last ? loadSuggestion(last.exercise.sets, info.equipment) : undefined
  const canApply = exercise.sets.some((set) => set.kind === 'normal' && !set.done && set.weightKg !== suggestion?.weightKg)
  const lastWorking = last?.exercise.sets.filter((set) => set.done && set.kind === 'normal') ?? []

  // Pair each set with the same set (same kind, same position) from last time, as the notification does.
  const lastSets = previousSets(exercise.sets, last?.exercise)
  let normals = 0
  const rows = exercise.sets.map((set, i) => ({
    set,
    label: set.kind === 'warmup' ? 'A' : String(++normals),
    previous: lastSets[i],
  }))
  // A timed exercise in a workout running has a ▶ for each set, before the check.
  const timed = active && type === 'time'
  const columns =
    type === 'weight_reps'
      ? 'grid-cols-[1.75rem_minmax(0,1fr)_4.25rem_3.75rem_2.75rem]'
      : timed
        ? 'grid-cols-[1.75rem_minmax(0,1fr)_4.75rem_2.5rem_2.75rem]'
        : 'grid-cols-[1.75rem_minmax(0,1fr)_4.75rem_2.75rem]'

  // Bi-sets: this one and the next are done alternating, with the rest after the pair.
  const next = session.exercises[index + 1]
  const previous = session.exercises[index - 1]
  // A link left on the last exercise (its pair was dropped) pairs with nothing.
  const linked = !!exercise.supersetWithNext && !!next
  const inSuperset = linked || !!previous?.supersetWithNext
  const nameOf = (id: string) => library.find((e) => e.id === id)?.name ?? 'o próximo'
  const name = info?.name ?? 'Exercício removido'
  const hasWarmups = exercise.sets.some((set) => set.kind === 'warmup')
  // Warm-ups climb to a load: none at body weight or for timed exercises.
  const canWarm = active && type === 'weight_reps' && !!info && LOAD_STEP[info.equipment] > 0

  // The "⋯" sheet. Swapping and bi-sets are for a workout in progress; a finished one keeps the rest.
  const actions: (MenuAction | false | undefined)[] = [
    active && info && { label: 'Trocar exercício', icon: ArrowLeftRight, onClick: () => setSwapping(true) },
    active &&
      next && {
        label: linked ? 'Desfazer bi-set' : `Bi-set com ${nameOf(next.exerciseId)}`,
        detail: linked ? undefined : 'Uma série de cada, com o descanso depois do par',
        icon: linked ? Unlink2 : Link2,
        onClick: () => update((current) => ({ ...current, supersetWithNext: !current.supersetWithNext })),
      },
    { label: 'Adicionar série', icon: Plus, onClick: () => update((current) => addSet(current, 'normal')) },
    { label: 'Adicionar aquecimento', icon: Flame, onClick: () => update((current) => addSet(current, 'warmup')) },
    canWarm && {
      label: 'Sugerir aquecimento',
      detail: 'Séries leves até a carga da primeira série',
      icon: TrendingUp,
      onClick: () => setWarming(true),
    },
    {
      label: 'Remover última série',
      icon: Minus,
      disabled: exercise.sets.length === 0,
      onClick: () => update((current) => ({ ...current, sets: current.sets.slice(0, -1) })),
    },
    onReorder && { label: 'Reordenar exercícios', icon: ArrowUpDown, onClick: onReorder },
    { label: 'Remover exercício', icon: Trash2, danger: true, onClick: () => setConfirmRemove(true) },
  ]

  // The next working set's load, for the plates: typed, or last time's, or the template's.
  const firstLeft = rows.find(({ set }) => set.kind === 'normal' && !set.done)
  const nextLoad = firstLeft && (firstLeft.set.weightKg ?? firstLeft.previous?.weightKg ?? firstLeft.set.target?.weightKg)
  const barbell = info?.equipment === 'barbell' || info?.equipment === 'smith'

  // The warm-up climbs to the first working set's load: typed, or last time's, or the template's.
  const workKg = firstWorkingLoad(exercise.sets, lastSets)
  const warmup = warming && canWarm && info && workKg !== undefined ? suggestWarmup(workKg, info.equipment, gym) : []

  // The RIR picker opens under the working set checked last in the workout; "RIR" on another set
  // moves it there (or closes it) until the next set is checked.
  const checkedLast = active
    ? lastCheckedSet(session, (id) => library.find((e) => e.id === id)?.type === 'time')
    : undefined
  const rirKey = rirChoice && rirChoice.after === checkedLast ? rirChoice.key : checkedLast
  const toggleRir = (key: string) => setRirChoice({ key: rirKey === key ? null : key, after: checkedLast })

  return (
    <Card className={cx(inSuperset && 'border-l-4 border-l-(--tone-training)')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link to={`/treinos/exercicios/${exercise.exerciseId}`} className="font-medium hover:text-accent-ink">
            {name}
          </Link>
          <p className="text-xs text-muted">
            {info && `${MUSCLES[info.muscle]} · ${EQUIPMENT[info.equipment]} · `}descanso {formatClock(exercise.restSec)}
            {hasWarmups && ` · aquecimento ${formatClock(restOf(exercise, 'warmup'))}`}
          </p>
        </div>
        {record && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-xs font-medium">
            <Trophy size={14} className="text-accent-ink" /> Recorde
          </span>
        )}
        <IconButton label={`Opções de ${name}`} onClick={() => setMenu(true)}>
          <Ellipsis size={18} />
        </IconButton>
      </div>
      {inSuperset && (
        <p className="mt-1 text-xs font-medium text-(--tone-training)">
          {linked
            ? `Bi-set: uma série daqui, uma de ${nameOf(next.exerciseId)}, e o descanso depois.`
            : 'Fim do bi-set: o descanso começa depois desta série.'}
        </p>
      )}
      {exercise.notes && <p className="mt-1 text-sm text-ink-2">{exercise.notes}</p>}
      {setPeaks.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
          <Heart size={14} aria-hidden /> FC máxima nas séries: {setPeaks.join(' · ')} bpm
        </p>
      )}
      {last && lastWorking.length > 0 && (
        <p className="mt-2 text-xs text-ink-2">
          Última vez ({formatDay(last.session.date, 'd/M')}): {lastWorking.map((set) => formatSet(set, type)).join(' · ')}
        </p>
      )}
      {suggestion && canApply && (
        <div className="mt-2 flex items-center gap-3 rounded-xl bg-surface-2 p-2.5 text-sm">
          <TrendingUp size={18} className="shrink-0 text-accent-ink" />
          <p className="flex-1">
            {suggestion.reason === 'rir'
              ? 'Sobraram 3 ou mais repetições em todas as séries.'
              : 'Você bateu o topo das repetições em todas as séries.'}{' '}
            Que tal <strong>{formatNumber(suggestion.weightKg, 2)} kg</strong>?
          </p>
          <Button
            size="sm"
            onClick={() =>
              update((current) => ({
                ...current,
                sets: current.sets.map((set) =>
                  set.kind === 'normal' && !set.done ? { ...set, weightKg: suggestion.weightKg } : set,
                ),
              }))
            }
          >
            Usar
          </Button>
        </div>
      )}
      {warming && canWarm && (
        <WarmupPreview
          workKg={workKg}
          warmup={warmup}
          onClose={() => setWarming(false)}
          onUse={() => {
            setWarming(false)
            update((current) => ({ ...current, sets: replaceWarmups(current.sets, warmupSets(warmup)) }))
          }}
        />
      )}

      {active && barbell && type === 'weight_reps' && (
        <button type="button" onClick={() => setPlates(true)} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent-ink">
          <Disc3 size={14} /> Anilhas{nextLoad !== undefined && ` para ${formatNumber(nextLoad, 2)} kg`}
        </button>
      )}

      <div className="mt-3 space-y-1">
        <div className={cx('grid items-end gap-2 px-1 text-xs text-muted', columns)}>
          <span className="text-center">Série</span>
          <span className="text-center">Anterior</span>
          {type === 'weight_reps' && <span className="text-center">kg</span>}
          <span className="text-center">{type === 'time' ? 'Tempo' : 'Reps'}</span>
          {timed && <span />}
          <span />
        </div>
        {rows.map(({ set, label, previous }) => (
          <SetRow
            key={set.key}
            sessionId={session.id}
            exercise={exercise}
            set={set}
            label={label}
            previous={previous}
            type={type}
            columns={columns}
            restLabel={info?.name ?? 'Descanso'}
            rest={active ? restSecAfter(session.exercises, index, set.kind) : 0}
            active={active}
            timed={timed}
            rirOpen={rirKey === set.key}
            onToggleRir={() => toggleRir(set.key)}
          />
        ))}
      </div>

      {menu && <ActionSheet title={name} actions={actions} onClose={() => setMenu(false)} />}
      {swapping && info && (
        <SwapModal
          current={info}
          exercises={library}
          sessions={history}
          onClose={() => setSwapping(false)}
          onPick={(exerciseId) => {
            setSwapping(false)
            void updateSession(session.id, (current) => swapExercise(current, exercise.key, exerciseId))
          }}
        />
      )}
      {plates && <PlatesModal initialKg={nextLoad} onClose={() => setPlates(false)} />}
      {confirmRemove && (
        <Confirm
          title="Remover exercício?"
          message={`${info?.name ?? 'O exercício'} e as séries registradas nele saem deste treino.`}
          confirmLabel="Remover"
          danger
          onClose={() => setConfirmRemove(false)}
          onConfirm={() => void updateSession(session.id, (current) => removeExercise(current, exercise.key))}
        />
      )}
    </Card>
  )
}

interface MenuAction {
  label: string
  detail?: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

/** A sheet of actions, one per row; picking one closes it. */
function ActionSheet({
  title,
  actions,
  onClose,
}: {
  title: string
  actions: (MenuAction | false | undefined)[]
  onClose: () => void
}) {
  return (
    <Modal open title={title} onClose={onClose}>
      <div className="grid gap-2">
        {actions.map(
          (action) =>
            action && (
              <button
                key={action.label}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  onClose()
                  action.onClick()
                }}
                className={cx(
                  'flex min-h-12 items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-left transition hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
                  action.danger && 'text-critical',
                )}
              >
                <action.icon size={20} aria-hidden className={cx('shrink-0', !action.danger && 'text-ink-2')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{action.label}</span>
                  {action.detail && <span className="block text-xs text-muted">{action.detail}</span>}
                </span>
              </button>
            ),
        )}
      </div>
    </Modal>
  )
}

/**
 * The order of the workout's exercises, by dragging; a bi-set moves as one block. A workout from a
 * template can take its new order back there.
 */
function ReorderModal({
  session,
  exercises,
  onClose,
}: {
  session: WorkoutSession
  exercises: Map<string, Exercise>
  onClose: () => void
}) {
  // null = no template (or it's gone); undefined = still loading.
  const template = useLiveQuery(
    async () => (session.templateId ? ((await db.workoutTemplates.get(session.templateId)) ?? null) : null),
    [session.templateId],
  )
  const nameOf = (exercise: { exerciseId: string }) => exercises.get(exercise.exerciseId)?.name ?? 'Exercício removido'
  const names = (list: { exerciseId: string }[]) => LIST.format(list.map(nameOf))

  const live = template && !template.deleted ? template : undefined
  const matches = live ? matchTemplate(live.exercises, session.exercises) : []
  // A template that shares nothing with the workout anymore has no order to take from it.
  const own = matches.some(Boolean) ? live : undefined
  const ordered = own ? templateInOrder(own.exercises, session.exercises) : []
  const changed = !!own && ordered.some((exercise, i) => exercise.key !== own.exercises[i].key)
  // Only the order changes: what's only in the workout stays out, what it lacks stays in the template.
  const extra = session.exercises.filter((_, i) => own && !matches[i])
  const missing = own ? own.exercises.filter((exercise) => !matches.includes(exercise)) : []

  return (
    <Modal open title="Reordenar exercícios" onClose={onClose}>
      <p className="mb-3 text-sm text-ink-2">Arraste pela alça. Um bi-set se move junto.</p>
      <SortableList
        className="space-y-1.5"
        itemClassName="rounded-xl"
        items={exerciseBlocks(session.exercises)}
        getId={(block) => block[0].key}
        onReorder={(blocks) =>
          void updateSession(session.id, (current) => ({
            ...current,
            exercises: reorderExercises(current.exercises, blocks.map((block) => block[0].key)),
          }))
        }
      >
        {(block, handle) => (
          <div className="flex min-h-11 items-center gap-1 rounded-xl bg-surface-2 py-1 pr-3 pl-1">
            {handle}
            <span className="min-w-0 flex-1 text-sm">{block.map(nameOf).join(' + ')}</span>
          </div>
        )}
      </SortableList>

      {own && (
        <div className="mt-4 border-t border-line pt-4">
          {changed ? (
            <>
              <Button
                className="w-full"
                onClick={() =>
                  void mutate(db.workoutTemplates, own.id, (current) => ({
                    ...current,
                    exercises: templateInOrder(current.exercises, session.exercises),
                  }))
                }
              >
                Salvar esta ordem na ficha
              </Button>
              {extra.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {names(extra)}{' '}
                  {extra.length === 1 ? 'não está na ficha e fica de fora.' : 'não estão na ficha e ficam de fora.'}
                </p>
              )}
              {missing.length > 0 && (
                <p className="mt-1 text-xs text-muted">
                  {names(missing)}{' '}
                  {missing.length === 1
                    ? 'não está neste treino e continua na ficha, depois de onde estava.'
                    : 'não estão neste treino e continuam na ficha, depois de onde estavam.'}
                </p>
              )}
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <Check size={16} className="shrink-0 text-good" /> A ficha {own.name} está nesta ordem.
            </p>
          )}
        </div>
      )}
      <Button variant="primary" className="mt-4 w-full" onClick={onClose}>
        Pronto
      </Button>
    </Modal>
  )
}

const LIST = new Intl.ListFormat('pt-BR', { type: 'conjunction' })

function SetRow({
  sessionId,
  exercise,
  set,
  label,
  previous,
  type,
  columns,
  restLabel,
  rest,
  active,
  timed,
  rirOpen,
  onToggleRir,
}: {
  sessionId: string
  exercise: SessionExercise
  set: PerformedSet
  label: string
  previous: PerformedSet | undefined
  type: ExerciseType
  columns: string
  restLabel: string
  /** Seconds of rest once the set is checked; 0 for none. */
  rest: number
  /** The workout is in progress (not finished, or logged afterwards). */
  active: boolean
  /** A timed set of a workout running: it has a ▶ that times it. */
  timed: boolean
  /** The reps-in-reserve picker shows under it. */
  rirOpen: boolean
  onToggleRir: () => void
}) {
  // Text as typed, written to the workout on blur or when the set is checked.
  const [weight, setWeight] = useState(asText(set.weightKg))
  const [reps, setReps] = useState(set.reps === undefined ? '' : String(set.reps))
  const [duration, setDuration] = useState(set.durationSec === undefined ? '' : formatClock(set.durationSec))
  useEffect(() => setWeight(asText(set.weightKg)), [set.weightKg])
  useEffect(() => setReps(set.reps === undefined ? '' : String(set.reps)), [set.reps])
  useEffect(() => setDuration(set.durationSec === undefined ? '' : formatClock(set.durationSec)), [set.durationSec])
  const repsInput = useRef<HTMLInputElement>(null)
  const durationInput = useRef<HTMLInputElement>(null)

  // An empty field means "same as last time", or the template's target without history.
  const fallback = {
    weightKg: previous?.weightKg ?? set.target?.weightKg,
    reps: previous?.reps ?? set.target?.reps,
    durationSec: previous?.durationSec ?? set.target?.durationSec,
  }
  const repsHint = set.target?.reps !== undefined ? formatReps(set.target.reps, set.target.repsMax) : fallback.reps

  const typed = () => ({ weightKg: parseDecimal(weight), reps: parseCount(reps), durationSec: parseClock(duration) })
  // What checking the set records: what's typed, and the hints for the fields left empty (shared with
  // the Android notification, so both record the same).
  const withHints = (values: ReturnType<typeof typed>) => checkedValues({ ...set, ...values }, previous, type)
  const write = (changes: Partial<PerformedSet>) =>
    updateSession(sessionId, (current) => changeSet(current, exercise.key, set.key, (s) => ({ ...s, ...changes })))

  function commit() {
    const values = typed()
    if (values.weightKg !== set.weightKg || values.reps !== set.reps || values.durationSec !== set.durationSec) {
      void write(values)
    }
  }

  // The timer running for this set, if any (the notification may have checked the set meanwhile).
  const timer = useSetTimer()
  const timing = timer?.setKey === set.key && !set.done ? timer : undefined

  // ▶ counts down from the time typed, or last time's, or the template's; up when there's none.
  function startTimer() {
    const from = parseClock(duration) ?? fallback.durationSec
    startSetTimer({
      sessionId,
      exerciseKey: exercise.key,
      setKey: set.key,
      targetSec: from || undefined,
      restSec: rest,
      label: restLabel,
    })
  }

  function toggle() {
    if (timing) {
      tapFeedback()
      completeSetTimer()
      return
    }
    if (set.done) {
      void write({ done: false, completedAt: undefined, rir: undefined })
      return
    }
    const done = withHints(typed())
    if (type === 'time' ? done.durationSec === undefined : done.reps === undefined) {
      ;(type === 'time' ? durationInput : repsInput).current?.focus()
      return
    }
    tapFeedback()
    // A finished workout being corrected: the set gets no time (now isn't when it was done) and no rest.
    if (!active) {
      void write({ ...done, done: true })
      return
    }
    void completeSet(sessionId, exercise.key, set.key, done)
    if (rest > 0) startRest(rest, restLabel)
  }

  // Under a working set: its estimated 1RM (reps or time without a load) against the same set last
  // time, from what's done or live as it's typed; nothing while only the hints show. Under
  // "Anterior", last time's own 1RM.
  const working = set.kind === 'normal'
  const shown = type === 'weight_reps' ? [weight, reps] : type === 'time' ? [duration] : [reps]
  const values = set.done ? set : shown.some((text) => text.trim() !== '') ? withHints(typed()) : undefined
  const comparison = working && values ? compareSet(values, previous, type) : undefined
  const before = working && type === 'weight_reps' && previous ? setE1rm(previous) : undefined
  // How a time being typed is read ("130" is 2:10), in the comparison's place until it's written as it reads.
  const durationHint = type === 'time' && !timing ? clockHintIfDifferent(duration) : undefined
  // Reps in reserve, once a working set with reps is checked.
  const rirShown = set.done && working && type !== 'time'

  return (
    <div
      className={cx(
        'grid items-center gap-x-2 gap-y-0.5 rounded-xl px-1 py-1 transition',
        columns,
        set.done && 'bg-accent/10',
      )}
    >
      <span className={cx('text-center text-sm font-semibold', set.kind === 'warmup' && 'text-muted')}>{label}</span>
      <span className="truncate text-center text-xs text-muted">{previous ? formatSet(previous, type) : '—'}</span>
      {type === 'weight_reps' && (
        <DecimalInput
          className="h-10 px-1 text-center"
          aria-label={`Carga da série ${label}`}
          placeholder={fallback.weightKg === undefined ? 'kg' : formatNumber(fallback.weightKg, 2)}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={commit}
        />
      )}
      {type === 'time' ? (
        timing ? (
          <SetTimerClock timer={timing} label={label} />
        ) : (
          <TextInput
            ref={durationInput}
            className="h-10 px-1 text-center"
            inputMode="numeric"
            aria-label={`Tempo da série ${label}`}
            placeholder={fallback.durationSec === undefined ? '0:30' : formatClock(fallback.durationSec)}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            onBlur={commit}
          />
        )
      ) : (
        <TextInput
          ref={repsInput}
          className="h-10 px-1 text-center"
          inputMode="numeric"
          aria-label={`Repetições da série ${label}`}
          placeholder={repsHint === undefined ? 'reps' : String(repsHint)}
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={commit}
        />
      )}
      {timed &&
        (set.done ? (
          <span />
        ) : (
          <SetTimerButton running={!!timing} label={label} onStart={startTimer} onStop={stopSetTimer} />
        ))}
      <button
        type="button"
        aria-label={set.done ? `Desmarcar série ${label}` : `Concluir série ${label}`}
        aria-pressed={set.done}
        onClick={toggle}
        className={cx(
          'flex size-10 items-center justify-center rounded-lg transition active:scale-90',
          set.done ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:text-ink',
        )}
      >
        <Check size={20} />
      </button>
      {/* The line under the set. Every set has it, empty where there's nothing to show (warm-ups,
          sets not typed yet), so all rows are the same height and none grows as it's typed. */}
      <span className="h-3.5" />
      <span className="truncate text-center text-[11px] leading-3.5 text-muted tabular-nums">
        {before !== undefined && formatE1rm(before)}
      </span>
      <span className={cx(type === 'weight_reps' && 'col-span-2')}>
        {durationHint ? (
          <span className="block truncate text-center text-[11px] leading-3.5 text-muted tabular-nums">{durationHint}</span>
        ) : (
          comparison && <ComparisonLine comparison={comparison} />
        )}
      </span>
      {rirShown && <RirToggle rir={set.rir} open={rirOpen} label={label} onToggle={onToggleRir} />}
      {rirShown && rirOpen && <RirPicker rir={set.rir} label={label} onChange={(rir) => void write({ rir })} />}
    </div>
  )
}

const TRENDS: Record<Trend, { arrow?: string; className: string; label: string }> = {
  up: { arrow: '▲', className: 'text-good', label: 'mais que na última vez' },
  down: { arrow: '▼', className: 'text-critical', label: 'menos que na última vez' },
  same: { className: 'text-muted', label: 'igual à última vez' },
}

/** "1RM 83,3 ▲": green above the same set last time, red below, muted when equal or new. */
function ComparisonLine({ comparison }: { comparison: SetComparison }) {
  const trend = comparison.trend && TRENDS[comparison.trend]
  return (
    <span
      className={cx(
        'block truncate text-center text-[11px] leading-3.5 tabular-nums',
        trend?.className ?? 'text-muted',
      )}
      title={comparison.metric === 'e1rm' ? '1RM estimado (Epley)' : undefined}
    >
      {formatComparison(comparison)}
      {trend?.arrow && <span aria-hidden> {trend.arrow}</span>}
      {trend && <span className="sr-only">, {trend.label}</span>}
    </span>
  )
}
