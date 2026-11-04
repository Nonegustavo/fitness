import { Dumbbell, NotebookPen, Plus, Scale, Utensils, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useToday } from '../db/hooks'
import { useTodayTemplate } from '../features/calendar/plans'
import { mealAt } from '../features/food/nutrition'
import { useStartWorkout } from '../features/training/components'
import { findActive, useSessions } from '../features/training/training'
import { useRestTimer } from '../features/training/restTimer'
import { WaterQuickAdd } from '../features/water/WaterQuickAdd'
import { Modal } from './Modal'
import { toneStyle, type Tone } from './tone'
import { cx } from './ui'

/** Screens where the "+" would be in the way or repeat what's already there. */
const HIDDEN_ON = ['/alimentacao/adicionar', '/treinos/sessao/', '/treinos/ficha/']

/**
 * The "+" over the bottom bar: logging from any screen (food, water, weight, workout, diary) in
 * one or two taps. On the computer it sits at the top of the sidebar instead.
 */
export function QuickLogButton({ variant }: { variant: 'floating' | 'sidebar' }) {
  const { pathname } = useLocation()
  const rest = useRestTimer()
  const [open, setOpen] = useState(false)
  const hidden = HIDDEN_ON.some((path) => pathname.startsWith(path))

  return (
    <>
      {variant === 'floating' ? (
        // The rest timer takes this spot during a workout.
        !hidden &&
        !rest && (
          <button
            type="button"
            aria-label="Registrar"
            onClick={() => setOpen(true)}
            className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 inline-flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition hover:brightness-110 active:scale-95 lg:hidden"
          >
            <Plus size={28} />
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition hover:brightness-110"
        >
          <Plus size={18} /> Registrar
        </button>
      )}
      {open && <QuickLogSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function QuickLogSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const sessions = useSessions()
  const todays = useTodayTemplate(useToday())
  const start = useStartWorkout()
  const go = (to: string) => {
    onClose()
    navigate(to)
  }
  const active = findActive(sessions ?? [])
  const next = todays?.template

  const actions: { label: string; detail?: string; icon: LucideIcon; tone: Tone; onClick: () => void }[] = [
    {
      label: 'Alimento',
      icon: Utensils,
      tone: 'food',
      onClick: () => go(`/alimentacao/adicionar?refeicao=${mealAt(new Date())}`),
    },
    { label: 'Pesagem', icon: Scale, tone: 'body', onClick: () => go('/corpo?novo=peso') },
    {
      label: active ? 'Voltar ao treino' : next ? `Treino ${next.name}` : 'Treino',
      detail: active ? active.name : next ? (todays?.plan ? 'programado para hoje' : 'próxima ficha') : undefined,
      icon: Dumbbell,
      tone: 'training',
      onClick: () => {
        onClose()
        if (active) navigate(`/treinos/sessao/${active.id}`)
        else if (next) void start(next)
        else navigate('/treinos')
      },
    },
    { label: 'Diário', icon: NotebookPen, tone: 'journal', onClick: () => go('/diario') },
  ]

  return (
    <Modal open title="Registrar" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {actions.map(({ label, detail, icon: Icon, tone, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="flex min-h-16 items-center gap-3 rounded-xl bg-surface-2 p-3 text-left transition hover:brightness-110 active:scale-[0.98]"
          >
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl" style={toneStyle(tone)}>
              <Icon size={20} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{label}</span>
              {detail && <span className={cx('block truncate text-xs text-muted')}>{detail}</span>}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-5 mb-2 text-sm font-medium text-ink-2">Água</p>
      <WaterQuickAdd />
    </Modal>
  )
}
