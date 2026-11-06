import type { Activity, EventTime, Pain } from '../../db/types'
import { dayRange, formatDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatClock, formatDuration, formatNumber } from '../../lib/format'
import { buildAgenda, plannedKm, type AgendaItem } from '../calendar/agenda'
import type { PlannedEvent } from '../garmin/calendar'
import type { CoachWorkout } from '../sisrun/coachPlan'
import { scoreOn } from '../journal/pains'
import { DISCOMFORT_AREAS } from '../training/discomfort'
import { activityLabel } from './activities'
import { checkSummary, checkWorkout } from './compliance'
import { weatherText } from './weather'

export interface WeekReportInput {
  /** The Sunday the week starts on. */
  week: DayKey
  today: DayKey
  activities: Activity[]
  /** The Garmin calendar, with the days this device kept after they passed. */
  events: PlannedEvent[] | null
  /** The workouts the user hid in the calendar stay out. */
  eventTimes: EventTime[]
  pains: Pain[]
  /** The coach's plan read from SisRUN, for the km each run prescribed. */
  coach?: CoachWorkout[]
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
/** "Terça, 28/10". */
const dayTitle = (date: DayKey) => capital(formatDay(date, 'EEE, d/MM'))
/** "28/10". */
const shortDay = (date: DayKey) => formatDay(date, 'd/MM')
const km = (meters: number) => `${formatNumber(meters / 1000, 2)} km`
const oneLine = (text: string) => text.trim().replace(/\s*\n\s*/g, ' / ')

/** The week's runs, done and planned, from its calendar. */
export function weekRuns({ week, today, activities, events, eventTimes, coach }: WeekReportInput): AgendaItem[] {
  return buildAgenda(week, shiftDay(week, 6), today, { plans: [], events, sessions: [], activities, templates: [], eventTimes, coach }).filter(
    (item) => item.kind === 'run',
  )
}

/** A run for the coach: the numbers, how it went against the plan, what the user felt and said, and the weather. */
export function runReport(run: Activity, plannedTitle?: string): string[] {
  const lines = [`${dayTitle(run.date)} · ${run.title?.trim() || plannedTitle || activityLabel(run)}`]
  const numbers = [run.distanceM ? `${km(run.distanceM)} em ${formatClock(run.timerSec)}` : formatClock(run.timerSec)]
  if (run.distanceM && run.avgSpeed) numbers.push(`ritmo ${formatClock(1000 / run.avgSpeed)}/km`)
  if (run.avgHr) numbers.push(`FC média ${run.avgHr}`)
  lines.push(numbers.join(' · '))
  const check = checkWorkout(run)
  // When the laps don't line up with the steps, the coach gets nothing rather than a wrong reading.
  if (check && check.status !== 'mismatch') lines.push(capital(checkSummary(check)))
  const felt = [
    run.effort && `PSE ${run.effort}/10`,
    run.discomfort?.length && `desconforto: ${run.discomfort.map((area) => DISCOMFORT_AREAS[area] ?? area).join(', ').toLowerCase()}`,
  ].filter(Boolean)
  if (felt.length > 0) lines.push(capital(felt.join(' · ')))
  if (run.notes?.trim()) lines.push(`Comentário: ${oneLine(run.notes)}`)
  if (run.weather) lines.push(`Clima: ${weatherText(run.weather, { condition: true })}`)
  return lines
}

/** A pain over the days shown: its score, and each change of it with the day. */
function painLine(pain: Pain, from: DayKey, to: DayKey): string | undefined {
  const first = pain.start > from ? pain.start : from
  const last = pain.end !== undefined && pain.end < to ? pain.end : to
  if (first > last) return undefined
  const changes: [DayKey, number][] = []
  for (const day of dayRange(first, last)) {
    const score = scoreOn(pain, day)
    if (score !== undefined && changes.at(-1)?.[1] !== score) changes.push([day, score])
  }
  if (changes.length === 0) return undefined
  const scores =
    changes.length === 1
      ? `${changes[0][1]}/10${first > from ? ` desde ${shortDay(first)}` : ''}`
      : changes.map(([day, score]) => `${score}/10 em ${shortDay(day)}`).join(', ')
  return `- ${pain.name}: ${scores}${last < to ? `, até ${shortDay(last)}` : ''}`
}

/**
 * "Relatório da semana para o treinador": the week's km against the plan, each run with its
 * numbers, how the planned steps went, the effort (PSE), the comment, the discomfort and the
 * weather; then the runs planned and not done (or still ahead, this week) and the diary's pains.
 * Plain text, to paste in a message to the coach.
 */
export function weekReport(input: WeekReportInput): string {
  const { week, today, pains } = input
  const end = shiftDay(week, 6)
  const current = today >= week && today <= end
  const until = current ? today : end
  // Every run of the week is here: the ones the calendar planned, and the others on their own.
  const items = weekRuns(input)
  const done = items.filter((item) => item.status === 'done' && item.activity)
  const runs = done.map((item) => item.activity!)

  const out = [`Relatório da semana: ${formatDay(week, 'd/MM')} a ${formatDay(end, 'd/MM')}${current ? ' (até hoje)' : ''}`]

  const runMeters = runs.reduce((total, run) => total + (run.distanceM ?? 0), 0)
  const runSeconds = runs.reduce((total, run) => total + run.timerSec, 0)
  // The plan: each planned run's km (prescribed on SisRUN, or from its name), or what was run when
  // neither says or there was no plan.
  const planned = items.some((item) => item.event)
    ? items.reduce((total, item) => total + (plannedKm(item) ?? (item.activity?.distanceM ?? 0) / 1000), 0)
    : undefined
  const volume = [
    `Corrida: ${formatNumber(runMeters / 1000, 1)} km${planned ? ` de ${formatNumber(planned, 1)} km previstos` : ''}`,
    runs.length === 1 ? '1 corrida' : `${runs.length} corridas`,
  ]
  if (runSeconds > 0) volume.push(formatDuration(runSeconds * 1000))
  out.push('', volume.join(' · '))

  for (const item of done) out.push('', ...runReport(item.activity!, item.event ? item.title : undefined))

  const plannedLine = (item: AgendaItem) => `- ${dayTitle(item.date)}: ${item.title}`
  const missed = items.filter((item) => item.status === 'missed')
  if (missed.length > 0) out.push('', 'Planejados e não feitos:', ...missed.map(plannedLine))
  // Only this week has runs still ahead (from today on).
  const ahead = items.filter((item) => item.status === 'planned')
  if (ahead.length > 0) out.push('', 'Ainda por fazer nesta semana:', ...ahead.map(plannedLine))

  const painLines = pains
    .filter((pain) => !pain.deleted)
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
    .flatMap((pain) => painLine(pain, week, until) ?? [])
  if (painLines.length > 0) out.push('', 'Dores do diário (de 1 a 10):', ...painLines)

  return out.join('\n')
}
