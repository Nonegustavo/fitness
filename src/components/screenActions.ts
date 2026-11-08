import type { MealKey } from '../db/types'
import type { DayKey } from '../lib/dates'

/**
 * What the "+" does on a screen: the sheet to log anything (Hoje); the screen's own way to add, by its
 * address (`go`: a form the screen opens from a flag, or another screen; `replace` on the same screen,
 * so going back doesn't pass through it again); the workout (back to the one going on, or start
 * today's); the water buttons (on a past day when the screen shows one); or scheduling a workout or
 * a walk on a day.
 */
export type ScreenAction = { label: string } & (
  | { kind: 'sheet' }
  | { kind: 'go'; to: string; replace: boolean }
  | { kind: 'workout' }
  | { kind: 'water'; date?: DayKey }
  | { kind: 'plan'; date: DayKey }
)

export interface ScreenContext {
  today: DayKey
  /** The meal of this hour, for food. */
  meal: MealKey
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Screens where the "+" would be in the way or repeat what's already there. */
export const HIDDEN_ON = ['/alimentacao/adicionar', '/treinos/sessao/', '/treinos/ficha/']

/** The same screen with the flag that opens its form, keeping what the address already says (the day, the tab). */
function sameScreen(path: string, params: URLSearchParams, flag: Record<string, string>, label: string): ScreenAction {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(flag)) next.set(key, value)
  return { kind: 'go', to: `${path}?${next}`, replace: true, label }
}

const BODY_NEW = {
  medidas: { novo: 'medida', label: 'Nova medição' },
  fotos: { novo: 'foto', label: 'Nova foto' },
  peso: { novo: 'peso', label: 'Nova pesagem' },
} as const

/**
 * The "+" of each screen, mirroring the screen's own add button; screens not listed (Sono, Análise,
 * Ajustes, Mais, a record, an activity…) have nothing to add and the "+" leaves.
 */
const SCREENS: Record<string, (params: URLSearchParams, context: ScreenContext) => ScreenAction> = {
  '/': () => ({ kind: 'sheet', label: 'Registrar' }),
  // A food in the meal of this hour, on the day shown.
  '/alimentacao': (params, { meal }) => {
    const day = params.get('data')
    return { kind: 'go', to: `/alimentacao/adicionar?refeicao=${meal}${day ? `&data=${day}` : ''}`, replace: false, label: 'Adicionar alimento' }
  },
  // By the tab shown: a weigh-in, a measurement or a photo.
  '/corpo': (params) => {
    const tab = params.get('aba')
    const { novo, label } = tab === 'medidas' || tab === 'fotos' ? BODY_NEW[tab] : BODY_NEW.peso
    return sameScreen('/corpo', params, { novo }, label)
  },
  // The water buttons, on the day shown when that one is past.
  '/agua': (params, { today }) => {
    const day = params.get('data')
    return { kind: 'water', label: 'Registrar água', ...(day && DAY.test(day) && day < today ? { date: day } : {}) }
  },
  '/treinos': () => ({ kind: 'workout', label: 'Treino' }),
  '/treinos/exercicios': (params) => sameScreen('/treinos/exercicios', params, { novo: 'exercicio' }, 'Novo exercício'),
  '/treinos/atividades': (params) => sameScreen('/treinos/atividades', params, { novo: 'fit' }, 'Importar atividade'),
  '/corrida/tenis': (params) => sameScreen('/corrida/tenis', params, { novo: 'tenis' }, 'Adicionar tênis'),
  // A pain on the day shown (the text has its box always open).
  '/diario': (params) => sameScreen('/diario', params, { dor: 'nova' }, 'Adicionar dor'),
  '/habitos': (params) => sameScreen('/habitos', params, { novo: 'habito' }, 'Novo hábito'),
  // On the chosen day, or today when that one is past (nothing is scheduled in the past).
  '/calendario': (params, { today }) => {
    const day = params.get('dia')
    return { kind: 'plan', date: day && DAY.test(day) && day >= today ? day : today, label: 'Programar treino' }
  },
}

/** What the "+" does on the screen at `pathname` (with its `?query`), or undefined: nothing to add there. */
export function screenAction(pathname: string, search: string, context: ScreenContext): ScreenAction | undefined {
  if (HIDDEN_ON.some((path) => pathname.startsWith(path))) return undefined
  return SCREENS[pathname]?.(new URLSearchParams(search), context)
}
