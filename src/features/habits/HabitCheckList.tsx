import { Circle, CircleCheckBig, Minus, Plus } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { celebrate } from '../../components/celebrate'
import { useToast } from '../../components/Toast'
import { cx, Empty, IconButton, SkeletonLines } from '../../components/ui'
import type { Habit } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { describeHabit, isSuccess, setHabitValue, useHabitLogs, useHabits } from './habits'

/**
 * The day's check-in: a toggle for yes/no habits, a stepper for counted ones. `compact` lays them
 * out as buttons two per row, without the description (the Hoje card).
 */
export function HabitCheckList({ date, compact = false }: { date: DayKey; compact?: boolean }) {
  const habits = useHabits()
  const logs = useHabitLogs(date, date)
  const toast = useToast()

  // Completing the last habit to do of the day (not opening a day already complete) is worth a party.
  const goals = (habits ?? []).filter((habit) => habit.archived === 0 && habit.polarity === 'good')
  const logged = new Map((logs ?? []).map((log) => [log.habitId, log.value]))
  const allDone = goals.length > 0 && goals.every((habit) => isSuccess(habit, logged.get(habit.id)))
  const seen = useRef<{ date: DayKey; allDone: boolean }>(undefined)
  useEffect(() => {
    if (!habits || !logs) return
    if (seen.current?.date === date && !seen.current.allDone && allDone) {
      celebrate()
      toast({ message: 'Tudo feito hoje! ✨' })
    }
    seen.current = { date, allDone }
  }, [habits, logs, date, allDone, toast])

  if (!habits) return <SkeletonLines lines={3} />

  const active = habits.filter((habit) => habit.archived === 0)
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

  const values = new Map((logs ?? []).map((log) => [log.habitId, log.value]))
  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {active.map((habit) => (
          <HabitChip key={habit.id} habit={habit} date={date} value={values.get(habit.id) ?? 0} />
        ))}
      </div>
    )
  }
  return (
    <ul className="divide-y divide-line">
      {active.map((habit) => (
        <HabitRow key={habit.id} habit={habit} date={date} value={values.get(habit.id) ?? 0} />
      ))}
    </ul>
  )
}

/** A habit as one button (yes/no) or a small stepper (counted), for the compact list. */
function HabitChip({ habit, date, value }: { habit: Habit; date: DayKey; value: number }) {
  const done = value > 0
  const color = habit.polarity === 'good' ? 'var(--series-1)' : 'var(--series-2)'
  if (habit.kind === 'check') {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={habit.name}
        onClick={() => void setHabitValue(habit, date, done ? 0 : 1)}
        className="flex min-h-11 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition active:scale-[0.97]"
        style={{ background: done ? `color-mix(in oklab, ${color} 16%, var(--surface-2))` : 'var(--surface-2)' }}
      >
        {done ? (
          <CircleCheckBig size={18} className="shrink-0 animate-pop" style={{ color }} />
        ) : (
          <Circle size={18} className="shrink-0 text-baseline" />
        )}
        <span className="line-clamp-2 min-w-0 leading-tight">{habit.name}</span>
      </button>
    )
  }
  return (
    <div className="flex min-h-11 items-center gap-0.5 rounded-xl bg-surface-2 py-1 pr-1 pl-2.5 text-sm">
      <span className="line-clamp-2 min-w-0 flex-1 leading-tight">{habit.name}</span>
      <IconButton label={`Diminuir ${habit.name}`} className="size-7" disabled={value <= 0} onClick={() => void setHabitValue(habit, date, value - 1)}>
        <Minus size={14} />
      </IconButton>
      <span className={cx('w-5 text-center font-semibold tabular-nums', !done && 'text-muted')}>{value}</span>
      <IconButton label={`Aumentar ${habit.name}`} className="size-7" onClick={() => void setHabitValue(habit, date, value + 1)}>
        <Plus size={14} />
      </IconButton>
    </div>
  )
}

function HabitRow({ habit, date, value }: { habit: Habit; date: DayKey; value: number }) {
  const done = value > 0
  // Blue marks a good habit done; orange marks a habit to avoid that happened.
  const doneColor = habit.polarity === 'good' ? 'text-series-1' : 'text-series-2'

  return (
    <li className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{habit.name}</p>
        <p className="text-xs text-muted">{describeHabit(habit)}</p>
      </div>
      {habit.kind === 'check' ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={habit.name}
          onClick={() => void setHabitValue(habit, date, done ? 0 : 1)}
          className="inline-flex size-11 items-center justify-center rounded-full transition active:scale-90"
        >
          {done ? (
            <CircleCheckBig size={28} className={cx(doneColor, 'animate-pop')} />
          ) : (
            <Circle size={28} className="text-baseline" />
          )}
        </button>
      ) : (
        <div className="flex items-center">
          <IconButton
            label={`Diminuir ${habit.name}`}
            disabled={value <= 0}
            onClick={() => void setHabitValue(habit, date, value - 1)}
          >
            <Minus size={18} />
          </IconButton>
          <span className={cx('w-8 text-center text-lg font-semibold tabular-nums', !done && 'text-muted')}>{value}</span>
          <IconButton label={`Aumentar ${habit.name}`} onClick={() => void setHabitValue(habit, date, value + 1)}>
            <Plus size={18} />
          </IconButton>
        </div>
      )}
    </li>
  )
}
