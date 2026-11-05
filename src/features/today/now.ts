import type { MealKey, SmartReminders } from '../../db/types'
import { formatDay, formatTime, shiftDay, type DayKey } from '../../lib/dates'
import { formatMl, formatNumber, formatSigned } from '../../lib/format'
import type { AgendaItem, AgendaKind } from '../calendar/agenda'
import type { PendingGoals } from '../food/checkIn'
import { waterExpectedBy } from '../notifications/reminders'

/** What the "Agora" line knows about the day. */
export interface NowDay {
  today: DayKey
  /** The gym workout in progress. */
  active?: { id: string; name: string }
  /** The calendar from today on. */
  agenda: Pick<AgendaItem, 'date' | 'kind' | 'title' | 'status' | 'time' | 'plan'>[]
  /** The template to start a gym workout today with: the scheduled one, or the next in the rotation. */
  gymTemplateId?: string
  weighed: boolean
  /** Weighed in on some of the last days: weighing in is part of the routine. */
  weighsIn: boolean
  /** The meals logged today. */
  meals: Set<MealKey>
  /** The meals logged on some of the last days: the ones worth a nudge. */
  usualMeals: Set<MealKey>
  waterMl: number
  waterGoalMl: number
  /** The amount one tap adds (the favorite glass). */
  glassMl: number
  /** The habits to do that aren't done yet today, by name. */
  habitsLeft: string[]
  journaled: boolean
  /** Today's latest run with nothing said about it yet (comment or effort), for the coach. */
  uncommented?: { id: string; title: string; endedAt: number }
  /** The times set for the smart reminders (weigh-in, lunch, dinner). */
  smart?: SmartReminders
  /** New nutrition targets from this week's check-in, still waiting for an answer. */
  checkIn?: PendingGoals
}

export type NowAction =
  | { type: 'link'; to: string; label: string }
  | { type: 'start'; templateId?: string; label: string }
  | { type: 'water'; ml: number; label: string }

export interface NowStep {
  /** What it is about, for the icon and the color. */
  kind: 'workout' | 'weighIn' | 'meal' | 'water' | 'habits' | 'journal' | 'upcoming' | 'comment' | 'checkIn'
  /** For workouts: gym, run… */
  agendaKind?: AgendaKind
  /** When: "Agora", "Mais tarde" (today) or "Próximo treino". */
  when: string
  title: string
  detail?: string
  action?: NowAction
}

const MINUTE = 60_000
/** A planned workout becomes "now" this long before its time… */
const SOON_MS = 90 * MINUTE
/** …and stays until this long after it (the watch may not have synced the run yet). */
const LATE_MS = 60 * MINUTE
/** A run waits this long for its comment before "Agora" lets it go. */
const COMMENT_MS = 12 * 60 * MINUTE
/** How far behind the water pace before it's worth a nudge: two glasses. */
const WATER_BEHIND_ML = 500

const clockMinutes = (clock: string) => {
  const [hour, minute] = clock.split(':').map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

/** "em 40 min", "em 1 h 20", "em 3 h". */
export function inTime(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE))
  if (minutes < 60) return `em ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest >= 5 ? `em ${hours} h ${String(rest).padStart(2, '0')}` : `em ${hours} h`
}

/** The meals worth a nudge, and when: from the time set for its smart reminder, or a usual time. */
function mealWindows(smart: SmartReminders | undefined): { meal: MealKey; from: number; to: number }[] {
  const window = (meal: MealKey, clock: string | undefined, fallback: string) => {
    const from = clockMinutes(clock ?? fallback)
    return { meal, from, to: from + 150 }
  }
  return [window('breakfast', undefined, '07:30'), window('lunch', smart?.lunch, '12:30'), window('dinner', smart?.dinner, '20:00')]
}

const MEAL_NAMES: Partial<Record<MealKey, string>> = { breakfast: 'café da manhã', lunch: 'almoço', dinner: 'jantar' }

function workoutStep(item: NowDay['agenda'][number], day: NowDay, now: number, soon: boolean): NowStep {
  const at = item.time !== undefined ? ` às ${formatTime(item.time)}` : ''
  const gym = item.kind === 'gym'
  const detail =
    item.time === undefined
      ? 'Sem horário marcado'
      : item.time > now
        ? `Começa ${inTime(item.time - now)}`
        : `Era para as ${formatTime(item.time)}`
  return {
    kind: 'workout',
    agendaKind: item.kind,
    when: soon ? 'Agora' : 'Mais tarde',
    title: `${item.title}${at}`,
    detail,
    action: gym
      ? { type: 'start', templateId: item.plan?.templateId ?? day.gymTemplateId, label: 'Iniciar' }
      : { type: 'link', to: `/calendario?dia=${item.date}`, label: 'Detalhes' },
  }
}

/**
 * The one thing worth doing now, most urgent first: the workout in progress, a workout about to
 * start, the morning weigh-in, the meal being eaten, the water when well behind the day's pace, the
 * week's new nutrition targets (Sunday and Monday), a workout later today, and at night the habits
 * still open and the journal. With nothing pending, the next workout of the coming days. Nudges only
 * about what is part of the routine (a meal or a weigh-in logged on recent days).
 */
export function nextStep(day: NowDay, nowDate: Date): NowStep | undefined {
  const now = nowDate.getTime()
  const clock = nowDate.getHours() * 60 + nowDate.getMinutes()

  if (day.active) {
    return {
      kind: 'workout',
      agendaKind: 'gym',
      when: 'Agora',
      title: `${day.active.name} em andamento`,
      detail: 'Continue de onde parou',
      action: { type: 'link', to: `/treinos/sessao/${day.active.id}`, label: 'Continuar' },
    }
  }

  const ahead = day.agenda
    .filter((item) => item.date === day.today && item.status === 'planned' && item.kind !== 'rest')
    .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity))
  const soon = ahead.find((item) => item.time !== undefined && item.time - SOON_MS <= now && now <= item.time + LATE_MS)
  if (soon) return workoutStep(soon, day, now, true)

  const weighUntil = Math.max(clockMinutes('11:00'), day.smart?.weighIn ? clockMinutes(day.smart.weighIn) + 120 : 0)
  if (!day.weighed && day.weighsIn && clock >= clockMinutes('05:00') && clock < weighUntil) {
    return {
      kind: 'weighIn',
      when: 'Agora',
      title: 'Pesagem de hoje',
      detail: 'Ainda não há pesagem hoje',
      action: { type: 'link', to: '/corpo?novo=peso', label: 'Registrar' },
    }
  }

  if (day.uncommented && now - day.uncommented.endedAt < COMMENT_MS) {
    return {
      kind: 'comment',
      when: 'Agora',
      title: 'Como foi a corrida?',
      detail: `${day.uncommented.title} · comentário e esforço para o treinador`,
      action: { type: 'link', to: `/treinos/atividades/${day.uncommented.id}?comentar=1`, label: 'Comentar' },
    }
  }

  const meal = mealWindows(day.smart).find(
    (window) => clock >= window.from && clock < window.to && day.usualMeals.has(window.meal) && !day.meals.has(window.meal),
  )
  if (meal) {
    return {
      kind: 'meal',
      when: 'Agora',
      title: `Registrar o ${MEAL_NAMES[meal.meal]}`,
      detail: 'Nada registrado ainda',
      action: { type: 'link', to: `/alimentacao/adicionar?refeicao=${meal.meal}&data=${day.today}`, label: 'Adicionar' },
    }
  }

  const hour = clock / 60
  const expected = waterExpectedBy(hour, day.waterGoalMl)
  if (day.waterGoalMl > 0 && hour >= 9 && hour < 22 && day.waterMl < expected - WATER_BEHIND_ML) {
    return {
      kind: 'water',
      when: 'Agora',
      title: 'Água abaixo do ritmo',
      detail: `${formatMl(day.waterMl)} de ${formatMl(day.waterGoalMl)}; a esta hora seriam ${formatMl(Math.round(expected / 50) * 50)}`,
      action: { type: 'water', ml: day.glassMl, label: formatMl(day.glassMl) },
    }
  }

  // The weekly check-in waits on the food screen all week; "Agora" only brings it up at its start.
  if (day.checkIn && nowDate.getDay() <= 1) {
    const { kcal, delta } = day.checkIn
    return {
      kind: 'checkIn',
      when: 'Agora',
      title: 'Revisar as metas da semana',
      detail:
        delta !== 0
          ? `Proposta: ${formatNumber(kcal, 0)} kcal por dia (${formatSigned(delta, 0)}), pelo seu gasto e a meta de peso`
          : 'Proposta: proteína e gorduras ajustadas ao seu peso',
      action: { type: 'link', to: '/alimentacao', label: 'Revisar' },
    }
  }

  const later = ahead.find((item) => item.time === undefined || item.time - SOON_MS > now)
  if (later) return workoutStep(later, day, now, false)

  if (clock >= clockMinutes('19:00') && day.habitsLeft.length > 0) {
    const count = day.habitsLeft.length
    return {
      kind: 'habits',
      when: 'Agora',
      title: count === 1 ? `Falta 1 hábito: ${day.habitsLeft[0]}` : `Faltam ${count} hábitos`,
      detail: count === 1 ? 'Ainda dá tempo hoje' : day.habitsLeft.slice(0, 3).join(', ') + (count > 3 ? '…' : ''),
      action: { type: 'link', to: '/habitos', label: 'Marcar' },
    }
  }

  if (clock >= clockMinutes('21:00') && !day.journaled) {
    return {
      kind: 'journal',
      when: 'Agora',
      title: 'Como foi o dia?',
      detail: 'Humor, energia e o que marcou o dia',
      action: { type: 'link', to: '/diario', label: 'Escrever' },
    }
  }

  const next = day.agenda
    .filter((item) => item.date > day.today && item.status === 'planned' && item.kind !== 'rest')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? Infinity) - (b.time ?? Infinity))[0]
  if (next) {
    const when = next.date === shiftDay(day.today, 1) ? 'Amanhã' : formatDay(next.date, 'EEEE')
    return {
      kind: 'upcoming',
      agendaKind: next.kind,
      when: 'Próximo treino',
      title: `${when.charAt(0).toUpperCase()}${when.slice(1)}: ${next.title}${next.time !== undefined ? ` às ${formatTime(next.time)}` : ''}`,
      detail: 'Tudo em dia por agora',
      action: { type: 'link', to: `/calendario?dia=${next.date}`, label: 'Detalhes' },
    }
  }
  return undefined
}
