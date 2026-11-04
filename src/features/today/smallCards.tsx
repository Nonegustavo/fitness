import { CalendarRange, Dumbbell, GlassWater, ListChecks, Moon, NotebookPen, Play, Plus, Sparkles, Utensils } from 'lucide-react'
import { useToast } from '../../components/Toast'
import { toneColor } from '../../components/tone'
import { IconButton } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { remove } from '../../db/repo'
import { db } from '../../db/schema'
import type { DayKey } from '../../lib/dates'
import { formatDuration, formatMl, formatNumber } from '../../lib/format'
import { useInsight } from '../analysis/daily'
import { useTodayTemplate } from '../calendar/plans'
import { goalsFor, sumNutrients, useFoodLogs, useTrainingDays } from '../food/nutrition'
import { latestNight, sleepQuality } from '../garmin/recovery'
import { isSuccess, useHabitLogs, useHabits } from '../habits/habits'
import { ENERGY, levelOf, MOODS, useJournalEntry } from '../journal/journal'
import { useStartWorkout } from '../training/components'
import { findActive, useSessions } from '../training/training'
import { addWater, sumMl, useContainers, useWaterLogs } from '../water/water'
import { Note, SmallCard, ThinBar, TileSkeleton, useRecentHealth, Value } from './tiles'
import { useLastWeek } from './WeeklyCard'

/** Today's workout in short, with a button to start it. */
export function WorkoutSmall({ today }: { today: DayKey }) {
  const sessions = useSessions()
  const todays = useTodayTemplate(today)
  const start = useStartWorkout()
  if (!sessions) return <TileSkeleton />
  const active = findActive(sessions)
  const doneToday = sessions.find((session) => session.endedAt && session.date === today)
  let title = todays?.template.name ?? '—'
  let note = todays?.plan ? `programado para hoje${todays.plan.time ? ` às ${todays.plan.time}` : ''}` : 'próxima ficha'
  let to = '/treinos'
  if (active) {
    title = active.name
    note = 'em andamento'
    to = `/treinos/sessao/${active.id}`
  } else if (doneToday && !todays?.plan) {
    title = doneToday.name
    note = 'feito hoje'
    to = `/treinos/sessao/${doneToday.id}`
  }
  const startable = !active && todays && !(doneToday && !todays.plan)
  return (
    <SmallCard
      icon={Dumbbell}
      tone="training"
      label="Treino"
      to={to}
      action={
        startable && (
          <IconButton label={`Iniciar ${todays.template.name}`} className="size-8 text-accent-ink" onClick={() => void start(todays.template)}>
            <Play size={18} />
          </IconButton>
        )
      }
    >
      <span className="block truncate text-lg leading-tight font-semibold">{title}</span>
      <Note>{note}</Note>
    </SmallCard>
  )
}

export function SleepSmall({ today }: { today: DayKey }) {
  const days = useRecentHealth(today, 1)
  if (!days) return <TileSkeleton />
  const night = latestNight(days)
  if (!night?.sleep) return null
  const { sleep } = night
  return (
    <SmallCard icon={Moon} tone="sleep" label="Sono" to="/sono">
      <Value value={sleep.score ?? formatDuration(sleep.totalSec * 1000)} />
      <Note>
        {sleep.score !== undefined ? `${sleepQuality(sleep.score)} · ${formatDuration(sleep.totalSec * 1000)}` : 'dormiu'}
      </Note>
    </SmallCard>
  )
}

export function FoodSmall({ today }: { today: DayKey }) {
  const settings = useSettings()
  const logs = useFoodLogs(today, today)
  const trainingDay = useTrainingDays(today, today)?.has(today) ?? false
  if (!logs) return <TileSkeleton />
  const totals = sumNutrients(logs.map((log) => log.nutrients))
  const goals = goalsFor(settings, trainingDay)
  const left = goals ? goals.kcal - totals.kcal : undefined
  return (
    <SmallCard icon={Utensils} tone="food" label="Alimentação" to="/alimentacao">
      <Value value={formatNumber(left === undefined ? totals.kcal : Math.abs(left), 0)} unit={left === undefined ? 'kcal' : left >= 0 ? 'faltam' : 'acima'} />
      {goals && <ThinBar value={totals.kcal} max={goals.kcal} color={toneColor('food')} />}
      <Note>
        P {formatNumber(totals.protein, 0)} · C {formatNumber(totals.carbs, 0)} · G {formatNumber(totals.fat, 0)} g
      </Note>
    </SmallCard>
  )
}

/** The day's water against the goal, and "+" for the first favorite container. */
export function WaterSmall({ today }: { today: DayKey }) {
  const settings = useSettings()
  const logs = useWaterLogs(today, today)
  const containers = useContainers()
  const toast = useToast()
  if (!logs) return <TileSkeleton />
  const total = sumMl(logs)
  const favorite = containers?.find((container) => container.favorite === 1)
  const add = async () => {
    if (!favorite) return
    const log = await addWater(favorite.ml, favorite.id)
    toast({
      message: `+${formatMl(favorite.ml)} de água (${favorite.name})`,
      action: { label: 'Desfazer', onClick: () => void remove(db.waterLogs, log.id) },
    })
  }
  return (
    <SmallCard
      icon={GlassWater}
      tone="water"
      label="Água"
      to="/agua"
      action={
        favorite && (
          <IconButton label={`Adicionar ${favorite.name}, ${formatMl(favorite.ml)}`} className="size-8" onClick={() => void add()}>
            <Plus size={18} />
          </IconButton>
        )
      }
    >
      <Value value={formatNumber(total / 1000, 1)} unit={`de ${formatNumber(settings.waterGoalMl / 1000, 1)} L`} />
      <ThinBar value={total} max={settings.waterGoalMl} color={toneColor('water')} />
      {favorite && <Note>+ {favorite.name.toLowerCase()} de {formatMl(favorite.ml)}</Note>}
    </SmallCard>
  )
}

export function HabitsSmall({ today }: { today: DayKey }) {
  const habits = useHabits()
  const logs = useHabitLogs(today, today)
  if (!habits || !logs) return <TileSkeleton />
  const goals = habits.filter((habit) => habit.archived === 0 && habit.polarity === 'good')
  if (goals.length === 0) return null
  const values = new Map(logs.map((log) => [log.habitId, log.value]))
  const done = goals.filter((habit) => isSuccess(habit, values.get(habit.id))).length
  return (
    <SmallCard icon={ListChecks} tone="habits" label="Hábitos" to="/habitos">
      <Value value={`${done}/${goals.length}`} />
      <ThinBar value={done} max={goals.length} color={toneColor('habits')} />
      <Note>{done === goals.length ? 'tudo feito hoje 🎉' : `faltam ${goals.length - done}`}</Note>
    </SmallCard>
  )
}

export function JournalSmall({ today }: { today: DayKey }) {
  const entry = useJournalEntry(today)
  if (entry === undefined) return <TileSkeleton />
  const mood = levelOf(MOODS, entry?.mood)
  const energy = levelOf(ENERGY, entry?.energy)
  return (
    <SmallCard icon={NotebookPen} tone="journal" label="Diário" to="/diario">
      {entry ? (
        <>
          <span className="block text-2xl leading-tight">
            {mood?.emoji ?? '·'} {energy?.emoji ?? ''}
          </span>
          <Note clamp={2}>{entry.text?.trim() || [mood?.label, energy?.label].filter(Boolean).join(' · ')}</Note>
        </>
      ) : (
        <>
          <span className="block text-lg leading-tight font-semibold">Como foi o dia?</span>
          <Note>toque para escrever</Note>
        </>
      )}
    </SmallCard>
  )
}

export function InsightSmall({ today }: { today: DayKey }) {
  const insight = useInsight(today)
  if (!insight) return null
  return (
    <SmallCard icon={Sparkles} tone="analysis" label="Análise do dia" to="/analise">
      <span className="line-clamp-3 text-sm leading-snug font-medium">{insight.headline}</span>
    </SmallCard>
  )
}

export function LastWeekSmall({ today }: { today: DayKey }) {
  const week = useLastWeek(today)
  if (!week) return <TileSkeleton />
  if (week.rows.length === 0) return null
  return (
    <SmallCard icon={CalendarRange} tone="insights" label="Semana passada">
      <ul className="space-y-0.5 text-xs">
        {week.rows.slice(0, 3).map((row) => (
          <li key={row.label} className="flex justify-between gap-2">
            <span className="min-w-0 truncate text-ink-2">{row.label.replace(/ \(.*\)$/, '')}</span>
            <span className="max-w-[55%] truncate font-medium tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
    </SmallCard>
  )
}

