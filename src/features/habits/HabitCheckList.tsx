import { useLiveQuery } from 'dexie-react-hooks'
import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { celebrate } from '../../components/celebrate'
import { useToast } from '../../components/Toast'
import { cx, Empty, IconButton, SkeletonLines } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { Habit, HabitLog } from '../../db/types'
import { shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { tapFeedback } from '../../lib/haptics'
import { dayGoals, dayState, keepOrder, orderForDay, type DayState } from './day'
import { useLongPress, useReorderMotion } from './gestures'
import {
  describeHabit,
  habitTime,
  setHabitValue,
  useHabits,
  weekProgressText,
  weekResults,
  weeklyTimes,
  type WeekResult,
} from './habits'
import { HabitBadge, habitColor, habitIcon, HabitMark, showsBadges, useTapPop } from './look'
import { SkipSheet } from './SkipSheet'

/** How long the list stays as it is after a tap before habits move to their places, so the check is seen. */
const HOLD_MS = 700
/** A little longer than the slide to their places (useReorderMotion). */
const SETTLE_MS = 400

/** Long presses (and right clicks) mustn't select the text or open the phone's menu. */
const NO_SELECT = 'select-none [-webkit-touch-callout:none]'

interface ItemProps {
  habit: Habit
  log: HabitLog | undefined
  /** A weekly habit's week so far. */
  week: WeekResult | undefined
  onSet: (value: number) => void
  onMenu: () => void
  ref: (node: HTMLElement | null) => void
}

/**
 * The logs of the week (Sunday to Saturday) a day is in, with the day they're for. Moving to another
 * week, the old week's logs stay until the new ones come: the list keeps showing the day it has
 * data for, instead of a moment of the new day with nothing checked.
 */
function useDayLogs(date: DayKey): { date: DayKey; logs: HabitLog[] } | undefined {
  const sunday = weekStart(date)
  const week = useLiveQuery(
    async () => ({ sunday, logs: alive(await db.habitLogs.where('date').between(sunday, shiftDay(sunday, 6), true, true).toArray()) }),
    [sunday],
  )
  const current = week?.sunday === sunday ? { date, logs: week.logs } : undefined
  const last = useRef(current)
  useEffect(() => {
    if (current) last.current = current
  })
  return current ?? (week ? last.current : undefined)
}

/**
 * The day's check-in: a toggle for yes/no habits, a stepper for counted ones, in the order of the
 * day (what's left to do first, by time). A long press says "hoje não vou fazer". `compact` lays
 * them out as buttons two per row, without the description (the Hoje card). Weekly habits show
 * how their week goes ("2/3 na semana"). It shows up in its order, with what's checked already
 * checked: only the user's own taps animate.
 */
export function HabitCheckList({ date, compact = false }: { date: DayKey; compact?: boolean }) {
  const today = useToday()
  const habits = useHabits()
  // The whole week of the day, for the weekly habits.
  const day = useDayLogs(date)
  const toast = useToast()
  const [menu, setMenu] = useState<Habit>()
  const [held, setHeld] = useState<{ date: DayKey; ids: string[] }>()
  const [settling, setSettling] = useState(false)
  const release = useRef<ReturnType<typeof setTimeout>>(undefined)

  const shownDate = day?.date ?? date
  const logs = day?.logs
  const active = (habits ?? []).filter((habit) => habit.archived === 0)
  const byHabit = new Map((logs ?? []).filter((log) => log.date === shownDate).map((log) => [log.habitId, log]))
  const weeks = weekResults(active, logs ?? [], shownDate, today)
  const target = orderForDay(active, byHabit, weeks).map((habit) => habit.id)
  const ids = held?.date === shownDate ? keepOrder(held.ids, target) : target
  // Habits slide to their new places only after the user's own tap; anything else puts them there.
  const itemRef = useReorderMotion(ids, settling)

  // Completing the last habit to do of the day (not opening a day already complete, nor skipping
  // the last one left) is worth a party.
  const goals = dayGoals(active, byHabit)
  // Weekly habits alone don't make a day "all done": the party is for the day's own habits.
  const allDone = goals.required.some((habit) => weeklyTimes(habit) === undefined) && goals.left.length === 0
  const doneCount = goals.done.length
  const seen = useRef<{ date: DayKey; allDone: boolean; done: number }>(undefined)
  useEffect(() => {
    if (!habits || !logs) return
    const before = seen.current
    if (before?.date === shownDate && !before.allDone && allDone && doneCount > before.done) {
      celebrate()
      toast({ message: 'Tudo feito hoje! ✨' })
    }
    seen.current = { date: shownDate, allDone, done: doneCount }
  }, [habits, logs, shownDate, allDone, doneCount, toast])

  useEffect(() => () => clearTimeout(release.current), [])
  useEffect(() => {
    if (!settling) return
    const timer = setTimeout(() => setSettling(false), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [settling])

  /** Keeps the list as it is on screen for a moment, then lets it settle, sliding to the new order. */
  function hold() {
    setHeld((current) => (current?.date === shownDate ? current : { date: shownDate, ids }))
    clearTimeout(release.current)
    release.current = setTimeout(() => {
      setHeld(undefined)
      setSettling(true)
    }, HOLD_MS)
  }

  // The habits and the day's logs both: with the habits alone, the list would come in unchecked and
  // in the wrong order, then jump.
  if (!habits || !logs) return <SkeletonLines lines={3} />
  if (active.length === 0) {
    return (
      <Empty>
        Nenhum hábito ainda.{' '}
        <Link to="/habitos" className="font-medium text-accent-ink underline underline-offset-2">
          Criar hábitos
        </Link>
      </Empty>
    )
  }

  const byId = new Map(active.map((habit) => [habit.id, habit]))
  const shown = ids.flatMap((id) => byId.get(id) ?? [])
  const item = (habit: Habit): ItemProps & { key: string } => ({
    key: habit.id,
    habit,
    log: byHabit.get(habit.id),
    week: weeks.get(habit.id),
    ref: itemRef(habit.id),
    onSet: (value) => {
      hold()
      tapFeedback()
      void setHabitValue(habit, shownDate, value)
    },
    // Only a habit to do can be skipped: one to avoid either happened or not, and setting the day
    // aside would hide it from the correlations.
    onMenu: () => {
      if (habit.polarity === 'good') setMenu(habit)
      else toast({ message: 'Só os hábitos a fazer podem ser pulados.' })
    },
  })
  const badges = showsBadges(active)

  return (
    <>
      {compact ? (
        <div className="relative grid grid-cols-2 gap-2">
          {shown.map((habit) => {
            const { key, ...props } = item(habit)
            return <HabitChip key={key} {...props} />
          })}
        </div>
      ) : (
        <ul className="relative divide-y divide-line">
          {shown.map((habit) => {
            const { key, ...props } = item(habit)
            return <HabitRow key={key} {...props} badge={badges} />
          })}
        </ul>
      )}
      {menu && (
        <SkipSheet
          habit={menu}
          date={shownDate}
          today={today}
          log={byHabit.get(menu.id)}
          onChange={hold}
          onClose={() => setMenu(undefined)}
        />
      )}
    </>
  )
}

const skipText = (log: HabitLog | undefined) => (log?.note ? `pulado · ${log.note}` : 'pulado')

const label = (habit: Habit, state: DayState, log: HabitLog | undefined, week: WeekResult | undefined) =>
  state === 'skipped' ? `${habit.name}, ${skipText(log)}` : week ? `${habit.name}, ${weekProgressText(week)}` : habit.name

/** "2/3 na semana"; in red once a habit to avoid is past its weekly limit. */
function WeekNote({ habit, week, className }: { habit: Habit; week: WeekResult; className?: string }) {
  const over = habit.polarity === 'bad' && !week.met
  return <span className={cx(over ? 'text-critical' : 'text-muted', className)}>{weekProgressText(week)}</span>
}

/** A habit as one button (yes/no) or a small stepper (counted), for the compact list. */
function HabitChip({ habit, log, week, onSet, onMenu, ref }: ItemProps) {
  const press = useLongPress(onMenu)
  const state = dayState(habit, log)
  const value = log?.value ?? 0
  const color = habitColor(habit)
  const skipped = state === 'skipped'
  const marked = state === 'done' || state === 'happened'
  const { pop, tap } = useTapPop(marked)
  const name = (
    <span className="min-w-0 flex-1">
      <span className={cx('line-clamp-2 leading-tight', skipped && 'text-muted')}>{habit.name}</span>
      {skipped ? (
        <span className="block truncate text-xs text-muted">{skipText(log)}</span>
      ) : (
        week && <WeekNote habit={habit} week={week} className="block truncate text-xs" />
      )}
    </span>
  )
  if (habit.kind === 'check') {
    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={marked}
        aria-label={label(habit, state, log, week)}
        {...press}
        onClick={() => {
          tap()
          onSet(marked ? 0 : 1)
        }}
        className={cx('flex min-h-11 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition active:scale-[0.97]', NO_SELECT)}
        style={{ background: marked ? `color-mix(in oklab, ${color} 16%, var(--surface-2))` : 'var(--surface-2)' }}
      >
        <HabitMark habit={habit} state={state} pop={pop} />
        {name}
      </button>
    )
  }
  const Icon = habitIcon(habit)
  return (
    <div
      ref={ref}
      {...press}
      className={cx('flex min-h-11 items-center gap-0.5 rounded-xl bg-surface-2 py-1 pr-1 pl-2.5 text-sm', NO_SELECT)}
    >
      {Icon && <Icon aria-hidden size={16} className="mr-1.5 shrink-0" style={{ color: skipped ? 'var(--muted)' : color }} />}
      {name}
      <IconButton label={`Diminuir ${habit.name}`} className="size-7" disabled={value <= 0} onClick={() => onSet(value - 1)}>
        <Minus size={14} />
      </IconButton>
      <span className={cx('w-5 text-center font-semibold tabular-nums', (value === 0 || skipped) && 'text-muted')}>{value}</span>
      <IconButton label={`Aumentar ${habit.name}`} className="size-7" onClick={() => onSet(value + 1)}>
        <Plus size={14} />
      </IconButton>
    </div>
  )
}

function HabitRow({ habit, log, week, onSet, onMenu, ref, badge }: ItemProps & { badge: boolean }) {
  const press = useLongPress(onMenu)
  const state = dayState(habit, log)
  const value = log?.value ?? 0
  const skipped = state === 'skipped'
  const marked = state === 'done' || state === 'happened'
  const { pop, tap } = useTapPop(marked)
  // A weekly habit says how its week goes instead of how often it's done.
  const detail = skipped
    ? `Pulado${log?.note ? ` · ${log.note}` : ''}`
    : [habitTime(habit), describeHabit(habit, { frequency: !week })].filter(Boolean).join(' · ')

  return (
    <li ref={ref} {...press} className={cx('flex items-center gap-3 bg-surface py-1.5', NO_SELECT)}>
      {badge && <HabitBadge habit={habit} muted={skipped} />}
      <div className="min-w-0 flex-1">
        <p className={cx('truncate text-sm font-medium', skipped && 'text-muted')}>{habit.name}</p>
        <p className="truncate text-xs text-muted">
          {!skipped && week && (
            <>
              <WeekNote habit={habit} week={week} />
              {' · '}
            </>
          )}
          {detail}
        </p>
      </div>
      {habit.kind === 'check' ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={marked}
          aria-label={label(habit, state, log, week)}
          onClick={() => {
            tap()
            onSet(marked ? 0 : 1)
          }}
          className="inline-flex size-11 items-center justify-center rounded-full transition active:scale-90"
        >
          <HabitMark habit={habit} state={state} size={28} icon={false} pop={pop} />
        </button>
      ) : (
        <div className="flex items-center">
          <IconButton label={`Diminuir ${habit.name}`} disabled={value <= 0} onClick={() => onSet(value - 1)}>
            <Minus size={18} />
          </IconButton>
          <span className={cx('w-8 text-center text-lg font-semibold tabular-nums', (value === 0 || skipped) && 'text-muted')}>
            {value}
          </span>
          <IconButton label={`Aumentar ${habit.name}`} onClick={() => onSet(value + 1)}>
            <Plus size={18} />
          </IconButton>
        </div>
      )}
    </li>
  )
}
