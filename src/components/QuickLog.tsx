import {
  Bandage,
  Camera,
  CircleMinus,
  CirclePlus,
  Dumbbell,
  GlassWater,
  ListChecks,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  Ruler,
  Scale,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useToday } from '../db/hooks'
import { patch } from '../db/repo'
import { db, SETTINGS_ID } from '../db/schema'
import { dayKey, type DayKey } from '../lib/dates'
import { dayTitle, KIND_ICONS, KIND_TONES, PlanModal } from '../features/calendar/components'
import { useTodayTemplate } from '../features/calendar/plans'
import { WalkModal } from '../features/calendar/WalkModal'
import { mealAt } from '../features/food/nutrition'
import { useStartWorkout } from '../features/training/components'
import { findActive, useSessions } from '../features/training/training'
import { useRestTimer } from '../features/training/restTimer'
import { WaterQuickAdd } from '../features/water/WaterQuickAdd'
import { Modal } from './Modal'
import { missingItems, quickLogBlocks, quickLogItems, toggleQuickLog, type QuickLogId } from './quickLogItems'
import { screenAction, type ScreenAction } from './screenActions'
import { SortableList } from './Sortable'
import { IconTile, toneStyle, type Tone } from './tone'
import { Button, cx, IconButton, SkeletonLines } from './ui'

const LOOKS: Record<QuickLogId, { label: string; detail: string; icon: LucideIcon; tone: Tone }> = {
  food: { label: 'Alimento', detail: 'Na refeição desta hora', icon: Utensils, tone: 'food' },
  plate: { label: 'Foto do prato', detail: 'A câmera, para ler o prato', icon: Camera, tone: 'food' },
  weight: { label: 'Pesagem', detail: 'Peso e composição', icon: Scale, tone: 'body' },
  measure: { label: 'Medição', detail: 'As medidas do corpo', icon: Ruler, tone: 'body' },
  workout: { label: 'Treino', detail: 'O de hoje, ou a próxima ficha', icon: Dumbbell, tone: 'training' },
  walk: { label: 'Caminhada', detail: 'Programar uma, hoje ou toda semana', icon: KIND_ICONS.walk, tone: KIND_TONES.walk },
  habits: { label: 'Hábitos', detail: 'O check do dia', icon: ListChecks, tone: 'habits' },
  journal: { label: 'Diário', detail: 'Como foi o dia', icon: NotebookPen, tone: 'journal' },
  pain: { label: 'Dor', detail: 'Uma dor ou desconforto, no diário', icon: Bandage, tone: 'journal' },
  water: { label: 'Água', detail: 'Os botões dos copos favoritos', icon: GlassWater, tone: 'water' },
}

/** The sheet or form the "+" has open. */
type Opened = { kind: 'sheet' } | { kind: 'water' } | { kind: 'plan'; date: DayKey } | { kind: 'walk'; date: DayKey }

/**
 * The "+" over the bottom bar adds what the screen is about: a food on Alimentação, a weigh-in (or a
 * measurement, a photo) on Corpo, a pain on the Diário, the workout on Treinos…; on Hoje it opens the
 * sheet to log anything, with the items and their order as the user set them. Where there's nothing
 * to add it shrinks away, and comes back on a screen that has. On the computer the button at the top
 * of the sidebar is always that sheet.
 */
export function QuickLogButton({ variant }: { variant: 'floating' | 'sidebar' }) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const today = useToday()
  const rest = useRestTimer()
  const [opened, setOpened] = useState<Opened>()
  const workout = useRef<() => void>(undefined)
  const close = () => setOpened(undefined)
  const actionHere = () =>
    variant === 'sidebar' ? SHEET : screenAction(pathname, search, { today, meal: mealAt(new Date()) })
  const action = actionHere()

  function press() {
    // Read again: the meal of the hour may have changed since the screen opened.
    const now = actionHere()
    if (!now) return
    if (now.kind === 'go') navigate(now.to, { replace: now.replace })
    else if (now.kind === 'workout') workout.current?.()
    else setOpened(now.kind === 'plan' ? { kind: 'plan', date: now.date } : { kind: now.kind })
  }

  return (
    <>
      {variant === 'floating' ? (
        // The rest timer takes this spot during a workout.
        <FloatingPlus label={rest ? undefined : action?.label} onPress={press} />
      ) : (
        <button
          type="button"
          onClick={press}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition hover:brightness-110"
        >
          <Plus size={18} /> Registrar
        </button>
      )}
      {action?.kind === 'workout' && <WorkoutRunner runner={workout} fallback="/treinos/ficha/nova" />}
      {opened?.kind === 'sheet' && <QuickLogSheet onClose={close} onWalk={() => setOpened({ kind: 'walk', date: dayKey() })} />}
      {opened?.kind === 'water' && (
        <Modal open title="Água" onClose={close}>
          <WaterQuickAdd />
        </Modal>
      )}
      {opened?.kind === 'plan' && <PlanSheet date={opened.date} today={today} onClose={close} />}
      {opened?.kind === 'walk' && <WalkModal date={opened.date} today={opened.date} onClose={close} />}
    </>
  )
}

const SHEET: ScreenAction = { kind: 'sheet', label: 'Registrar' }

/**
 * The floating "+": `label` says what it adds here; without one (nothing to add, or the rest timer
 * in its place) it shrinks and fades away, and grows back on a screen that has something.
 */
function FloatingPlus({ label, onPress }: { label: string | undefined; onPress: () => void }) {
  const shown = label !== undefined
  return (
    <button
      type="button"
      aria-label={label ?? 'Registrar'}
      title={label}
      inert={!shown}
      onClick={onPress}
      className={cx(
        'fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 inline-flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition duration-200 ease-out hover:brightness-110 active:scale-95 lg:hidden',
        !shown && 'pointer-events-none scale-50 opacity-0',
      )}
    >
      <Plus size={28} />
    </button>
  )
}

/** The workout of the moment: back to the one going on, today's (or the next) template, else `fallback`. */
function useWorkoutAction(fallback: string): { label: string; detail?: string; run: () => void } {
  const navigate = useNavigate()
  const sessions = useSessions()
  const todays = useTodayTemplate(useToday())
  const start = useStartWorkout()
  const active = findActive(sessions ?? [])
  const next = todays?.template
  return {
    label: active ? 'Voltar ao treino' : next ? `Treino ${next.name}` : 'Treino',
    detail: active ? active.name : next ? (todays?.plan ? 'programado para hoje' : 'próxima ficha') : undefined,
    run: () => {
      if (active) navigate(`/treinos/sessao/${active.id}`)
      else if (next) void start(next)
      else navigate(fallback)
    },
  }
}

/** On Treinos only, where the "+" is the workout: its data loads just there. */
function WorkoutRunner({ runner, fallback }: { runner: RefObject<(() => void) | undefined>; fallback: string }) {
  const { run } = useWorkoutAction(fallback)
  useLayoutEffect(() => {
    runner.current = run
  })
  return null
}

/** Calendário's "Programar neste dia": a workout from a template, or a walk. */
function PlanSheet({ date, today, onClose }: { date: DayKey; today: DayKey; onClose: () => void }) {
  const [kind, setKind] = useState<'gym' | 'walk'>()
  const { gym: GymIcon, walk: WalkIcon } = KIND_ICONS
  if (kind === 'gym') return <PlanModal date={date} today={today} onClose={onClose} />
  if (kind === 'walk') return <WalkModal date={date} today={today} onClose={onClose} />
  return (
    <Modal open title="Programar" onClose={onClose}>
      <p className="mb-3 text-sm text-ink-2 first-letter:uppercase">{dayTitle(date, today)}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setKind('gym')}>
          <GymIcon size={18} /> Academia
        </Button>
        <Button onClick={() => setKind('walk')}>
          <WalkIcon size={18} /> Caminhada
        </Button>
      </div>
    </Modal>
  )
}

function QuickLogSheet({ onClose, onWalk }: { onClose: () => void; onWalk: () => void }) {
  const navigate = useNavigate()
  // Read here rather than with useSettings, whose stand-in while loading would flash the default items.
  const saved = useLiveQuery(async () => (await db.settings.get(SETTINGS_ID))?.quickLog ?? null)
  const workout = useWorkoutAction('/treinos')
  const [editing, setEditing] = useState(false)
  const items = saved === undefined ? undefined : quickLogItems(saved ?? undefined)
  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  const tile = (id: Exclude<QuickLogId, 'water'>): { label?: string; detail?: string; onClick: () => void } => {
    switch (id) {
      case 'food':
        return { onClick: () => go(`/alimentacao/adicionar?refeicao=${mealAt(new Date())}`) }
      case 'plate':
        return { onClick: () => go('/alimentacao/adicionar?camera=prato') }
      case 'weight':
        return { onClick: () => go('/corpo?novo=peso') }
      case 'measure':
        return { onClick: () => go('/corpo?novo=medida') }
      case 'workout':
        return {
          label: workout.label,
          detail: workout.detail,
          onClick: () => {
            onClose()
            workout.run()
          },
        }
      case 'walk':
        return { onClick: onWalk }
      case 'habits':
        return { onClick: () => go('/habitos') }
      case 'journal':
        return { onClick: () => go('/diario') }
      case 'pain':
        return { onClick: () => go('/diario?dor=nova') }
    }
  }

  return (
    <Modal open title={editing ? 'Editar o +' : 'Registrar'} onClose={onClose}>
      {!items ? (
        <SkeletonLines lines={3} />
      ) : editing ? (
        <QuickLogEditor items={items} onDone={() => setEditing(false)} />
      ) : (
        <>
          {items.length === 0 && <p className="py-2 text-sm text-muted">Nada no + por enquanto. Escolha em Editar.</p>}
          <div className="space-y-4">
            {quickLogBlocks(items).map((block) =>
              block.kind === 'water' ? (
                <div key="water">
                  <p className="mb-2 text-sm font-medium text-ink-2">Água</p>
                  <WaterQuickAdd />
                </div>
              ) : (
                <div key={block.ids[0]} className="grid grid-cols-2 gap-2">
                  {block.ids.map((id) => {
                    const { icon: Icon, tone, label } = LOOKS[id]
                    const action = tile(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={action.onClick}
                        className="flex min-h-16 items-center gap-3 rounded-xl bg-surface-2 p-3 text-left transition hover:brightness-110 active:scale-[0.98]"
                      >
                        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl" style={toneStyle(tone)}>
                          <Icon size={20} aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{action.label ?? label}</span>
                          {action.detail && <span className={cx('block truncate text-xs text-muted')}>{action.detail}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ),
            )}
          </div>
          <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={() => setEditing(true)}>
            <Pencil size={16} /> Editar
          </Button>
        </>
      )}
    </Modal>
  )
}

/** Which items the "+" has and in what order; every change saves at once and syncs. */
function QuickLogEditor({ items, onDone }: { items: QuickLogId[]; onDone: () => void }) {
  const store = (quickLog: QuickLogId[] | undefined) => void patch(db.settings, SETTINGS_ID, { quickLog })
  const available = missingItems(items)
  return (
    <>
      <h3 className="text-sm font-semibold">Aparecem, nesta ordem</h3>
      {items.length === 0 ? (
        <p className="py-3 text-sm text-muted">Nada por enquanto.</p>
      ) : (
        <SortableList
          className="divide-y divide-line"
          itemClassName="flex items-center gap-2 bg-surface py-1.5"
          items={items}
          getId={(id) => id}
          onReorder={store}
        >
          {(id, handle) => (
            <>
              <span className="-ml-2 flex">{handle}</span>
              <IconTile icon={LOOKS[id].icon} tone={LOOKS[id].tone} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{LOOKS[id].label}</span>
                <span className="block truncate text-xs text-muted">{LOOKS[id].detail}</span>
              </span>
              <IconButton label={`Tirar ${LOOKS[id].label}`} onClick={() => store(toggleQuickLog(items, id, false))}>
                <CircleMinus size={20} />
              </IconButton>
            </>
          )}
        </SortableList>
      )}

      {available.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">Mais opções</h3>
          <ul className="divide-y divide-line">
            {available.map((id) => (
              <li key={id} className="flex items-center gap-2 py-1.5">
                <IconTile icon={LOOKS[id].icon} tone={LOOKS[id].tone} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{LOOKS[id].label}</span>
                  <span className="block truncate text-xs text-muted">{LOOKS[id].detail}</span>
                </span>
                <IconButton
                  label={`Adicionar ${LOOKS[id].label}`}
                  className="text-accent-ink"
                  onClick={() => store(toggleQuickLog(items, id, true))}
                >
                  <CirclePlus size={20} />
                </IconButton>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" onClick={() => store(undefined)}>
          <RotateCcw size={16} /> Voltar ao padrão
        </Button>
        <Button variant="primary" className="ml-auto" onClick={onDone}>
          Pronto
        </Button>
      </div>
    </>
  )
}
