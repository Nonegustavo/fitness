import {
  Activity,
  BatteryMedium,
  CalendarCheck,
  CalendarRange,
  ChartSpline,
  CircleGauge,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  GlassWater,
  HeartPulse,
  ListChecks,
  Moon,
  NotebookPen,
  Scale,
  Sparkles,
  SportShoe,
  Target,
  Trophy,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import type { Tone } from '../../components/tone'
import type { HomeAreas, HomeCardId, Settings } from '../../db/types'

/** The two areas of the Hoje screen: big cards side by side, and small cards two per row. */
export type HomeArea = 'focus' | 'quick'

export interface HomeElement {
  id: HomeCardId
  label: string
  detail: string
  /** The same icon and color as its cards, for the row of icons under "Em foco". */
  icon: LucideIcon
  tone: Tone
}

/** Every element the Hoje screen offers; each one has a big card and a small one. */
export const HOME_ELEMENTS: HomeElement[] = [
  { id: 'workout', label: 'Próximos treinos', detail: 'Os de hoje e os próximos, com o dia de cada um, e a próxima ficha da sequência', icon: Dumbbell, tone: 'training' },
  { id: 'sleep', label: 'Sono', detail: 'Nota, horários e as fases da última noite', icon: Moon, tone: 'sleep' },
  { id: 'readiness', label: 'Prontidão', detail: 'Nota de 0 a 100 para treinar hoje: sono, HRV, FC de repouso, carga e dores', icon: CircleGauge, tone: 'recovery' },
  { id: 'food', label: 'Alimentação', detail: 'Calorias e macros do dia', icon: Utensils, tone: 'food' },
  { id: 'water', label: 'Água', detail: 'Total do dia contra a meta, com botões de 1 toque', icon: GlassWater, tone: 'water' },
  { id: 'habits', label: 'Hábitos', detail: 'O check do dia', icon: ListChecks, tone: 'habits' },
  { id: 'journal', label: 'Diário', detail: 'Como foi o dia, humor e energia', icon: NotebookPen, tone: 'journal' },
  { id: 'insights', label: 'Análise do dia', detail: 'O que o Claude vê nos seus dados e no diário', icon: Sparkles, tone: 'analysis' },
  { id: 'week', label: 'Semana passada', detail: 'A semana passada contra a anterior, área por área', icon: CalendarRange, tone: 'insights' },
  { id: 'runVolume', label: 'Volume de corrida', detail: 'Km por semana nas últimas semanas, contra o planejado', icon: SportShoe, tone: 'today' },
  { id: 'pace', label: 'Ritmo médio', detail: 'O ritmo das últimas 4 semanas e a evolução semana a semana', icon: Gauge, tone: 'today' },
  { id: 'trainingLoad', label: 'Carga de treino', detail: 'Últimos 7 dias contra as 4 semanas (ACWR), condicionamento, fadiga e forma', icon: ChartSpline, tone: 'today' },
  { id: 'records', label: 'Recordes pessoais', detail: 'Melhores tempos em 1, 5, 10, 21 e 42 km e a corrida mais longa', icon: Trophy, tone: 'analysis' },
  { id: 'goalStreaks', label: 'Sequências', detail: 'Dias seguidos na meta de água, na de proteína e com todos os hábitos', icon: Flame, tone: 'habits' },
  { id: 'streak', label: 'Constância', detail: 'Semanas seguidas treinando, recorde de dias seguidos e o mapa dos dias', icon: CalendarCheck, tone: 'today' },
  { id: 'race', label: 'Próxima prova', detail: 'Contagem regressiva para a prova do calendário do Garmin', icon: Target, tone: 'analysis' },
  { id: 'body', label: 'Peso', detail: 'Último peso, tendência e meta', icon: Scale, tone: 'body' },
  { id: 'restingHr', label: 'FC de repouso', detail: 'A última e as 2 últimas semanas', icon: HeartPulse, tone: 'recovery' },
  { id: 'hrv', label: 'HRV', detail: 'A da última noite, o estado e as 2 últimas semanas', icon: Activity, tone: 'sleep' },
  { id: 'battery', label: 'Body Battery', detail: 'Máxima e mínima de cada dia da semana', icon: BatteryMedium, tone: 'habits' },
  { id: 'steps', label: 'Passos', detail: 'Do dia e da semana, até a última sincronização do Garmin', icon: Footprints, tone: 'today' },
  { id: 'burn', label: 'Calorias gastas', detail: 'Do relógio: ativas e em repouso', icon: Flame, tone: 'training' },
]

export const elementInfo = (id: HomeCardId): HomeElement | undefined => HOME_ELEMENTS.find((element) => element.id === id)

const KNOWN = new Set(HOME_ELEMENTS.map((element) => element.id))

export const DEFAULT_AREAS: HomeAreas = {
  focus: ['workout', 'sleep', 'readiness', 'food', 'runVolume', 'habits'],
  quick: ['water', 'race', 'body', 'restingHr', 'hrv', 'battery', 'steps', 'burn', 'records', 'streak'],
}

/**
 * Elements that came after people had saved their areas: each goes into them once, after a neighbour
 * (or at the end), and `seen` keeps it from coming back once the user takes it out.
 */
const ADDED: { id: HomeCardId; area: HomeArea; after: HomeCardId }[] = [{ id: 'readiness', area: 'focus', after: 'sleep' }]

const clean = (ids: HomeCardId[]) => [...new Set(ids.filter((id) => KNOWN.has(id)))]

/** Puts the newer elements not seen yet into the areas (in place); the ones seen from now on. */
function addNew(areas: Record<HomeArea, HomeCardId[]>, seen: HomeCardId[]): HomeCardId[] {
  for (const { id, area, after } of ADDED) {
    const list = areas[area]
    if (seen.includes(id) || list.includes(id)) continue
    const at = list.indexOf(after)
    list.splice(at < 0 ? list.length : at + 1, 0, id)
  }
  return [...new Set([...seen, ...ADDED.map((added) => added.id)])]
}

/** The areas as saved (with the newer elements put in once); or else the default, leaving out what the older layout had hidden. */
export function homeAreas(settings: Pick<Settings, 'homeAreas' | 'home'>): Required<HomeAreas> {
  if (settings.homeAreas) {
    const { focus, quick, week, smartOrder, now, seen = [] } = settings.homeAreas
    const areas = { focus: clean(focus), quick: clean(quick) }
    const seenNow = addNew(areas, seen)
    return {
      ...areas,
      week: week !== false,
      smartOrder: smartOrder !== false,
      now: now !== false,
      seen: seenNow,
    }
  }
  const hidden = new Set(settings.home?.hidden ?? [])
  return {
    focus: DEFAULT_AREAS.focus.filter((id) => !hidden.has(id)),
    quick: DEFAULT_AREAS.quick.filter((id) => !hidden.has(id)),
    week: true,
    smartOrder: true,
    now: true,
    seen: ADDED.map((added) => added.id),
  }
}

/** Puts an element in an area (at the end) or takes it out. */
export function toggleElement(areas: HomeAreas, area: HomeArea, id: HomeCardId, on: boolean): HomeAreas {
  const without = areas[area].filter((other) => other !== id)
  return { ...areas, [area]: on ? [...without, id] : without }
}

/**
 * What matters most at each part of the day, from the hour it starts, most important first:
 * the night and the body in the morning, eating at lunch, training in the afternoon, and closing
 * the day at night.
 */
const MOMENTS: { from: number; ids: HomeCardId[] }[] = [
  { from: 0, ids: ['habits', 'journal', 'food', 'steps', 'burn'] },
  { from: 4, ids: ['sleep', 'readiness', 'body', 'hrv', 'restingHr', 'battery', 'insights', 'workout'] },
  { from: 11, ids: ['food', 'water', 'workout'] },
  { from: 15, ids: ['workout', 'runVolume', 'trainingLoad', 'water', 'steps', 'food'] },
  { from: 19, ids: ['habits', 'journal', 'food', 'insights', 'steps', 'burn'] },
]

/**
 * The "Em foco" cards for this hour: the ones that matter now come first, the rest keep the order
 * the user gave them.
 */
export function orderForTime(ids: HomeCardId[], hour: number): HomeCardId[] {
  const moment = MOMENTS.findLast((candidate) => hour >= candidate.from) ?? MOMENTS[0]
  const now = moment.ids.filter((id) => ids.includes(id))
  return [...now, ...ids.filter((id) => !now.includes(id))]
}
