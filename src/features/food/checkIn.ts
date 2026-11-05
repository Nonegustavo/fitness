import type { FoodLog, GoalCheckIn, MacroGoals, Settings, WeightEntry, WorkoutSession } from '../../db/types'
import { formatDay, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { formatNumber, formatSigned } from '../../lib/format'
import type { DayValue } from '../../lib/stats'
import { metricSeries } from '../body/body'
import { CONFIDENT, ESTIMATE_DAYS, estimateExpenditure, kcalForRate, MIN_LOGGED_KCAL, type Expenditure } from './energy'

/** The app never proposes fewer calories a day than this: lower takes a professional's eye. */
export const KCAL_FLOOR = 1500
/** The most the calories move in one check-in, so the body and the routine keep up. */
export const MAX_STEP_KCAL = 250
/** Smaller differences aren't worth new targets. */
const MIN_CHANGE_KCAL = 50
/** Grams per kg of trend weight that protein and fat never go below. */
export const PROTEIN_PER_KG = 1.6
export const FAT_PER_KG = 0.6

export interface Targets {
  normal: MacroGoals
  training?: MacroGoals
}

/** What keeps the check-in from proposing anything. */
export type Missing =
  | { what: 'weightGoal' }
  | { what: 'targets' }
  | { what: 'logs'; have: number; need: number }
  | { what: 'weighIns'; have: number; need: number }

export interface Proposal {
  current: Targets
  proposed: Targets
  /** Calories added (negative: taken) to the days without a workout; training days move as much. */
  deltaKcal: number
  /** Something to accept: the calories, or protein and fat raised to their floors. */
  changed: boolean
  expenditure: Expenditure
  /** The weight trend at the end of the 4 weeks: the floors are per kg of it. */
  weightKg: number
  targetKg: number
  /** The weight goal's weekly pace (kg, negative to lose). */
  goalKgPerWeek: number
  /** The pace aimed at this week: the goal's, less near the target, 0 once it's reached. */
  kgPerWeek: number
  /** 'reached': at or past the target weight, now keeping it; 'closing': less than a week of pace left. */
  phase: 'pace' | 'reached' | 'closing'
  /** The calories a day that make that pace, on average over the week. */
  aimKcal: number
  /** With training-day targets: how many days a week had a workout, their extra calories, and what the other days get. */
  training?: { daysPerWeek: number; extraKcal: number; normalKcal: number }
  /** What held the change back: the weekly step or the floor. */
  limitedBy?: 'step' | 'floor'
  proteinMin: number
  fatMin: number
  proteinRaised: boolean
  fatRaised: boolean
}

export type CheckIn =
  | { kind: 'missing'; week: DayKey; asOf: DayKey; missing: Missing[] }
  | { kind: 'ready'; week: DayKey; asOf: DayKey; proposal: Proposal }

export interface CheckInInput {
  /** The check-in's day: its week's Sunday, or today for a look during the week. It reads the 4 weeks before it. */
  asOf: DayKey
  settings: Pick<Settings, 'nutrition' | 'weightGoal' | 'goalCheckIn'>
  /** kcal eaten each day. */
  intake: Map<DayKey, number>
  /** The weight trend, one point per day with a weigh-in. */
  weightTrend: DayValue[]
  /** Days with a workout, which get the training-day targets. */
  trainingDays: Set<DayKey>
}

const sameGoals = (a: MacroGoals | undefined, b: MacroGoals | undefined) =>
  (['kcal', 'protein', 'carbs', 'fat'] as const).every((key) => Math.round(a?.[key] ?? -1) === Math.round(b?.[key] ?? -1))

/**
 * A day's targets at other calories: protein stays (raised to its floor), fat keeps its share of the
 * calories (above its floor) and carbs take the rest. Unchanged calories and no floor keep them as they are.
 */
function macrosFor(current: MacroGoals, kcal: number, proteinMin: number, fatMin: number) {
  const protein = Math.max(Math.round(current.protein), proteinMin)
  const proteinRaised = protein > Math.round(current.protein)
  const share = current.kcal > 0 ? (current.fat * 9) / current.kcal : 0
  const kept = Math.round((share * kcal) / 9)
  let fat = Math.max(kept, fatMin)
  const fatRaised = fatMin > kept
  if (Math.round(kcal) === Math.round(current.kcal) && !proteinRaised && !fatRaised) return { goals: current, proteinRaised, fatRaised }
  // Protein first; fat gives way, down to its floor, before the carbs would go below zero.
  if (protein * 4 + fat * 9 > kcal) fat = Math.max(fatMin, Math.floor((kcal - protein * 4) / 9))
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { goals: { kcal, protein, carbs, fat }, proteinRaised, fatRaised }
}

/**
 * The weekly check-in of the calorie and macro targets, like MacroFactor's: from what the body spent
 * over the 4 weeks before (intake and weight trend) and the weight goal's pace, new calories, at most
 * 250 kcal away from the targets the week started with and never under 1.500; protein of at least
 * 1,6 g per kg, fat of at least 0,6 g per kg, carbs with the rest. Training-day targets move as much
 * as the others, which take what makes the week average the pace. Says what is missing instead.
 */
export function weeklyCheckIn({ asOf, settings, intake, weightTrend, trainingDays }: CheckInInput): CheckIn {
  const week = weekStart(asOf)
  const from = shiftDay(asOf, -ESTIMATE_DAYS)
  const to = shiftDay(asOf, -1)
  const inWindow = (date: DayKey) => date >= from && date <= to
  const loggedDays = [...intake].filter(([date, kcal]) => inWindow(date) && kcal >= MIN_LOGGED_KCAL).length
  const weighIns = weightTrend.filter((point) => inWindow(point.date)).length

  const missing: Missing[] = []
  if (!settings.weightGoal) missing.push({ what: 'weightGoal' })
  if (!settings.nutrition) missing.push({ what: 'targets' })
  if (loggedDays < CONFIDENT.loggedDays) missing.push({ what: 'logs', have: loggedDays, need: CONFIDENT.loggedDays })
  if (weighIns < CONFIDENT.weighIns) missing.push({ what: 'weighIns', have: weighIns, need: CONFIDENT.weighIns })
  const goal = settings.weightGoal
  const current = settings.nutrition
  const expenditure = missing.length === 0 ? estimateExpenditure(intake, weightTrend, asOf, ESTIMATE_DAYS) : undefined
  if (!goal || !current || !expenditure) return { kind: 'missing', week, asOf, missing }

  const weightKg = weightTrend.filter((point) => point.date <= to).at(-1)!.value
  const gap = goal.targetKg - weightKg
  let kgPerWeek = goal.kgPerWeek
  let phase: Proposal['phase'] = 'pace'
  if (goal.kgPerWeek !== 0 && gap * goal.kgPerWeek <= 0) {
    kgPerWeek = 0
    phase = 'reached'
  } else if (Math.abs(gap) < Math.abs(goal.kgPerWeek)) {
    // Less than a week of pace left: only what's left, so the weight doesn't go past the target.
    kgPerWeek = gap
    phase = 'closing'
  }
  const aimKcal = kcalForRate(expenditure.kcal, kgPerWeek)

  // Training days have their own targets: the other days take what makes the week average the aim.
  let normalAim = aimKcal
  let training: Proposal['training']
  if (current.training) {
    const share = [...trainingDays].filter(inWindow).length / ESTIMATE_DAYS
    const extraKcal = current.training.kcal - current.normal.kcal
    normalAim = aimKcal - extraKcal * share
    if (share > 0 && extraKcal !== 0) training = { daysPerWeek: share * 7, extraKcal, normalKcal: normalAim }
  }

  // One step a week: a second look in the same week starts from where the week began.
  const record = settings.goalCheckIn
  const base = record?.week === week && record.status === 'accepted' && record.before ? record.before.kcal : current.normal.kcal
  let kcal = Math.round(normalAim / 10) * 10
  let limitedBy: Proposal['limitedBy']
  if (Math.abs(kcal - base) > MAX_STEP_KCAL) {
    kcal = base + Math.sign(kcal - base) * MAX_STEP_KCAL
    limitedBy = 'step'
  }
  if (kcal < KCAL_FLOOR) {
    kcal = KCAL_FLOOR
    limitedBy = 'floor'
  }
  // A small difference keeps the target as it is, unless that one is under the floor.
  if (Math.abs(kcal - current.normal.kcal) < MIN_CHANGE_KCAL && current.normal.kcal >= KCAL_FLOOR) kcal = current.normal.kcal
  const deltaKcal = Math.round(kcal - current.normal.kcal)

  const proteinMin = Math.ceil(PROTEIN_PER_KG * weightKg)
  const fatMin = Math.ceil(FAT_PER_KG * weightKg)
  const normal = macrosFor(current.normal, kcal, proteinMin, fatMin)
  const trainingDay =
    current.training && macrosFor(current.training, Math.max(KCAL_FLOOR, current.training.kcal + deltaKcal), proteinMin, fatMin)
  const proposed: Targets = { normal: normal.goals, ...(trainingDay && { training: trainingDay.goals }) }

  return {
    kind: 'ready',
    week,
    asOf,
    proposal: {
      current: { normal: current.normal, ...(current.training && { training: current.training }) },
      proposed,
      deltaKcal,
      changed: !sameGoals(proposed.normal, current.normal) || (!!current.training && !sameGoals(proposed.training, current.training)),
      expenditure,
      weightKg,
      targetKg: goal.targetKg,
      goalKgPerWeek: goal.kgPerWeek,
      kgPerWeek,
      phase,
      aimKcal,
      training,
      limitedBy,
      proteinMin,
      fatMin,
      proteinRaised: normal.proteinRaised || !!trainingDay?.proteinRaised,
      fatRaised: normal.fatRaised || !!trainingDay?.fatRaised,
    },
  }
}

export interface CheckInSources {
  foodLogs: Pick<FoodLog, 'date' | 'nutrients'>[]
  weights: WeightEntry[]
  /** Workouts, started or finished: their days get the training-day targets. */
  sessions: Pick<WorkoutSession, 'date'>[]
}

/** The check-in from the rows themselves (without the deleted ones): food logs, weigh-ins and workouts. */
export function checkInFrom(s: CheckInSources, settings: CheckInInput['settings'], asOf: DayKey): CheckIn {
  const intake = new Map<DayKey, number>()
  for (const log of s.foodLogs) intake.set(log.date, (intake.get(log.date) ?? 0) + log.nutrients.kcal)
  // The trend over the whole history, so it is settled at the window's start.
  const { trend } = metricSeries(s.weights, (entry) => entry.weightKg)
  return weeklyCheckIn({ asOf, settings, intake, weightTrend: trend, trainingDays: new Set(s.sessions.map((session) => session.date)) })
}

/** The user's answer to this check-in's week, when there is one. */
export const decisionFor = (checkIn: CheckIn, record: GoalCheckIn | undefined): GoalCheckIn | undefined =>
  record?.week === checkIn.week ? record : undefined

/** A proposal still waiting for the user: new targets, this week not answered yet. */
export function pendingProposal(checkIn: CheckIn | undefined, record: GoalCheckIn | undefined): Proposal | undefined {
  if (checkIn?.kind !== 'ready' || !checkIn.proposal.changed || decisionFor(checkIn, record)) return undefined
  return checkIn.proposal
}

/** What the "Agora" line and the Sunday summary say about a pending proposal. */
export interface PendingGoals {
  kcal: number
  delta: number
}

export const pendingGoals = (proposal: Proposal | undefined): PendingGoals | undefined =>
  proposal && { kcal: proposal.proposed.normal.kcal, delta: proposal.deltaKcal }

// ---------------------------------------------------------------- words

const kcalText = (value: number) => `${formatNumber(value, 0)} kcal`

/** "cerca de 3 dias", "1 dia", "menos de 1 dia". */
function trainingDaysText(perWeek: number): string {
  if (perWeek < 0.5) return 'menos de 1 dia'
  const days = Math.round(perWeek)
  return `cerca de ${days} ${days === 1 ? 'dia' : 'dias'}`
}

/** "perder 0,4 kg por semana", "ganhar 0,25 kg por semana", "manter o peso". */
export function paceText(kgPerWeek: number): string {
  if (Math.abs(kgPerWeek) < 0.005) return 'manter o peso'
  return `${kgPerWeek < 0 ? 'perder' : 'ganhar'} ${formatNumber(Math.abs(kgPerWeek), 2)} kg por semana`
}

/** Why the targets are what they are, in a few plain sentences: the spending, the pace and what held it back. */
export function reasonLines(p: Proposal): string[] {
  const lines = [`Seu gasto estimado é ${kcalText(p.expenditure.kcal)} por dia.`]
  const aim = kcalText(p.aimKcal)
  if (p.phase === 'reached') {
    lines.push(`Você chegou à meta de ${formatNumber(p.targetKg, 1)} kg: para manter o peso, a média seria ${aim} por dia.`)
  } else if (p.phase === 'closing') {
    lines.push(
      `Faltam ${formatNumber(Math.abs(p.targetKg - p.weightKg), 1)} kg para a meta: para chegar lá em cerca de uma semana, a média seria ${aim} por dia.`,
    )
  } else {
    lines.push(`Para ${paceText(p.kgPerWeek)}, a média seria ${aim} por dia.`)
  }
  if (p.training) {
    const { daysPerWeek, extraKcal, normalKcal } = p.training
    lines.push(
      `Com ${trainingDaysText(daysPerWeek)} de treino por semana, que têm ${kcalText(Math.abs(extraKcal))} a ${extraKcal > 0 ? 'mais' : 'menos'}, os outros dias ficariam em ${kcalText(normalKcal)}.`,
    )
  }
  if (p.limitedBy === 'step') {
    lines.push(
      p.deltaKcal === 0
        ? `As calorias já mudaram o máximo desta semana (${MAX_STEP_KCAL} kcal).`
        : `Para não mudar demais de uma vez, a mudança desta semana fica em ${formatSigned(p.deltaKcal, 0)} kcal (no máximo ${MAX_STEP_KCAL} por semana).`,
    )
  } else if (p.limitedBy === 'floor') {
    lines.push(`O app não propõe menos de ${kcalText(KCAL_FLOOR)} por dia.`)
  } else if (p.deltaKcal === 0) {
    lines.push('Isso fica perto da sua meta: as calorias não mudam.')
  }
  if (p.proteinRaised) lines.push(`A proteína vai a pelo menos ${formatNumber(PROTEIN_PER_KG)} g por kg de peso: ${p.proteinMin} g.`)
  if (p.fatRaised) lines.push(`As gorduras ficam em pelo menos ${formatNumber(FAT_PER_KG)} g por kg: ${p.fatMin} g.`)
  return lines
}

/** The numbers behind the proposal, label and value, for "Ver os números". */
export function numberRows(checkIn: Extract<CheckIn, { kind: 'ready' }>): { label: string; value: string }[] {
  const p = checkIn.proposal
  const e = p.expenditure
  const to = shiftDay(checkIn.asOf, -1)
  const rows = [
    { label: 'Período', value: `${formatDay(shiftDay(checkIn.asOf, -e.windowDays), 'd/M')} a ${formatDay(to, 'd/M')} (4 semanas)` },
    { label: 'Gasto estimado', value: `${kcalText(e.kcal)} por dia` },
    { label: 'Consumo médio', value: `${kcalText(e.intake)} por dia, em ${e.loggedDays} dias registrados` },
    {
      label: 'Peso (tendência)',
      value: `${formatNumber(p.weightKg, 1)} kg, ${formatSigned(e.kgPerWeek, 2)} kg por semana (${e.weighIns} pesagens)`,
    },
    { label: 'Meta de peso', value: `${formatNumber(p.targetKg, 1)} kg, ${formatSigned(p.goalKgPerWeek, 2)} kg por semana` },
    {
      label: 'Média para o ritmo',
      value: `${kcalText(p.aimKcal)} por dia${p.kgPerWeek !== p.goalKgPerWeek ? ` (${paceText(p.kgPerWeek)})` : ''}`,
    },
  ]
  if (p.training) {
    rows.push({
      label: 'Dias de treino',
      value: `${formatNumber(p.training.daysPerWeek, 1)} por semana, ${formatSigned(p.training.extraKcal, 0)} kcal cada`,
    })
  }
  rows.push(
    { label: 'Limites', value: `até ${MAX_STEP_KCAL} kcal por semana; no mínimo ${kcalText(KCAL_FLOOR)}` },
    {
      label: 'Mínimos por kg',
      value: `proteína ${p.proteinMin} g (${formatNumber(PROTEIN_PER_KG)} g/kg), gorduras ${p.fatMin} g (${formatNumber(FAT_PER_KG)} g/kg)`,
    },
  )
  return rows
}

/** What to do so the check-in can propose, one sentence each. */
export function missingLines(missing: Missing[]): string[] {
  return missing.map((item) => {
    switch (item.what) {
      case 'weightGoal':
        return 'Defina uma meta de peso, em Corpo.'
      case 'targets':
        return 'Defina as metas de calorias e macros, em Metas.'
      case 'logs':
        return `Registre a alimentação em mais ${item.need - item.have} ${item.need - item.have === 1 ? 'dia' : 'dias'}: são ${item.have} de ${item.need} nas últimas 4 semanas.`
      case 'weighIns':
        return `Pese-se em mais ${item.need - item.have} ${item.need - item.have === 1 ? 'dia' : 'dias'}: são ${item.have} pesagens de ${item.need} nas últimas 4 semanas.`
    }
  })
}

/** The same, in a few words each, for the summaries. */
export function missingShort(missing: Missing[]): string {
  return missing
    .map((item) => {
      switch (item.what) {
        case 'weightGoal':
          return 'meta de peso'
        case 'targets':
          return 'metas de calorias e macros'
        case 'logs':
          return `alimentação registrada em ${item.have} de ${item.need} dias`
        case 'weighIns':
          return `${item.have} de ${item.need} pesagens`
      }
    })
    .join('; ')
}
