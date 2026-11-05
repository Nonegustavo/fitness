import type { ActivityStream, DailyInsight, Exercise, Habit, MeasurementEntry, Settings } from '../../db/types'
import { dayRange, formatDay, formatTime, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
import type { AgendaItem } from '../calendar/agenda'
import type { PlannedEvent } from '../garmin/calendar'
import { describe, highlights, strengthLabel } from '../insights/analysis'
import { buildDailyData, formatMetric, type DailyData, type DayRow, type Metric, type Sources } from '../insights/metrics'
import { mean } from '../insights/stats'
import { firstDayOf } from '../insights/useDailyData'
import {
  adherenceLines,
  bodyLines,
  compositionText,
  dayWorkouts,
  energyLines,
  freshnessLines,
  mealsText,
  measurementText,
  oneLine,
  recoveryParts,
  runningLines,
  sleepParts,
  strengthLines,
  weekLines,
  type Freshness,
} from './contextParts'

export const DETAIL_DAYS = 14
/** The last days get each meal and what was in it; the older ones, the totals. */
const MEAL_DAYS = 7
const TREND_DAYS = 30
const DIARY_CHARS = 600
const PLANNED_DAYS = 7
export const PROFILE_CHARS = 3000

export interface ContextInput {
  sources: Sources
  settings: Settings
  /** The coach's workouts from the Garmin calendar; `time` is the one the user planned, when set. */
  planned: PlannedEvent[] | null
  /** Templates scheduled in the app and not done yet. */
  gymPlans?: { date: DayKey; name: string; time?: string }[]
  /** Yesterday's analysis, so today's doesn't repeat it. */
  previous?: DailyInsight
  /** The analyses of the last days, for their tips. */
  insights?: DailyInsight[]
  /** Exercise names and muscles, for the gym workouts. */
  exercises?: Map<string, Exercise>
  measurements?: MeasurementEntry[]
  /** The runs' distance samples, for the best efforts. */
  streams?: Map<string, Pick<ActivityStream, 'step' | 'distance'>>
  /** The calendar of the last two weeks and the next one: planned against done. */
  agenda?: AgendaItem[]
  /** When each source last brought data. */
  synced?: Freshness
  today: DayKey
  now: Date
}

/** What a day of data would need for the analysis to say anything. */
export function hasRecentData(sources: Sources, today: DayKey): boolean {
  const data = buildDailyData(sources, shiftDay(today, -6), today)
  return [...data.rows.values()].filter((row) => Object.keys(row).length >= 3).length >= 3
}

const section = (out: string[], title: string, lines: string[]) => {
  if (lines.length > 0) out.push('', `## ${title}`, ...lines)
}

/**
 * Everything the daily analysis reads, as plain text: the goals, how fresh the data is, the last
 * two weeks day by day (sleep, recovery, each workout with what the user said about it, the meals,
 * the diary), the last weeks one line each, the lifts, the running, the body, the energy balance,
 * how well the plan and the habits were kept, the last month against the one before, the relations
 * the app found and the workouts planned ahead. Built on the device, from the local data.
 */
export function buildContext(input: ContextInput): string {
  const { sources, settings, planned, gymPlans, previous, today, now } = input
  const exercises = input.exercises ?? new Map<string, Exercise>()
  const first = firstDayOf(sources) ?? today
  const all = buildDailyData(sources, first, today)
  const metric = new Map(all.metrics.map((m) => [m.key, m]))
  const habits = sources.habits.filter((habit) => !habit.archived)
  const out: string[] = []

  out.push(`Hoje é ${formatDay(today, "EEEE, d 'de' MMMM 'de' yyyy")}; agora são ${formatTime(now.getTime())}.`)
  if (previous) out.push(`A análise de ontem começou com: "${previous.headline}". Não repita, traga o que mudou.`)

  const profile = settings.profile?.trim()
  if (profile) {
    out.push('', '## Sobre a pessoa (escrito por ela)')
    out.push('Leve em conta a rotina, as limitações e os objetivos abaixo ao interpretar os dados e ao dar dicas.')
    out.push(profile.slice(0, PROFILE_CHARS))
  }

  out.push('', '## Metas')
  out.push(`- Água: ${formatNumber(settings.waterGoalMl / 1000, 1)} L por dia.`)
  const goals = settings.nutrition
  if (goals) {
    out.push(`- Alimentação: ${macros(goals.normal)} por dia.`)
    if (goals.training) out.push(`- Em dia de treino: ${macros(goals.training)}.`)
  }
  const weightGoal = settings.weightGoal
  if (weightGoal) {
    const rate = formatNumber(Math.abs(weightGoal.kgPerWeek), 2)
    const pace =
      weightGoal.kgPerWeek === 0 ? 'manter' : `${weightGoal.kgPerWeek < 0 ? 'perder' : 'ganhar'} ${rate} kg por semana`
    out.push(`- Peso: chegar a ${formatNumber(weightGoal.targetKg, 1)} kg (${pace}).`)
  }
  for (const habit of habits) out.push(`- Hábito: ${describeHabit(habit)}.`)

  const todaysLogs = sources.foodLogs.filter((log) => log.date === today)
  section(
    out,
    'De quando são os dados',
    freshnessLines(input.synced ?? {}, {
      date: today,
      weighed: sources.weights.some((entry) => entry.date === today),
      lastMeal: todaysLogs.length ? Math.max(...todaysLogs.map((log) => log.time)) : undefined,
      slept: sources.health.some((row) => row.id === today && row.sleep),
      workouts:
        sources.activities.filter((activity) => activity.date === today).length +
        sources.sessions.filter((session) => session.date === today && session.endedAt).length,
    }),
  )

  out.push('', `## Últimos ${DETAIL_DAYS} dias (do mais recente)`)
  dayRange(shiftDay(today, -(DETAIL_DAYS - 1)), today)
    .reverse()
    .forEach((day, index) => {
      out.push(dayLine(day, all.rows.get(day), metric, input, habits, exercises))
      if (index < MEAL_DAYS) {
        const meals = mealsText(sources.foodLogs.filter((log) => log.date === day))
        if (meals) out.push(`  Refeições: ${meals}`)
      }
      const diary = sources.journal.find((entry) => entry.id === day)?.text.trim()
      if (diary) out.push(`  Diário: "${diary.length > DIARY_CHARS ? `${diary.slice(0, DIARY_CHARS)}…` : diary}"`)
    })

  section(out, 'Semanas (domingo a sábado; da mais antiga à atual)', weekLines(sources, today))
  section(out, 'Musculação', strengthLines(sources.sessions, exercises, today))
  const week = weekStart(today)
  section(
    out,
    'Corrida',
    runningLines(
      {
        activities: sources.activities,
        streams: input.streams,
        weekAgenda: input.agenda?.filter((item) => item.date >= week && item.date <= shiftDay(week, 6)),
        events: planned,
      },
      today,
    ),
  )
  section(
    out,
    'Corpo',
    bodyLines({ weights: sources.weights, measurements: input.measurements ?? [], sites: settings.measurementSites, settings }, today),
  )
  section(out, 'Energia e proteína', energyLines({ foodLogs: sources.foodLogs, weights: sources.weights, health: sources.health }, today))
  section(
    out,
    'Constância e aderência',
    adherenceLines(
      {
        agenda: input.agenda,
        habits: sources.habits,
        habitLogs: sources.habitLogs,
        water: sources.waterLogs,
        foodLogs: sources.foodLogs,
        sessions: sources.sessions,
        settings,
        insights: input.insights,
      },
      today,
    ),
  )

  const trends = trendLines(all, today, metric)
  if (trends.length > 0) out.push('', `## Últimos ${TREND_DAYS} dias contra os ${TREND_DAYS} anteriores (médias)`, ...trends)

  const found = highlights(all)
  if (found.length > 0) {
    out.push('', '## Relações que o app encontrou nos dados (estatística, não prova de causa)')
    for (const finding of found) out.push(`- ${describe(finding)} (relação ${strengthLabel(finding)}, ${finding.n} dias)`)
  }

  const ahead = (planned ?? []).filter((event) => event.date >= today && event.date <= shiftDay(today, PLANNED_DAYS))
  if (ahead.length > 0) {
    out.push('', '## Treinos planejados (SisRUN, pelo Garmin)')
    for (const event of ahead) {
      const detail = event.description ? oneLine(event.description.replace(/\s+/g, ' '), 300) : ''
      const at = event.time !== undefined ? ` às ${formatTime(event.time)}` : ''
      out.push(`- ${formatDay(event.date, 'EEE d/MM')}${at}: ${event.title}${detail ? ` — ${detail}` : ''}`)
    }
  }

  const gym = (gymPlans ?? []).filter((plan) => plan.date >= today && plan.date <= shiftDay(today, PLANNED_DAYS))
  if (gym.length > 0) {
    out.push('', '## Musculação programada no app')
    for (const plan of gym) out.push(`- ${formatDay(plan.date, 'EEE d/MM')}: ${plan.name}${plan.time ? ` às ${plan.time}` : ''}`)
  }
  return out.join('\n')
}

const macros = (goals: { kcal: number; protein: number; carbs: number; fat: number }) =>
  `${formatNumber(goals.kcal, 0)} kcal, proteína ${formatNumber(goals.protein, 0)} g, carboidratos ${formatNumber(goals.carbs, 0)} g, gorduras ${formatNumber(goals.fat, 0)} g`

function describeHabit(habit: Habit): string {
  const aim = habit.polarity === 'good' ? 'fazer' : 'evitar'
  if (habit.kind === 'check') return `${habit.name} (${aim})`
  const unit = habit.unit ? ` ${habit.unit}` : ''
  const target = habit.target === undefined ? '' : `, ${habit.polarity === 'good' ? 'meta' : 'limite'} ${formatNumber(habit.target)}${unit} por dia`
  return `${habit.name} (${aim}, quantidade${target})`
}

function dayLine(
  day: DayKey,
  row: DayRow | undefined,
  metric: Map<string, Metric>,
  { sources, settings, measurements }: ContextInput,
  habits: Habit[],
  exercises: Map<string, Exercise>,
) {
  const value = (key: string) => row?.[key]
  const show = (key: string) => {
    const v = value(key)
    const m = metric.get(key)
    return v === undefined || !m ? undefined : formatMetric(m, v)
  }
  const health = sources.health.find((entry) => entry.id === day)
  const parts: string[] = [...sleepParts(health)]
  if (!health?.sleep && show('sleepHours')) parts.push(`sono ${show('sleepHours')}`)
  parts.push(...recoveryParts(health))

  const workouts = dayWorkouts(day, sources.activities, sources.sessions, exercises)
  if (workouts.length > 0) parts.push(`treino: ${workouts.join('; ')}`)
  else if (value('activityMinutes') === 0) parts.push('sem treino')

  if (value('kcal') !== undefined) {
    const last = show('lastMeal') ? `, última refeição às ${show('lastMeal')}` : ''
    parts.push(`comeu ${show('kcal')} (proteína ${show('protein')}, carboidratos ${show('carbs')}, gorduras ${show('fat')}${last})`)
  }
  if (show('water')) parts.push(`água ${show('water')}`)
  const weighIn = sources.weights.filter((entry) => entry.date === day).sort((a, b) => a.time - b.time)[0]
  if (weighIn) {
    const composition = compositionText(weighIn)
    parts.push(`peso ${formatNumber(weighIn.weightKg, 1)} kg${composition ? ` (${composition})` : ''}`)
  }
  const measured = (measurements ?? []).find((entry) => entry.date === day)
  const sizes = measured && measurementText(measured, settings.measurementSites)
  if (sizes) parts.push(sizes)
  if (show('mood')) parts.push(`humor ${show('mood')}/5`)
  if (show('energy')) parts.push(`energia ${show('energy')}/5`)

  const habitParts = habits.flatMap((habit) => {
    const v = value(`habit:${habit.id}`)
    if (v === undefined) return []
    return habit.kind === 'check' ? [`${habit.name} ${v > 0 ? 'sim' : 'não'}`] : [`${habit.name} ${formatNumber(v)}${habit.unit ? ` ${habit.unit}` : ''}`]
  })
  if (habitParts.length > 0) parts.push(`hábitos: ${habitParts.join(', ')}`)

  return `- ${formatDay(day, 'EEE d/MM')}: ${parts.length > 0 ? parts.join(' · ') : 'sem dados'}`
}

const TREND_KEYS = [
  'sleepHours',
  'sleepScore',
  'hrv',
  'restingHr',
  'bodyBattery',
  'stress',
  'steps',
  'kcal',
  'protein',
  'water',
  'weight',
  'bodyFat',
  'mood',
  'energy',
]

function trendLines(data: DailyData, today: DayKey, metric: Map<string, Metric>): string[] {
  const recent = dayRange(shiftDay(today, -(TREND_DAYS - 1)), today)
  const before = dayRange(shiftDay(today, -(2 * TREND_DAYS - 1)), shiftDay(today, -TREND_DAYS))
  const values = (days: DayKey[], key: string) => days.flatMap((day) => (data.rows.get(day)?.[key] === undefined ? [] : [data.rows.get(day)![key]]))
  const lines: string[] = []
  for (const key of TREND_KEYS) {
    const m = metric.get(key)
    const now = values(recent, key)
    if (!m || now.length < 5) continue
    const then = values(before, key)
    const comparison = then.length >= 5 ? ` (antes: ${formatMetric(m, mean(then))})` : ''
    lines.push(`- ${m.label}: ${formatMetric(m, mean(now))}${comparison}`)
  }
  // Training as time per week, counting the days without any.
  const minutes = (days: DayKey[]) => values(days, 'activityMinutes')
  const nowMinutes = minutes(recent)
  if (nowMinutes.length >= 7) {
    const perWeek = (list: number[]) => formatDuration((list.reduce((sum, v) => sum + v, 0) / list.length) * 7 * 60_000)
    const thenMinutes = minutes(before)
    lines.push(`- Treino por semana: ${perWeek(nowMinutes)}${thenMinutes.length >= 7 ? ` (antes: ${perWeek(thenMinutes)})` : ''}`)
  }
  return lines
}
