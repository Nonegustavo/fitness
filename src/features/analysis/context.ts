import type { DailyInsight, Habit, Settings } from '../../db/types'
import { dayRange, formatDay, formatTime, shiftDay, type DayKey } from '../../lib/dates'
import { formatDuration, formatNumber } from '../../lib/format'
import { activityLabel } from '../activities/activities'
import type { PlannedEvent } from '../garmin/calendar'
import { describe, highlights, strengthLabel } from '../insights/analysis'
import { buildDailyData, formatMetric, type DailyData, type DayRow, type Metric, type Sources } from '../insights/metrics'
import { mean } from '../insights/stats'
import { firstDayOf } from '../insights/useDailyData'
import { summarize } from '../training/stats'

export const DETAIL_DAYS = 14
const TREND_DAYS = 30
const DIARY_CHARS = 600
const PLANNED_DAYS = 7

export interface ContextInput {
  sources: Sources
  settings: Settings
  planned: PlannedEvent[] | null
  /** Yesterday's analysis, so today's doesn't repeat it. */
  previous?: DailyInsight
  today: DayKey
  now: Date
}

/** What a day of data would need for the analysis to say anything. */
export function hasRecentData(sources: Sources, today: DayKey): boolean {
  const data = buildDailyData(sources, shiftDay(today, -6), today)
  return [...data.rows.values()].filter((row) => Object.keys(row).length >= 3).length >= 3
}

/**
 * Everything the daily analysis reads, as plain text: the last two weeks day by day (with the
 * diary), the last month against the one before, the goals, the relations the app found in the
 * data and the workouts planned ahead. Built on the device, from the local data.
 */
export function buildContext({ sources, settings, planned, previous, today, now }: ContextInput): string {
  const first = firstDayOf(sources) ?? today
  const all = buildDailyData(sources, first, today)
  const metric = new Map(all.metrics.map((m) => [m.key, m]))
  const out: string[] = []

  out.push(`Hoje é ${formatDay(today, "EEEE, d 'de' MMMM 'de' yyyy")}; agora são ${formatTime(now.getTime())}.`)
  if (previous) out.push(`A análise de ontem começou com: "${previous.headline}". Não repita, traga o que mudou.`)

  out.push('', '## Metas')
  out.push(`- Água: ${formatNumber(settings.waterGoalMl / 1000, 1)} L por dia.`)
  const goals = settings.nutrition
  if (goals) {
    out.push(`- Alimentação: ${macros(goals.normal)} por dia.`)
    if (goals.training) out.push(`- Em dia de treino: ${macros(goals.training)}.`)
  }
  const habits = sources.habits.filter((habit) => !habit.archived)
  for (const habit of habits) out.push(`- Hábito: ${describeHabit(habit)}.`)

  out.push('', `## Últimos ${DETAIL_DAYS} dias`)
  for (const day of dayRange(shiftDay(today, -(DETAIL_DAYS - 1)), today).reverse()) {
    out.push(dayLine(day, all.rows.get(day), metric, sources, habits))
    const diary = sources.journal.find((entry) => entry.id === day)?.text.trim()
    if (diary) out.push(`  Diário: "${diary.length > DIARY_CHARS ? `${diary.slice(0, DIARY_CHARS)}…` : diary}"`)
  }

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
      const detail = event.description?.replace(/\s+/g, ' ').trim().slice(0, 200)
      out.push(`- ${formatDay(event.date, 'EEE d/MM')}: ${event.title}${detail ? ` — ${detail}` : ''}`)
    }
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

function dayLine(day: DayKey, row: DayRow | undefined, metric: Map<string, Metric>, sources: Sources, habits: Habit[]) {
  const value = (key: string) => row?.[key]
  const show = (key: string) => {
    const v = value(key)
    const m = metric.get(key)
    return v === undefined || !m ? undefined : formatMetric(m, v)
  }
  const parts: string[] = []

  if (value('sleepHours') !== undefined) {
    const details = [
      show('sleepScore') && `nota ${show('sleepScore')}`,
      show('deepHours') && `profundo ${show('deepHours')}`,
      show('remHours') && `REM ${show('remHours')}`,
      show('bedtime') && `deitou ${show('bedtime')}`,
    ].filter(Boolean)
    parts.push(`sono ${show('sleepHours')}${details.length ? ` (${details.join(', ')})` : ''}`)
  }
  for (const [key, label] of [
    ['hrv', 'HRV'],
    ['restingHr', 'FC repouso'],
    ['bodyBattery', 'Body Battery máx.'],
    ['stress', 'estresse'],
    ['steps', 'passos'],
  ] as const) {
    if (show(key)) parts.push(`${label} ${show(key)}`)
  }

  const workouts = [
    ...sources.activities
      .filter((activity) => activity.date === day)
      .map((activity) => {
        const distance = activity.distanceM ? ` ${formatNumber(activity.distanceM / 1000, 1)} km` : ''
        const effect = activity.aerobicEffect ? `, efeito ${formatNumber(activity.aerobicEffect, 1)}` : ''
        return `${activity.title ?? activityLabel(activity)}${distance} em ${formatDuration(activity.timerSec * 1000)}${effect}`
      }),
    ...sources.sessions
      .filter((session) => session.date === day && session.endedAt)
      .map((session) => {
        const { sets, volumeKg } = summarize(session)
        return `musculação «${session.name}», ${sets} séries, ${formatNumber(volumeKg, 0)} kg levantados`
      }),
  ]
  if (workouts.length > 0) parts.push(`treino: ${workouts.join('; ')}`)
  else if (value('activityMinutes') === 0) parts.push('sem treino')

  if (value('kcal') !== undefined) {
    parts.push(`comeu ${show('kcal')} (proteína ${show('protein')}, carboidratos ${show('carbs')}, gorduras ${show('fat')})`)
  }
  if (show('water')) parts.push(`água ${show('water')}`)
  if (show('weight')) parts.push(`peso ${show('weight')}${show('bodyFat') ? `, gordura ${show('bodyFat')}` : ''}`)
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
