import type {
  Activity,
  ActivityStream,
  DailyHealth,
  DailyInsight,
  Exercise,
  FoodLog,
  Habit,
  HabitLog,
  MeasurementEntry,
  MeasurementSite,
  PerformedSet,
  Settings,
  WalkRoutine,
  WaterLog,
  WeightEntry,
  WorkoutSession,
} from '../../db/types'
import { dayKey, daysBetween, formatDay, formatTime, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { formatClock, formatDuration, formatNumber, formatSigned } from '../../lib/format'
import type { DayValue } from '../../lib/stats'
import { activityLabel, matchSession } from '../activities/activities'
import { activityKind, nextRace, weekSummary, type AgendaItem } from '../calendar/agenda'
import { weekdaysText } from '../calendar/walks'
import { metricSeries } from '../body/body'
import { daysToTarget, estimateExpenditure, slopePerDay } from '../food/energy'
import { amountLabel, goalsFor, MEAL_LABEL, MEALS, sumNutrients } from '../food/nutrition'
import type { PlannedEvent } from '../garmin/calendar'
import { hrvStatus } from '../garmin/recovery'
import { describeStep, workoutBlocks } from '../garmin/workout'
import {
  daysByHabit,
  frequencyText,
  NO_DAYS,
  skippedBetween,
  streak,
  successRate,
  weeklyTimes,
  weekResult,
  type HabitDays,
} from '../habits/habits'
import { habitStrength, strengthPercent } from '../habits/strength'
import { formatPace, isRun, personalRecords, pooledPace, weeklyVolume } from '../running/running'
import { STREAK_LABELS, streaks, type StreakKind } from '../streaks/streaks'
import { MUSCLES } from '../training/catalog'
import { DISCOMFORT_AREAS } from '../training/discomfort'
import { bestE1rm, epley, needsDeload, recentEffort, setsByMuscle, stalledExercises, summarize, workingSets } from '../training/stats'
import { setsWithRir } from './gymSets'

/** A workout's comment (what the user told the coach), at most. */
const NOTE_CHARS = 400

const hm = (seconds: number) => formatDuration(seconds * 1000)
const kcal = (value: number) => `${formatNumber(value, 0)} kcal`
const day = (date: DayKey) => formatDay(date, 'EEE d/MM')
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined)
const present = (parts: (string | false | undefined | null)[]) => parts.filter((part): part is string => Boolean(part))

/** Text the user wrote, on one line and not too long. */
export function oneLine(text: string, max: number): string {
  const flat = text.trim().replace(/\s*\n\s*/g, ' / ')
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

const comment = (notes: string | undefined) => (notes?.trim() ? `comentário: "${oneLine(notes, NOTE_CHARS)}"` : undefined)
const pains = (areas: string[] | undefined) =>
  areas?.length ? `desconforto: ${areas.map((area) => DISCOMFORT_AREAS[area] ?? area).join(', ').toLowerCase()}` : undefined
const effort = (value: number | undefined) => (value ? `esforço ${value}/10` : undefined)

// ---------------------------------------------------------------- a day

/** The night that ended this morning: stages, times, heart rate and breathing. */
export function sleepParts(health: DailyHealth | undefined): string[] {
  const sleep = health?.sleep
  if (!sleep) return []
  const details = present([
    sleep.score !== undefined && `nota ${sleep.score}`,
    !!sleep.deepSec && `profundo ${hm(sleep.deepSec)}`,
    !!sleep.remSec && `REM ${hm(sleep.remSec)}`,
    !!sleep.lightSec && `leve ${hm(sleep.lightSec)}`,
    !!sleep.awakeSec && `acordado ${hm(sleep.awakeSec)}`,
    !!sleep.start && `deitou ${formatTime(sleep.start)}`,
    !!sleep.end && `levantou ${formatTime(sleep.end)}`,
    !!sleep.avgHr && `FC ${Math.round(sleep.avgHr)} bpm`,
    !!sleep.avgRespiration && `respiração ${formatNumber(sleep.avgRespiration, 0)}/min`,
  ])
  const parts = [`sono ${hm(sleep.totalSec)}${details.length ? ` (${details.join(', ')})` : ''}`]
  if (sleep.napSec) parts.push(`cochilo ${hm(sleep.napSec)}`)
  return parts
}

/** HRV with its normal range, resting heart rate, Body Battery, stress, steps and the calories the watch counted. */
export function recoveryParts(health: DailyHealth | undefined): string[] {
  if (!health) return []
  const hrv = health.hrv
  const battery = health.bodyBattery
  const extra = present([
    !!hrv?.weeklyAvg && `média de 7 dias ${hrv.weeklyAvg}`,
    !!hrv?.balancedLow && !!hrv.balancedHigh && `faixa normal ${hrv.balancedLow}–${hrv.balancedHigh}`,
    hrvStatus(hrv?.status)?.toLowerCase(),
  ])
  return present([
    !!hrv?.lastNight && `HRV ${hrv.lastNight} ms${extra.length ? ` (${extra.join(', ')})` : ''}`,
    !!health.restingHr && `FC repouso ${health.restingHr} bpm`,
    battery &&
      (battery.low !== undefined || battery.high !== undefined) &&
      `Body Battery ${present([battery.low !== undefined && `mín. ${battery.low}`, battery.high !== undefined && `máx. ${battery.high}`]).join(', ')}`,
    health.stress?.avg !== undefined && `estresse ${health.stress.avg}${health.stress.max ? ` (máx. ${health.stress.max})` : ''}`,
    !!health.steps && `passos ${formatNumber(health.steps, 0)}`,
    !!health.calories?.total &&
      `gasto pelo relógio ${kcal(health.calories.total)}${health.calories.active ? ` (ativas ${formatNumber(health.calories.active, 0)})` : ''}`,
  ])
}

const stepText = (step: Parameters<typeof describeStep>[0]) => {
  const { title, detail } = describeStep(step, true)
  return detail ? `${title} ${detail}` : title
}

/** The coach's structured workout the watch followed, in one line. */
function plannedWorkout(activity: Activity): string | undefined {
  const steps = activity.workout?.steps
  if (!steps?.length) return undefined
  const blocks = workoutBlocks(steps).map((block) =>
    block.kind === 'step' ? stepText(block.step) : `${block.times}× (${block.steps.map(stepText).join('; ')})`,
  )
  return `planejado: ${blocks.join('; ')}`
}

/** Each lap of a structured run (the intervals), when there are a few. */
function lapsText(activity: Activity): string | undefined {
  const laps = activity.laps.filter((lap) => lap.timerSec > 0)
  if (laps.length < 2 || laps.length > 30) return undefined
  const list = laps.map((lap, i) => {
    const km = (lap.distanceM ?? 0) / 1000
    const size = km >= 0.05 ? `${formatNumber(km, 2)} km` : formatClock(lap.timerSec)
    const pace = lap.avgSpeed ? ` a ${formatPace(1000 / lap.avgSpeed)}/km` : ''
    return `${i + 1}) ${size}${pace}${lap.avgHr ? ` FC ${lap.avgHr}` : ''}`
  })
  return `voltas: ${list.join('; ')}`
}

function zonesText(zones: Activity['hrZones']): string | undefined {
  const total = zones?.seconds.reduce((a, b) => a + b, 0) ?? 0
  if (!zones || total < 60) return undefined
  return `zonas de FC ${zones.seconds.map((seconds, i) => `Z${i + 1} ${Math.round((seconds / total) * 100)}%`).join(', ')}`
}

/** A workout of the watch: the numbers, what the user said about it, the plan and the laps. */
export function activityText(activity: Activity): string {
  const run = isRun(activity)
  const head = present([
    !!activity.distanceM && `${formatNumber(activity.distanceM / 1000, 1)} km`,
    `em ${formatDuration(activity.timerSec * 1000)}`,
  ]).join(' ')
  const details = present([
    run && !!activity.avgSpeed && `ritmo ${formatPace(1000 / activity.avgSpeed)}/km`,
    !!activity.avgHr && `FC ${activity.avgHr}${activity.maxHr ? ` (máx. ${activity.maxHr})` : ''}`,
    run && !!activity.avgCadence && `cadência ${activity.avgCadence}`,
    !!activity.ascentM && `subida ${activity.ascentM} m`,
    !!activity.aerobicEffect &&
      `efeito aeróbico ${formatNumber(activity.aerobicEffect, 1)}${activity.anaerobicEffect ? `, anaeróbico ${formatNumber(activity.anaerobicEffect, 1)}` : ''}`,
    zonesText(activity.hrZones),
    effort(activity.effort),
    pains(activity.discomfort),
    comment(activity.notes),
    plannedWorkout(activity),
    lapsText(activity),
  ])
  return `${activity.title?.trim() || activityLabel(activity)}: ${head}${details.length ? `, ${details.join(', ')}` : ''}`
}

/** The best set of an exercise: the heaviest by estimated 1RM, the longest hold, or the most reps. */
export function bestSet(sets: PerformedSet[]): string | undefined {
  const weighted = sets.filter((set) => set.weightKg && set.reps)
  if (weighted.length > 0) {
    const top = weighted.reduce((a, b) => (epley(b.weightKg!, b.reps!) > epley(a.weightKg!, a.reps!) ? b : a))
    return `${formatNumber(top.weightKg!, 1)} kg × ${top.reps}`
  }
  const held = sets.flatMap((set) => (set.durationSec ? [set.durationSec] : []))
  if (held.length > 0) return formatClock(Math.max(...held))
  const reps = sets.flatMap((set) => (set.reps ? [set.reps] : []))
  return reps.length > 0 ? `${Math.max(...reps)} repetições` : undefined
}

/** A gym workout exercise by exercise, with what the watch measured and what the user said. */
export function gymText(session: WorkoutSession, exercises: Map<string, Exercise>, watch?: Activity): string {
  const { sets, volumeKg, durationMs } = summarize(session)
  const done = session.exercises.flatMap((exercise) => {
    const working = workingSets(exercise)
    if (working.length === 0) return []
    const best = bestSet(working)
    const rir = setsWithRir(working, exercises.get(exercise.exerciseId)?.type ?? 'weight_reps')
    return [`${exercises.get(exercise.exerciseId)?.name ?? 'Exercício'} ${working.length} séries${best ? ` (melhor ${best})` : ''}${rir ? `: ${rir}` : ''}`]
  })
  const time = watch ? watch.timerSec * 1000 : durationMs
  const measured = present([
    !!time && formatDuration(time),
    !!watch?.avgHr && `FC média ${watch.avgHr}`,
    !!watch?.calories && kcal(watch.calories),
  ])
  const totals = present([
    `${sets} séries, ${formatNumber(volumeKg, 0)} kg levantados`,
    effort(session.effort),
    pains(session.discomfort),
    comment(session.notes),
  ])
  return `musculação «${session.name}»${measured.length ? ` (${measured.join(', ')})` : ''}: ${done.length ? `${done.join('; ')} — ` : ''}${totals.join(', ')}`
}

/** Every workout of a day; the watch's strength activity goes into the app's workout it recorded. */
export function dayWorkouts(
  date: DayKey,
  activities: Activity[],
  sessions: WorkoutSession[],
  exercises: Map<string, Exercise>,
): string[] {
  const daySessions = sessions.filter((session) => session.date === date && session.endedAt)
  const dayActivities = activities.filter((activity) => activity.date === date).sort((a, b) => a.startTime - b.startTime)
  const recorded = new Map<string, Activity>()
  for (const activity of dayActivities) {
    if (activityKind(activity) !== 'gym') continue
    const session = matchSession(activity, daySessions)
    if (session && !recorded.has(session.id)) recorded.set(session.id, activity)
  }
  const merged = new Set([...recorded.values()].map((activity) => activity.id))
  return [
    ...dayActivities
      // A strength activity on a day with a gym workout in the app is that workout.
      .filter((activity) => !merged.has(activity.id) && !(activityKind(activity) === 'gym' && daySessions.length > 0))
      .map(activityText),
    ...daySessions.map((session) => gymText(session, exercises, recorded.get(session.id))),
  ]
}

/** "café da manhã 07:30 (520 kcal, P 32 g): Ovos mexidos 100 g, Pão francês 50 g · almoço …". */
export function mealsText(logs: FoodLog[]): string | undefined {
  if (logs.length === 0) return undefined
  const meals = MEALS.flatMap(({ key }) => {
    const items = logs.filter((log) => log.meal === key).sort((a, b) => a.time - b.time)
    if (items.length === 0) return []
    const total = sumNutrients(items.map((item) => item.nutrients))
    const foods = items.map((item) => {
      const [amount, grams] = amountLabel(item.grams, item.unit, item.portion).split(' · ')
      return `${item.name} ${grams ? `${amount} (${grams})` : amount}`
    })
    const when = formatTime(items[0].time)
    return [`${MEAL_LABEL[key].toLowerCase()} ${when} (${kcal(total.kcal)}, P ${formatNumber(total.protein, 0)} g): ${foods.join(', ')}`]
  })
  return meals.join(' · ')
}

/** The scale's body composition, when the weigh-in has it. */
export function compositionText(entry: WeightEntry): string | undefined {
  const parts = present([
    entry.bodyFatPct !== undefined && `gordura ${formatNumber(entry.bodyFatPct, 1)} %`,
    entry.muscleMassKg !== undefined && `massa muscular ${formatNumber(entry.muscleMassKg, 1)} kg`,
    entry.leanMassKg !== undefined && `massa magra ${formatNumber(entry.leanMassKg, 1)} kg`,
    entry.bodyWaterPct !== undefined && `água ${formatNumber(entry.bodyWaterPct, 1)} %`,
    entry.visceralFat !== undefined && `gordura visceral ${formatNumber(entry.visceralFat, 0)}`,
  ])
  return parts.length ? parts.join(', ') : undefined
}

const siteLabel = (sites: MeasurementSite[], key: string) => (sites.find((site) => site.key === key)?.label ?? key).toLowerCase()

export function measurementText(entry: MeasurementEntry, sites: MeasurementSite[]): string | undefined {
  const values = Object.entries(entry.values)
  if (values.length === 0) return undefined
  return `medidas: ${values.map(([key, cm]) => `${siteLabel(sites, key)} ${formatNumber(cm, 1)} cm`).join(', ')}`
}

// ---------------------------------------------------------------- the weeks

/** The trend at the latest point on or before a day. */
function trendAt(trend: DayValue[], date: DayKey): number | undefined {
  let found: number | undefined
  for (const point of trend) {
    if (point.date > date) break
    found = point.value
  }
  return found
}

export interface WeeksInput {
  activities: Activity[]
  sessions: WorkoutSession[]
  foodLogs: FoodLog[]
  health: DailyHealth[]
  weights: WeightEntry[]
  habits: Habit[]
  habitLogs: HabitLog[]
}

/** One line per week, Sunday to Saturday, for the last `count` weeks and the current one so far. */
export function weekLines(s: WeeksInput, today: DayKey, count = 8): string[] {
  const current = weekStart(today)
  const weightTrend = metricSeries(s.weights, (entry) => entry.weightKg).trend
  const values = daysByHabit(s.habitLogs)
  const habits = s.habits.filter((habit) => !habit.archived)
  const lines: string[] = []
  for (let back = count; back >= 0; back--) {
    const from = shiftDay(current, -7 * back)
    const to = back === 0 ? today : shiftDay(from, 6)
    const inWeek = (date: DayKey) => date >= from && date <= to
    const gym = s.sessions.filter((session) => session.endedAt && inWeek(session.date))
    const activities = s.activities.filter((activity) => inWeek(activity.date))
    const runs = activities.filter(isRun)
    const runKm = runs.reduce((total, run) => total + (run.distanceM ?? 0), 0) / 1000
    const runSec = runs.reduce((total, run) => total + run.timerSec, 0)
    // Training time: the watch's timer, plus gym workouts the watch didn't record.
    const watchedGymDays = new Set(activities.filter((activity) => activityKind(activity) === 'gym').map((activity) => activity.date))
    const trainedMs =
      activities.reduce((total, activity) => total + activity.timerSec * 1000, 0) +
      gym.filter((session) => !watchedGymDays.has(session.date)).reduce((total, session) => total + (summarize(session).durationMs ?? 0), 0)
    const food = new Map<DayKey, { kcal: number; protein: number }>()
    for (const log of s.foodLogs) {
      if (!inWeek(log.date)) continue
      const sum = food.get(log.date) ?? { kcal: 0, protein: 0 }
      food.set(log.date, { kcal: sum.kcal + log.nutrients.kcal, protein: sum.protein + log.nutrients.protein })
    }
    const health = s.health.filter((row) => inWeek(row.id))
    const sleep = average(health.flatMap((row) => (row.sleep ? [row.sleep.totalSec] : [])))
    const hrv = average(health.flatMap((row) => (row.hrv?.lastNight ? [row.hrv.lastNight] : [])))
    const resting = average(health.flatMap((row) => (row.restingHr ? [row.restingHr] : [])))
    const weight = trendAt(weightTrend, to)
    // A weekly habit's current week only counts once met.
    const rates = habits.flatMap((habit) => {
      const rate = successRate(habit, values.get(habit.id) ?? NO_DAYS, from, to, today)
      return rate === undefined ? [] : [rate]
    })
    const eaten = [...food.values()]
    const parts = present([
      `musculação ${gym.length}`,
      `corrida ${runs.length}${runs.length ? ` (${formatNumber(runKm, 1)} km${runKm >= 3 ? `, ${formatPace(runSec / runKm)}/km` : ''})` : ''}`,
      trainedMs > 0 && `tempo de treino ${formatDuration(trainedMs)}`,
      eaten.length > 0 &&
        `comeu ${kcal(average(eaten.map((d) => d.kcal))!)}/dia (proteína ${formatNumber(average(eaten.map((d) => d.protein))!, 0)} g) em ${eaten.length} ${eaten.length === 1 ? 'dia' : 'dias'}`,
      sleep !== undefined && `sono ${hm(sleep)}`,
      hrv !== undefined && `HRV ${formatNumber(hrv, 0)}`,
      resting !== undefined && `FC repouso ${formatNumber(resting, 0)}`,
      weight !== undefined && `peso ${formatNumber(weight, 1)} kg`,
      rates.length > 0 && `hábitos ${Math.round(average(rates)! * 100)}%`,
    ])
    const label = `${formatDay(from, 'd/MM')}–${formatDay(back === 0 ? shiftDay(from, 6) : to, 'd/MM')}${back === 0 ? ' (esta semana, até hoje)' : ''}`
    lines.push(`- ${label}: ${parts.join('; ')}`)
  }
  return lines
}

// ---------------------------------------------------------------- strength

/** How the lifts are going: the main exercises' estimated 1RM, sets per muscle, stalls and the deload advice. */
export function strengthLines(sessions: WorkoutSession[], exercises: Map<string, Exercise>, today: DayKey): string[] {
  const finished = sessions.filter((session) => session.endedAt).sort((a, b) => a.startedAt - b.startedAt)
  const recentFrom = shiftDay(today, -27)
  const beforeFrom = shiftDay(today, -55)
  if (!finished.some((session) => session.date >= beforeFrom)) return []
  const lines: string[] = []

  const stats = new Map<string, { recent?: number; before?: number; sessions: number; last?: { date: DayKey; best?: string } }>()
  for (const session of finished) {
    if (session.date < beforeFrom) continue
    for (const exercise of session.exercises) {
      const working = workingSets(exercise)
      if (working.length === 0) continue
      const entry = stats.get(exercise.exerciseId) ?? { sessions: 0 }
      const e1rm = bestE1rm(working)
      if (e1rm !== undefined) {
        if (session.date >= recentFrom) entry.recent = Math.max(entry.recent ?? 0, e1rm)
        else entry.before = Math.max(entry.before ?? 0, e1rm)
      }
      entry.sessions++
      entry.last = { date: session.date, best: bestSet(working) }
      stats.set(exercise.exerciseId, entry)
    }
  }
  const main = [...stats.entries()].filter(([, entry]) => entry.last && entry.last.date >= recentFrom).sort((a, b) => b[1].sessions - a[1].sessions)
  if (main.length > 0) {
    lines.push('- Exercícios das últimas 4 semanas (1RM estimado agora e nas 4 semanas antes; a última vez):')
    for (const [id, entry] of main.slice(0, 12)) {
      const name = exercises.get(id)?.name ?? 'Exercício'
      const change =
        entry.recent !== undefined && entry.before !== undefined
          ? ` (antes ${formatNumber(entry.before, 0)} kg, ${formatSigned(((entry.recent - entry.before) / entry.before) * 100, 0)}%)`
          : ''
      const rm = entry.recent !== undefined ? `1RM ${formatNumber(entry.recent, 0)} kg${change}; ` : ''
      lines.push(`  - ${name}: ${rm}${entry.last ? `${day(entry.last.date)} ${entry.last.best ?? ''}`.trim() : ''}`)
    }
  }

  const week = weekStart(today)
  const thisWeek = setsByMuscle(finished, exercises, week, today)
  const lastWeek = setsByMuscle(finished, exercises, shiftDay(week, -7), shiftDay(week, -1))
  const muscles = [...new Set([...lastWeek.keys(), ...thisWeek.keys()])].sort((a, b) => (lastWeek.get(b) ?? 0) - (lastWeek.get(a) ?? 0))
  if (muscles.length > 0) {
    lines.push(
      `- Séries por grupo muscular nesta semana (na passada): ${muscles.map((muscle) => `${MUSCLES[muscle]} ${thisWeek.get(muscle) ?? 0} (${lastWeek.get(muscle) ?? 0})`).join(', ')}`,
    )
  }

  const stalls = stalledExercises(finished, today)
  if (stalls.length > 0) {
    lines.push(
      `- Sem evoluir: ${stalls
        .slice(0, 6)
        .map((stall) => `${exercises.get(stall.exerciseId)?.name ?? 'Exercício'} há ${stall.sessions} sessões (melhor 1RM ${formatNumber(stall.bestKg, 0)} kg)`)
        .join('; ')}`,
    )
  }
  const felt = recentEffort(finished)
  if (felt !== undefined) lines.push(`- Esforço das últimas sessões: ${formatNumber(felt, 1)}/10`)
  if (needsDeload(stalls, felt)) lines.push('- O app sugere uma semana mais leve (deload): vários exercícios parados e/ou esforço muito alto.')
  return lines
}

// ---------------------------------------------------------------- running

export interface RunningInput {
  activities: Activity[]
  /** Distance samples of the runs, for the best efforts. */
  streams?: Map<string, Pick<ActivityStream, 'step' | 'distance'>>
  /** This week's calendar, for the km planned. */
  weekAgenda?: AgendaItem[]
  events?: PlannedEvent[] | null
}

/** Weekly km against the plan, the pace, the records and the next race. */
export function runningLines({ activities, streams, weekAgenda, events }: RunningInput, today: DayKey): string[] {
  const weeks = weeklyVolume(activities, today, 9)
  if (weeks.every((week) => week.runs === 0)) return []
  const lines: string[] = []
  const now = weeks.at(-1)!
  const planned = weekAgenda ? weekSummary(weekAgenda).plannedRunKm : undefined
  lines.push(
    `- Km por semana (8 semanas, da mais antiga): ${weeks
      .slice(0, -1)
      .map((week) => formatNumber(week.km, 1))
      .join(' · ')}; esta semana até agora ${formatNumber(now.km, 1)} km${planned ? ` de ${formatNumber(planned, 1)} previstos` : ''}`,
  )
  const recent = pooledPace(weeks.slice(-5, -1))
  const before = pooledPace(weeks.slice(-9, -5))
  if (recent !== undefined) {
    lines.push(`- Ritmo médio: ${formatPace(recent)}/km nas últimas 4 semanas${before !== undefined ? ` (nas 4 antes: ${formatPace(before)}/km)` : ''}`)
  }
  if (streams) {
    const records = personalRecords(activities.filter(isRun), streams)
    const parts = records.efforts.map((effort) => `${effort.short} ${formatClock(effort.seconds)} (${formatDay(effort.date, 'd/MM/yy')})`)
    if (records.longest) parts.push(`mais longa ${formatNumber(records.longest.km, 1)} km (${formatDay(records.longest.date, 'd/MM/yy')})`)
    if (parts.length > 0) lines.push(`- Recordes (dos dados do relógio): ${parts.join(', ')}`)
  }
  const race = nextRace(events ?? null, today)
  if (race) lines.push(`- Próxima prova: ${race.title} em ${formatDay(race.date, "EEEE, d 'de' MMMM")} (daqui a ${daysBetween(today, race.date)} dias)`)
  return lines
}

// ---------------------------------------------------------------- walking

/** How many walks (and hikes) a week had, how far and how long: "2 (5,1 km, 1h02)", or "0". */
const walkWeek = (walks: Activity[]) => {
  if (walks.length === 0) return '0'
  const km = walks.reduce((total, walk) => total + (walk.distanceM ?? 0), 0) / 1000
  const seconds = walks.reduce((total, walk) => total + walk.timerSec, 0)
  return `${walks.length} (${formatNumber(km, 1)} km, ${formatDuration(seconds * 1000)})`
}

/** The walks apart from the running: each week's count, km and time, and the weekly walk planned in the app. */
export function walkingLines(activities: Activity[], routine: WalkRoutine | undefined, today: DayKey): string[] {
  const current = weekStart(today)
  const weeks = [4, 3, 2, 1, 0].map((back) => {
    const from = shiftDay(current, -7 * back)
    const to = shiftDay(from, 6)
    return activities.filter((activity) => activityKind(activity) === 'walk' && activity.date >= from && activity.date <= to)
  })
  const lines: string[] = []
  if (weeks.some((walks) => walks.length > 0)) {
    lines.push(
      `- Caminhadas por semana (4 semanas, da mais antiga; fora da corrida): ${weeks.slice(0, -1).map(walkWeek).join(' · ')}; esta semana até agora ${walkWeek(weeks[4])}`,
    )
  }
  if (routine?.days.length) {
    const goal = routine.targetKm
      ? `, ${formatNumber(routine.targetKm, 1)} km`
      : routine.targetMin
        ? `, ${formatDuration(routine.targetMin * 60_000)}`
        : ''
    lines.push(`- Caminhada semanal programada no app: ${weekdaysText(routine.days)}${routine.time ? ` às ${routine.time}` : ''}${goal}`)
  }
  return lines
}

// ---------------------------------------------------------------- body and energy

export interface BodyInput {
  weights: WeightEntry[]
  measurements: MeasurementEntry[]
  sites: MeasurementSite[]
  settings: Pick<Settings, 'weightGoal'>
}

/** The weight trend and its pace against the goal, the latest composition and the measurements. */
export function bodyLines({ weights, measurements, sites, settings }: BodyInput, today: DayKey): string[] {
  const lines: string[] = []
  const trend = metricSeries(weights, (entry) => entry.weightKg).trend
  const current = trend.at(-1)
  let rate: number | undefined
  if (current) {
    const month = trend.filter((point) => point.date >= shiftDay(today, -28))
    const slope = month.length >= 4 ? slopePerDay(month) : undefined
    rate = slope === undefined ? undefined : slope * 7
    const past = trendAt(trend, shiftDay(today, -28))
    lines.push(
      `- Peso (tendência, sem o sobe e desce diário): ${formatNumber(current.value, 1)} kg${past !== undefined ? `; há 4 semanas ${formatNumber(past, 1)} kg` : ''}${rate !== undefined ? `; ritmo ${formatSigned(rate, 2)} kg por semana` : ''}`,
    )
    const goal = settings.weightGoal
    if (goal && rate !== undefined) {
      const days = daysToTarget(current.value, goal.targetKg, rate)
      lines.push(
        `- Meta: ${formatNumber(goal.targetKg, 1)} kg a ${formatSigned(goal.kgPerWeek, 2)} kg por semana; ${
          days === undefined ? 'no ritmo atual, o peso não vai na direção da meta' : days === 0 ? 'meta alcançada' : `no ritmo atual, chega lá por volta de ${formatDay(shiftDay(today, days), "d 'de' MMMM")}`
        }`,
      )
    }
  }
  const full = [...weights].sort((a, b) => b.time - a.time).find((entry) => compositionText(entry))
  if (full) {
    const fat = metricSeries(weights, (entry) => entry.bodyFatPct).trend
    const fatNow = fat.at(-1)?.value
    const fatBefore = trendAt(fat, shiftDay(today, -28))
    const fatChange = fatNow !== undefined && fatBefore !== undefined ? `; gordura na tendência ${formatSigned(fatNow - fatBefore, 1)} ponto em 4 semanas` : ''
    lines.push(`- Composição na última pesagem completa (${day(full.date)}): ${compositionText(full)}${full.bmrKcal ? `, TMB ${kcal(full.bmrKcal)}` : ''}${fatChange}`)
  }
  const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted.at(-1)
  if (latest) {
    const earlier = [...sorted].reverse().find((entry) => entry.date <= shiftDay(latest.date, -21))
    const parts = Object.entries(latest.values).map(([key, cm]) => {
      const before = earlier?.values[key]
      return `${siteLabel(sites, key)} ${formatNumber(cm, 1)} cm${before !== undefined ? ` (${formatSigned(cm - before, 1)})` : ''}`
    })
    if (parts.length > 0) lines.push(`- Medidas em ${day(latest.date)}${earlier ? ` (contra ${day(earlier.date)})` : ''}: ${parts.join(', ')}`)
  }
  return lines
}

export interface EnergyInput {
  foodLogs: FoodLog[]
  weights: WeightEntry[]
  health: DailyHealth[]
}

/** What the body spends against what was eaten, and protein per kg. */
export function energyLines({ foodLogs, weights, health }: EnergyInput, today: DayKey): string[] {
  const lines: string[] = []
  const intake = new Map<DayKey, number>()
  const protein = new Map<DayKey, number>()
  for (const log of foodLogs) {
    intake.set(log.date, (intake.get(log.date) ?? 0) + log.nutrients.kcal)
    protein.set(log.date, (protein.get(log.date) ?? 0) + log.nutrients.protein)
  }
  const trend = metricSeries(weights, (entry) => entry.weightKg).trend
  const spent = estimateExpenditure(intake, trend, today)
  if (spent) {
    lines.push(
      `- Gasto estimado pelo app (o que você comeu × o que o peso fez, ${spent.loggedDays} dias com registro em ${spent.windowDays}): ${kcal(spent.kcal)} por dia; consumo médio ${kcal(spent.intake)}; saldo ${formatSigned(spent.intake - spent.kcal, 0)} kcal por dia${spent.confidence === 'low' ? ' (ainda pouco confiável: poucos dias registrados ou pesagens)' : ''}`,
    )
  }
  const fortnight = health.filter((row) => row.id >= shiftDay(today, -14) && row.id < today && row.calories?.total)
  if (fortnight.length >= 5) {
    const total = average(fortnight.map((row) => row.calories!.total!))!
    const active = average(fortnight.flatMap((row) => (row.calories?.active ? [row.calories.active] : [])))
    lines.push(`- Gasto pelo relógio (média de ${fortnight.length} dias): ${kcal(total)} por dia${active !== undefined ? `, ${formatNumber(active, 0)} delas ativas` : ''}`)
  }
  const logged = [...protein.entries()].filter(([date]) => date >= shiftDay(today, -14) && date < today).map(([, grams]) => grams)
  const weight = trend.at(-1)?.value
  if (logged.length >= 3) {
    const grams = average(logged)!
    lines.push(
      `- Proteína: ${formatNumber(grams, 0)} g por dia nos ${logged.length} dias registrados das últimas 2 semanas${weight ? ` (${formatNumber(grams / weight, 1)} g por kg de peso)` : ''}`,
    )
  }
  return lines
}

// ---------------------------------------------------------------- adherence

export interface AdherenceInput {
  /** The calendar of the last two weeks (and ahead). */
  agenda?: AgendaItem[]
  habits: Habit[]
  habitLogs: HabitLog[]
  water: WaterLog[]
  foodLogs: FoodLog[]
  sessions: WorkoutSession[]
  settings: Settings
  /** The last days' analyses, for their tips. */
  insights?: DailyInsight[]
}

/** Planned against done, the habits' rates and streaks, and the tips of the last days to check on. */
export function adherenceLines(s: AdherenceInput, today: DayKey): string[] {
  const lines: string[] = []
  const from = shiftDay(today, -14)
  const past = (s.agenda ?? []).filter((item) => item.date >= from && item.date < today && item.kind !== 'rest' && (item.plan || item.event))
  if (past.length > 0) {
    const done = past.filter((item) => item.status === 'done').length
    const missed = past.filter((item) => item.status === 'missed')
    lines.push(
      `- Treinos planejados nas últimas 2 semanas: ${done} de ${past.length} feitos${missed.length ? `; não feitos: ${missed.map((item) => `${day(item.date)} ${item.title}`).join('; ')}` : ''}`,
    )
  }

  const values = daysByHabit(s.habitLogs)
  const habits = s.habits.filter((habit) => !habit.archived)
  for (const habit of habits) {
    const days = values.get(habit.id) ?? NO_DAYS
    if (weeklyTimes(habit) !== undefined) {
      lines.push(weeklyHabitLine(habit, days, today))
      continue
    }
    const rate = successRate(habit, days, from, shiftDay(today, -1))
    if (rate === undefined) continue
    const skipped = skippedBetween(days, from, shiftDay(today, -1)).length
    const aside = skipped ? ` (sem contar ${skipped} ${skipped === 1 ? 'dia pulado' : 'dias pulados'})` : ''
    lines.push(
      `- Hábito «${habit.name}»: cumprido em ${Math.round(rate * 100)}% dos dias das últimas 2 semanas${aside}; sequência atual ${streak(habit, days, today)} dias; força ${strengthPercent(habitStrength(habit, days, today))}`,
    )
  }

  const trainingDays = new Set(s.sessions.filter((session) => session.endedAt).map((session) => session.date))
  const goals = streaks(
    {
      water: s.water,
      waterGoalMl: s.settings.waterGoalMl,
      foodLogs: s.foodLogs,
      goalOn: (date) => goalsFor(s.settings, trainingDays.has(date)),
      habits,
      habitLogs: s.habitLogs,
    },
    today,
  )
  const kinds = (Object.keys(goals) as StreakKind[]).filter((kind) => goals[kind]!.count > 0)
  if (kinds.length > 0) {
    lines.push(
      `- Sequências até hoje: ${kinds.map((kind) => `${STREAK_LABELS[kind].toLowerCase()} ${goals[kind]!.count} dias${goals[kind]!.today ? '' : ' (hoje ainda não)'}`).join(', ')}`,
    )
  }

  const tips = (s.insights ?? [])
    .filter((insight) => insight.id < today && insight.id >= shiftDay(today, -3))
    .sort((a, b) => b.id.localeCompare(a.id))
  for (const insight of tips) {
    const list = insight.sections.flatMap((section) => section.tips)
    if (list.length > 0) lines.push(`- Dicas da análise de ${day(insight.id)}: ${list.slice(0, 8).map((tip) => `"${tip}"`).join('; ')}`)
  }
  return lines
}

/**
 * A weekly habit for the analysis: the last 4 complete weeks, this one so far, the streak in weeks
 * and the strength (0–100%, up with each week met, down a little with each one missed).
 */
function weeklyHabitLine(habit: Habit, days: HabitDays, today: DayKey): string {
  const week = weekStart(today)
  const from = shiftDay(week, -28)
  const rate = successRate(habit, days, from, shiftDay(week, -1))
  const now = weekResult(habit, days, week, today)
  const good = habit.polarity === 'good'
  const skipped = skippedBetween(days, from, today).length
  const weeks = streak(habit, days, today)
  const parts = present([
    rate !== undefined && `${good ? 'meta cumprida' : 'dentro do limite'} em ${Math.round(rate * 100)}% das últimas 4 semanas`,
    `esta semana até agora ${now.count} ${now.count === 1 ? 'dia' : 'dias'}${good ? ` de ${now.times}` : ` (limite ${now.times})`}`,
    good && skipped > 0 && `${skipped} ${skipped === 1 ? 'dia pulado' : 'dias pulados'} (não baixam a meta)`,
    `sequência atual ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`,
    `força ${strengthPercent(habitStrength(habit, days, today))}`,
  ])
  return `- Hábito «${habit.name}» (${frequencyText(habit)}): ${parts.join('; ')}`
}

// ---------------------------------------------------------------- freshness

export interface Freshness {
  /** When each source last brought data (ms). */
  garmin?: number
  healthConnect?: number
  calendar?: number
}

const when = (at: number, today: DayKey) => {
  const key = dayKey(at)
  if (key === today) return `hoje às ${formatTime(at)}`
  if (key === shiftDay(today, -1)) return `ontem às ${formatTime(at)}`
  return `${formatDay(key, 'd/MM')} às ${formatTime(at)}`
}

/** When each source last synced and what today has so far, so a missing number isn't read as "didn't happen". */
export function freshnessLines(
  synced: Freshness,
  today: { date: DayKey; weighed: boolean; lastMeal?: number; slept: boolean; workouts: number },
): string[] {
  const lines = present([
    synced.garmin !== undefined && `- Garmin (atividades, sono, HRV, passos): última busca ${when(synced.garmin, today.date)}`,
    synced.healthConnect !== undefined && `- Health Connect no celular (balança e fases do sono): última leitura ${when(synced.healthConnect, today.date)}`,
    synced.calendar !== undefined && `- Calendário do treinador: atualizado ${when(synced.calendar, today.date)}`,
  ])
  lines.push(
    `- Hoje até agora: ${present([
      today.slept ? 'o sono da noite já chegou' : 'o sono da noite ainda não chegou',
      today.weighed ? 'pesagem feita' : 'sem pesagem',
      today.lastMeal !== undefined ? `comida registrada até ${formatTime(today.lastMeal)}` : 'nenhuma comida registrada',
      today.workouts > 0 ? `${today.workouts} ${today.workouts === 1 ? 'treino registrado' : 'treinos registrados'}` : 'nenhum treino registrado',
    ]).join(', ')}`,
  )
  return lines
}
