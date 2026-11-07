import {
  Apple,
  BedDouble,
  Beer,
  Bike,
  BookOpen,
  Brain,
  Candy,
  Cigarette,
  Circle,
  CircleCheckBig,
  CircleMinus,
  Coffee,
  Droplet,
  Dumbbell,
  Flower2,
  Footprints,
  GlassWater,
  HeartPulse,
  Moon,
  Music,
  NotebookPen,
  PersonStanding,
  Pill,
  Salad,
  ShowerHead,
  Smartphone,
  Sun,
  Sunrise,
  Toothbrush,
  Tv,
  Utensils,
  Waves,
  Wind,
  Wine,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cx } from '../../components/ui'
import type { Habit } from '../../db/types'
import type { DayState } from './day'
import './habits.css'

/** The colors a habit can have (--habit-* in habits.css); the key is what's stored. */
export const HABIT_COLORS: { key: string; label: string }[] = [
  { key: 'blue', label: 'Azul' },
  { key: 'teal', label: 'Turquesa' },
  { key: 'green', label: 'Verde' },
  { key: 'amber', label: 'Âmbar' },
  { key: 'orange', label: 'Laranja' },
  { key: 'red', label: 'Vermelho' },
  { key: 'pink', label: 'Rosa' },
  { key: 'purple', label: 'Roxo' },
  { key: 'indigo', label: 'Anil' },
  { key: 'gray', label: 'Cinza' },
]

/** The icons a habit can have; the key is what's stored. */
export const HABIT_ICONS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'sun', label: 'Sol', icon: Sun },
  { key: 'sunrise', label: 'Nascer do sol', icon: Sunrise },
  { key: 'moon', label: 'Lua', icon: Moon },
  { key: 'bed', label: 'Cama', icon: BedDouble },
  { key: 'pill', label: 'Pílula', icon: Pill },
  { key: 'droplet', label: 'Gota', icon: Droplet },
  { key: 'water', label: 'Copo de água', icon: GlassWater },
  { key: 'coffee', label: 'Café', icon: Coffee },
  { key: 'wine', label: 'Taça', icon: Wine },
  { key: 'beer', label: 'Cerveja', icon: Beer },
  { key: 'candy', label: 'Doce', icon: Candy },
  { key: 'apple', label: 'Maçã', icon: Apple },
  { key: 'salad', label: 'Salada', icon: Salad },
  { key: 'meal', label: 'Refeição', icon: Utensils },
  { key: 'phone', label: 'Celular', icon: Smartphone },
  { key: 'tv', label: 'TV', icon: Tv },
  { key: 'book', label: 'Livro', icon: BookOpen },
  { key: 'write', label: 'Escrever', icon: NotebookPen },
  { key: 'stretch', label: 'Alongamento', icon: PersonStanding },
  { key: 'meditate', label: 'Meditação', icon: Flower2 },
  { key: 'breathe', label: 'Respiração', icon: Wind },
  { key: 'walk', label: 'Caminhada', icon: Footprints },
  { key: 'gym', label: 'Musculação', icon: Dumbbell },
  { key: 'bike', label: 'Bicicleta', icon: Bike },
  { key: 'swim', label: 'Natação', icon: Waves },
  { key: 'heart', label: 'Coração', icon: HeartPulse },
  { key: 'brain', label: 'Mente', icon: Brain },
  { key: 'teeth', label: 'Dentes', icon: Toothbrush },
  { key: 'shower', label: 'Banho', icon: ShowerHead },
  { key: 'smoke', label: 'Cigarro', icon: Cigarette },
  { key: 'music', label: 'Música', icon: Music },
]

const COLORS = new Set(HABIT_COLORS.map(({ key }) => key))
const ICONS = new Map(HABIT_ICONS.map(({ key, icon }) => [key, icon]))

/** The look a habit has without a color picked: blue to do, orange to avoid. */
export const defaultColor = (polarity: Habit['polarity']): string => (polarity === 'good' ? 'var(--series-1)' : 'var(--series-2)')

/** The habit's color: the one picked, or the default of its kind. */
export const habitColor = (habit: Pick<Habit, 'color' | 'polarity'>): string =>
  habit.color && COLORS.has(habit.color) ? `var(--habit-${habit.color})` : defaultColor(habit.polarity)

export const habitIcon = (habit: Pick<Habit, 'icon'>): LucideIcon | undefined => (habit.icon ? ICONS.get(habit.icon) : undefined)

/** Once any habit has a color or an icon, every row of a list gets its badge, so the names line up. */
export const showsBadges = (habits: Pick<Habit, 'color' | 'icon'>[]): boolean =>
  habits.some((habit) => habitIcon(habit) || (habit.color && COLORS.has(habit.color)))

const wash = (color: string, percent = 14) => `color-mix(in oklab, ${color} ${percent}%, transparent)`

/** A habit's icon on a wash of its color; a dot of the color when it has no icon. */
export function HabitBadge({
  habit,
  muted = false,
  small = false,
}: {
  habit: Pick<Habit, 'color' | 'polarity' | 'icon'>
  muted?: boolean
  small?: boolean
}) {
  const Icon = habitIcon(habit)
  const color = muted ? 'var(--muted)' : habitColor(habit)
  return (
    <span
      aria-hidden
      className={cx('inline-flex shrink-0 items-center justify-center', small ? 'size-6 rounded-md' : 'size-7 rounded-lg')}
      style={{ color, background: wash(color) }}
    >
      {Icon ? <Icon size={small ? 14 : 16} /> : <span className="size-2 rounded-full" style={{ background: color }} />}
    </span>
  )
}

/** A little longer than the pop itself (animate-pop in index.css). */
const POP_MS = 400
/** How long after a tap its write may take to land and still pop. */
const TAP_MS = 2000

/**
 * The pop of a check the user turns on: `tap()` on the press, and it plays when the mark turns on (the
 * write lands a moment later). Never when a list shows up, data comes from elsewhere or the day
 * changes. The class comes off after the pop: left on, it would play again whenever the list
 * reorders, as moving an element restarts its animations.
 */
export function useTapPop(marked: boolean): { pop: boolean; tap: () => void } {
  const tapped = useRef(0)
  const was = useRef(marked)
  const [pop, setPop] = useState(false)
  useEffect(() => {
    if (was.current === marked) return
    was.current = marked
    const mine = Date.now() - tapped.current < TAP_MS
    tapped.current = 0
    setPop(marked && mine)
  }, [marked])
  useEffect(() => {
    if (!pop) return
    const timer = setTimeout(() => setPop(false), POP_MS)
    return () => clearTimeout(timer)
  }, [pop])
  return {
    pop: marked && pop,
    tap: () => {
      tapped.current = Date.now()
    },
  }
}

/**
 * How a habit stands on the day, as the mark of a check: an empty circle, a check in its color, or a
 * dash when skipped. With `icon`, a habit that has one shows it instead, filled with its color once
 * marked. `pop` plays the check's little bounce (useTapPop).
 */
export function HabitMark({
  habit,
  state,
  size = 18,
  icon = true,
  pop = false,
}: {
  habit: Pick<Habit, 'color' | 'polarity' | 'icon'>
  state: DayState
  size?: number
  icon?: boolean
  pop?: boolean
}) {
  const Icon = icon ? habitIcon(habit) : undefined
  const color = habitColor(habit)
  const marked = state === 'done' || state === 'happened'
  if (!Icon) {
    if (state === 'skipped') return <CircleMinus aria-hidden size={size} className="shrink-0 text-muted" />
    return marked ? (
      <CircleCheckBig aria-hidden size={size} className={cx('shrink-0', pop && 'animate-pop')} style={{ color }} />
    ) : (
      <Circle aria-hidden size={size} className="shrink-0 text-baseline" />
    )
  }
  const skipped = state === 'skipped'
  return (
    <span
      aria-hidden
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
        pop && 'animate-pop',
        skipped && 'border border-dashed border-muted',
      )}
      style={{
        width: size + 6,
        height: size + 6,
        color: marked ? 'var(--surface)' : skipped ? 'var(--muted)' : color,
        background: marked ? color : skipped ? 'transparent' : wash(color, 16),
      }}
    >
      <Icon size={size - 4} />
    </span>
  )
}
