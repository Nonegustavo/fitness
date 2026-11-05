import { CalendarRange, GlassWater, ListChecks, Moon, NotebookPen, Play, Plus, Sparkles, Utensils } from 'lucide-react'
import { useToast } from '../../components/Toast'
import { toneColor } from '../../components/tone'
import { IconButton } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { remove } from '../../db/repo'
import { db } from '../../db/schema'
import { formatTime, type DayKey } from '../../lib/dates'
import { formatDuration, formatMl, formatNumber } from '../../lib/format'
import { useInsight } from '../analysis/daily'
import { shortTitle, type AgendaKind } from '../calendar/agenda'
import { KIND_ICONS, KIND_TONES } from '../calendar/components'
import { useAgenda, useTodayTemplate } from '../calendar/plans'
import { goalsFor, sumNutrients, useFoodLogs, useTrainingDays } from '../food/nutrition'
import { latestNight, sleepQuality } from '../garmin/recovery'
import { isSuccess, useHabitLogs, useHabits } from '../habits/habits'
import { ENERGY, levelOf, MOODS, useJournalEntry } from '../journal/journal'
import { useStartWorkout } from '../training/components'
import { addWater, sumMl, useContainers, useWaterLogs } from '../water/water'
import { Note, SmallCard, ThinBar, TileSkeleton, useRecentHealth, Value } from './tiles'
import { useLastWeek } from './WeeklyCard'

/** Today's workout in short (gym or run), with a button to start a gym workout. */
export function WorkoutSmall({ today }: { today: DayKey }) {
  const agenda = useAgenda(today, today, today)
  const todays = useTodayTemplate(today)
  const start = useStartWorkout()
  if (!agenda) return <TileSkeleton />
  const items = agenda.filter((item) => item.kind !== 'rest')
  const current = items.find((item) => item.status === 'active') ?? items.find((item) => item.status === 'planned')
  const done = items.filter((item) => item.status === 'done')
  let kind: AgendaKind = 'gym'
  let title = todays?.template.name ?? '—'
  let note = 'próxima ficha'
  let to = '/treinos'
  if (current) {
    kind = current.kind
    title = shortTitle(current)
    note = current.status === 'active' ? 'em andamento' : `hoje${current.time !== undefined ? ` às ${formatTime(current.time)}` : ''}`
    to = current.session ? `/treinos/sessao/${current.session.id}` : `/calendario?dia=${today}`
  } else if (done.length > 0) {
    kind = done[0].kind
    title = done.map(shortTitle).join(' · ')
    note = 'feito hoje'
    to = `/calendario?dia=${today}`
  }
  // The template to start: today's, or the rotation's next when nothing else is on.
  const startable = current ? current.kind === 'gym' && current.status === 'planned' : done.length === 0
  return (
    <SmallCard
      icon={KIND_ICONS[kind]}
      tone={KIND_TONES[kind]}
      label="Treino"
      to={to}
      action={
        startable &&
        todays && (
          <IconButton label={`Iniciar ${todays.template.name}`} className="size-8 text-accent-ink" onClick={() => void start(todays.template)}>
            <Play size={18} />
          </IconButton>
        )
      }
    >
      <span className="line-clamp-2 text-base leading-tight font-semibold">{title}</span>
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
  const key = week.rows.filter((row) => row.key !== undefined).sort((a, b) => a.key! - b.key!)
  const shown = (key.length >= 3 ? key : [...key, ...week.rows.filter((row) => row.key === undefined)]).slice(0, 3)
  return (
    <SmallCard icon={CalendarRange} tone="insights" label="Semana passada">
      <dl className="space-y-1">
        {shown.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2">
            <dt className="min-w-0 truncate text-xs text-ink-2">{row.short ?? row.label}</dt>
            <dd className="shrink-0 text-sm font-semibold tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </SmallCard>
  )
}

