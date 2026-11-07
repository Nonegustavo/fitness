import { CalendarRange, GlassWater, ListChecks, Moon, NotebookPen, Play, Plus, Sparkles, Utensils } from 'lucide-react'
import { toneColor } from '../../components/tone'
import { IconButton } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { formatTime, type DayKey } from '../../lib/dates'
import { formatDuration, formatMl, formatNumber } from '../../lib/format'
import type { InsightWait } from '../analysis/daily'
import { useTodayInsight } from '../analysis/TodayInsightCard'
import { shortTitle, type AgendaKind } from '../calendar/agenda'
import { KIND_ICONS, KIND_TONES } from '../calendar/components'
import { useAgenda, useTodayTemplate } from '../calendar/plans'
import { goalsFor, sumNutrients, useFoodLogs, useTrainingDays } from '../food/nutrition'
import { latestNight, sleepQuality } from '../garmin/recovery'
import { dayGoals } from '../habits/day'
import { useHabits, useWeekLogs, weeklyTimes, weekResults } from '../habits/habits'
import { ENERGY, levelOf, MOODS, useJournalEntry } from '../journal/journal'
import { useStartWorkout } from '../training/components'
import { sumMl, useContainers, useWaterLogs } from '../water/water'
import { useAddWater } from '../water/WaterQuickAdd'
import { Note, SmallCard, ThinBar, TileSkeleton, useRecentHealth, Value } from './tiles'
import { useLastWeek } from './WeeklyCard'

/** Today's workout in short (gym or run), with a button to start a gym workout. */
export function WorkoutSmall({ today }: { today: DayKey }) {
  const agenda = useAgenda(today, today, today)
  const todays = useTodayTemplate(today)
  const start = useStartWorkout()
  // The template too, or its name and button would come in after the card.
  if (!agenda || todays === undefined) return <TileSkeleton />
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
  const trainingDays = useTrainingDays(today, today)
  if (!logs || !trainingDays) return <TileSkeleton />
  const totals = sumNutrients(logs.map((log) => log.nutrients))
  const goals = goalsFor(settings, trainingDays.has(today))
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
  const addWater = useAddWater()
  if (!logs || !containers) return <TileSkeleton />
  const total = sumMl(logs)
  const favorite = containers?.find((container) => container.favorite === 1)
  const add = () => favorite && addWater(favorite.ml, favorite)
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
  // The whole week, for the weekly habits.
  const logs = useWeekLogs(today)
  if (!habits || !logs) return <TileSkeleton />
  const active = habits.filter((habit) => habit.archived === 0)
  if (!active.some((habit) => habit.polarity === 'good')) return null
  // The weekly habits to do: how many have met this week's target.
  const weekly = active.filter((habit) => habit.polarity === 'good' && weeklyTimes(habit) !== undefined)
  const weeks = weekResults(weekly, logs, today, today)
  const weeksMet = weekly.filter((habit) => weeks.get(habit.id)?.met).length
  if (weekly.length === active.filter((habit) => habit.polarity === 'good').length) {
    // Only weekly habits to do: the week is what counts.
    return (
      <SmallCard icon={ListChecks} tone="habits" label="Hábitos" to="/habitos">
        <Value value={`${weeksMet}/${weekly.length}`} />
        <ThinBar value={weeksMet} max={weekly.length} color={toneColor('habits')} />
        <Note>{weeksMet === weekly.length ? 'semana feita 🎉' : weekly.length === 1 ? 'meta da semana' : 'metas da semana'}</Note>
      </SmallCard>
    )
  }
  // The day's goals leave out the habits skipped today ("Hoje não vou fazer") and the weekly ones
  // not done today.
  const goals = dayGoals(active, new Map(logs.filter((log) => log.date === today).map((log) => [log.habitId, log])))
  const done = goals.done.length
  const total = goals.required.length
  const week = weekly.length > 0 ? ` · semana ${weeksMet}/${weekly.length}` : ''
  return (
    <SmallCard icon={ListChecks} tone="habits" label="Hábitos" to="/habitos">
      <Value value={total === 0 ? '—' : `${done}/${total}`} />
      <ThinBar value={done} max={Math.max(total, 1)} color={toneColor('habits')} />
      <Note>
        {total === 0 ? 'pulados hoje' : done === total ? (week ? 'tudo feito 🎉' : 'tudo feito hoje 🎉') : `faltam ${total - done}`}
        {week}
      </Note>
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

/** Why there's no analysis yet, in short (the analysis screen has the rest). */
const INSIGHT_WAITS: Record<InsightWait, string> = {
  soon: 'sai sozinha depois de sincronizar',
  off: 'a automática está desligada',
  failed: 'não deu certo hoje; toque para tentar',
  signedOut: 'entre na sua conta para usar',
}

export function InsightSmall({ today }: { today: DayKey }) {
  const { insight, loading, generating, wait } = useTodayInsight(today)
  if (loading) return <TileSkeleton />
  return (
    <SmallCard icon={Sparkles} tone="analysis" label="Análise do dia" to="/analise">
      {insight ? (
        <span className="line-clamp-3 text-sm leading-snug font-medium">{insight.headline}</span>
      ) : (
        <>
          <span className="block text-base leading-tight font-semibold">{generating ? 'Lendo seus dados…' : 'Ainda não feita'}</span>
          {!generating && <Note clamp={2}>{INSIGHT_WAITS[wait]}</Note>}
        </>
      )}
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
    <SmallCard icon={CalendarRange} tone="insights" label="Semana passada" to="/semana">
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

