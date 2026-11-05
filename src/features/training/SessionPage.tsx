import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeftRight, Check, Disc3, Heart, Link2, Minus, Plus, Trash2, TrendingUp, Trophy, Unlink2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { celebrate } from '../../components/celebrate'
import { Confirm } from '../../components/Modal'
import { Button, Card, cx, DecimalInput, Empty, IconButton, Page, SkeletonCard, Stat, TextInput } from '../../components/ui'
import { db } from '../../db/schema'
import type { Exercise, ExerciseType, PerformedSet, SessionExercise, WorkoutSession } from '../../db/types'
import { formatDay } from '../../lib/dates'
import { formatClock, formatDuration, formatNumber, parseClock, parseDecimal } from '../../lib/format'
import { newId } from '../../lib/ids'
import { setPeakHeartRates, useActivityStream, useWorkoutActivity } from '../activities/activities'
import { WorkoutWatchCard } from '../activities/WorkoutWatchCard'
import { EQUIPMENT, formatReps, formatSet, MUSCLES } from './catalog'
import { Elapsed } from './components'
import { ExercisePicker } from './ExercisePicker'
import { startRest, stopRest } from './restTimer'
import { LoadStepper, PlatesModal, SwapModal } from './GymTools'
import { LOAD_STEP, lastPerformance, personalRecords, suggestNextWeight, summarize, type Performance } from './stats'
import {
  changeExercise,
  changeSet,
  deleteWorkout,
  finishWorkout,
  newSessionExercise,
  restsAfter,
  shiftLoad,
  swapExercise,
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
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [plates, setPlates] = useState(false)
  const setPeaks = exercise.sets.flatMap((set) => {
    const peak = peaks?.get(set.key)
    return peak === undefined ? [] : [peak]
  })
  const type = info?.type ?? 'weight_reps'
  const update = (change: (exercise: SessionExercise) => SessionExercise | null) =>
    void updateSession(session.id, (current) => changeExercise(current, exercise.key, change))

  const suggestion = active && info && last ? suggestNextWeight(last.exercise.sets, info.equipment) : undefined
  const canApply = exercise.sets.some((set) => set.kind === 'normal' && !set.done && set.weightKg !== suggestion)
  const lastWorking = last?.exercise.sets.filter((set) => set.done && set.kind === 'normal') ?? []

  // Pair each set with the same set (same kind, same position) from last time.
  const lastWarmups = last?.exercise.sets.filter((set) => set.done && set.kind === 'warmup') ?? []
  let warmups = 0
  let normals = 0
  const rows = exercise.sets.map((set) =>
    set.kind === 'warmup'
      ? { set, label: 'A', previous: lastWarmups[warmups++] }
      : { set, label: String(++normals), previous: lastWorking[normals - 1] },
  )
  const columns =
    type === 'weight_reps'
      ? 'grid-cols-[1.75rem_minmax(0,1fr)_4.25rem_3.75rem_2.75rem]'
      : 'grid-cols-[1.75rem_minmax(0,1fr)_4.75rem_2.75rem]'

  // Bi-sets: this one and the next are done alternating, with the rest after the pair.
  const next = session.exercises[index + 1]
  const previous = session.exercises[index - 1]
  const inSuperset = !!exercise.supersetWithNext || !!previous?.supersetWithNext
  const rests = restsAfter(session.exercises, index)
  const nameOf = (id: string) => library.find((e) => e.id === id)?.name ?? 'o próximo'

  // The load the next sets will use: typed, or last time's, or the template's.
  const firstLeft = rows.find(({ set }) => set.kind === 'normal' && !set.done)
  const nextLoad = firstLeft && (firstLeft.set.weightKg ?? firstLeft.previous?.weightKg ?? firstLeft.set.target?.weightKg)
  const barbell = info?.equipment === 'barbell' || info?.equipment === 'smith'
  const step = info && LOAD_STEP[info.equipment] > 0 ? LOAD_STEP[info.equipment] : 2.5

  return (
    <Card className={cx(inSuperset && 'border-l-4 border-l-(--tone-training)')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link to={`/treinos/exercicios/${exercise.exerciseId}`} className="font-medium hover:text-accent-ink">
            {info?.name ?? 'Exercício removido'}
          </Link>
          <p className="text-xs text-muted">
            {info && `${MUSCLES[info.muscle]} · ${EQUIPMENT[info.equipment]} · `}descanso {formatClock(exercise.restSec)}
          </p>
        </div>
        {record && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-xs font-medium">
            <Trophy size={14} className="text-accent-ink" /> Recorde
          </span>
        )}
        {active && info && (
          <IconButton label="Trocar por outro exercício" onClick={() => setSwapping(true)}>
            <ArrowLeftRight size={16} />
          </IconButton>
        )}
        {active && next && (
          <IconButton
            label={exercise.supersetWithNext ? 'Desfazer bi-set' : `Bi-set com ${nameOf(next.exerciseId)}`}
            aria-pressed={!!exercise.supersetWithNext}
            onClick={() => update((current) => ({ ...current, supersetWithNext: !current.supersetWithNext }))}
          >
            {exercise.supersetWithNext ? <Unlink2 size={16} /> : <Link2 size={16} />}
          </IconButton>
        )}
        <IconButton label="Remover exercício" onClick={() => setConfirmRemove(true)}>
          <Trash2 size={16} />
        </IconButton>
      </div>
      {inSuperset && (
        <p className="mt-1 text-xs font-medium text-(--tone-training)">
          {exercise.supersetWithNext
            ? `Bi-set: uma série daqui, uma de ${nameOf(next!.exerciseId)}, e o descanso depois.`
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
      {suggestion !== undefined && canApply && (
        <div className="mt-2 flex items-center gap-3 rounded-xl bg-surface-2 p-2.5 text-sm">
          <TrendingUp size={18} className="shrink-0 text-accent-ink" />
          <p className="flex-1">
            Você bateu o topo das repetições em todas as séries. Que tal{' '}
            <strong>{formatNumber(suggestion, 2)} kg</strong>?
          </p>
          <Button
            size="sm"
            onClick={() =>
              update((current) => ({
                ...current,
                sets: current.sets.map((set) =>
                  set.kind === 'normal' && !set.done ? { ...set, weightKg: suggestion } : set,
                ),
              }))
            }
          >
            Usar
          </Button>
        </div>
      )}

      {active && type === 'weight_reps' && nextLoad !== undefined && (
        <LoadStepper weightKg={nextLoad} step={step} onShift={(delta) => update((current) => shiftLoad(current, delta, nextLoad))} />
      )}
      {active && barbell && type === 'weight_reps' && (
        <button type="button" onClick={() => setPlates(true)} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent-ink">
          <Disc3 size={14} /> Anilhas{nextLoad !== undefined && ` para ${formatNumber(nextLoad, 2)} kg`}
        </button>
      )}

      <div className="mt-3 space-y-1">
        <div className={cx('grid items-end gap-2 px-1 text-xs text-muted', columns)}>
          <span className="text-center">Série</span>
          <span>Anterior</span>
          {type === 'weight_reps' && <span className="text-center">kg</span>}
          <span className="text-center">{type === 'time' ? 'Tempo' : 'Reps'}</span>
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
            startsRest={active && rests}
          />
        ))}
      </div>
      <div className="mt-2 flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            update((current) => ({
              ...current,
              sets: [
                ...current.sets,
                { key: newId(), kind: 'normal', target: current.sets.at(-1)?.target, done: false },
              ],
            }))
          }
        >
          <Plus size={16} /> Série
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={exercise.sets.length === 0}
          onClick={() => update((current) => ({ ...current, sets: current.sets.slice(0, -1) }))}
        >
          <Minus size={16} /> Série
        </Button>
      </div>

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
          onConfirm={() => update(() => null)}
        />
      )}
    </Card>
  )
}

function SetRow({
  sessionId,
  exercise,
  set,
  label,
  previous,
  type,
  columns,
  restLabel,
  startsRest,
}: {
  sessionId: string
  exercise: SessionExercise
  set: PerformedSet
  label: string
  previous: PerformedSet | undefined
  type: ExerciseType
  columns: string
  restLabel: string
  startsRest: boolean
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
  const write = (changes: Partial<PerformedSet>) =>
    updateSession(sessionId, (current) => changeSet(current, exercise.key, set.key, (s) => ({ ...s, ...changes })))

  function commit() {
    const values = typed()
    if (values.weightKg !== set.weightKg || values.reps !== set.reps || values.durationSec !== set.durationSec) {
      void write(values)
    }
  }

  function toggle() {
    if (set.done) {
      void write({ done: false, completedAt: undefined })
      return
    }
    const values = typed()
    const done = {
      weightKg: type === 'weight_reps' ? (values.weightKg ?? fallback.weightKg) : undefined,
      reps: type === 'time' ? undefined : (values.reps ?? fallback.reps),
      durationSec: type === 'time' ? (values.durationSec ?? fallback.durationSec) : undefined,
    }
    if (type === 'time' ? done.durationSec === undefined : done.reps === undefined) {
      ;(type === 'time' ? durationInput : repsInput).current?.focus()
      return
    }
    tapFeedback()
    void write({ ...done, done: true, completedAt: Date.now() })
    if (startsRest && exercise.restSec > 0) startRest(exercise.restSec, restLabel)
  }

  return (
    <div className={cx('grid items-center gap-2 rounded-xl px-1 py-1 transition', columns, set.done && 'bg-series-1/10')}>
      <span className={cx('text-center text-sm font-semibold', set.kind === 'warmup' && 'text-muted')}>{label}</span>
      <span className="truncate text-xs text-muted">{previous ? formatSet(previous, type) : '—'}</span>
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
      <button
        type="button"
        aria-label={set.done ? `Desmarcar série ${label}` : `Concluir série ${label}`}
        aria-pressed={set.done}
        onClick={toggle}
        className={cx(
          'flex size-10 items-center justify-center rounded-lg transition active:scale-90',
          set.done ? 'bg-series-1 text-white' : 'bg-surface-2 text-muted hover:text-ink',
        )}
      >
        <Check size={20} />
      </button>
    </div>
  )
}
