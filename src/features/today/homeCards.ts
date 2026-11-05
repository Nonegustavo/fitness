import type { HomeAreas, HomeCardId, Settings } from '../../db/types'

/** The two areas of the Hoje screen: big cards side by side, and small cards two per row. */
export type HomeArea = 'focus' | 'quick'

/** Every element the Hoje screen offers; each one has a big card and a small one. */
export const HOME_ELEMENTS: { id: HomeCardId; label: string; detail: string }[] = [
  { id: 'workout', label: 'Treinos de hoje', detail: 'Musculação e corrida do dia, com a próxima ficha e o próximo treino' },
  { id: 'sleep', label: 'Sono', detail: 'Nota, horários e as fases da última noite' },
  { id: 'food', label: 'Alimentação', detail: 'Calorias e macros do dia' },
  { id: 'water', label: 'Água', detail: 'Total do dia contra a meta, com botões de 1 toque' },
  { id: 'habits', label: 'Hábitos', detail: 'O check do dia' },
  { id: 'journal', label: 'Diário', detail: 'Como foi o dia, humor e energia' },
  { id: 'insights', label: 'Análise do dia', detail: 'O que o Claude vê nos seus dados e no diário' },
  { id: 'week', label: 'Semana passada', detail: 'A semana passada contra a anterior, área por área' },
  { id: 'runVolume', label: 'Volume de corrida', detail: 'Km por semana nas últimas semanas, contra o planejado' },
  { id: 'pace', label: 'Ritmo médio', detail: 'O ritmo das últimas 4 semanas e a evolução semana a semana' },
  { id: 'records', label: 'Recordes pessoais', detail: 'Melhores tempos em 1, 5, 10, 21 e 42 km e a corrida mais longa' },
  { id: 'streak', label: 'Constância', detail: 'Semanas seguidas treinando, recorde de dias seguidos e o mapa dos dias' },
  { id: 'race', label: 'Próxima prova', detail: 'Contagem regressiva para a prova do calendário do Garmin' },
  { id: 'body', label: 'Peso', detail: 'Último peso, tendência e meta' },
  { id: 'restingHr', label: 'FC de repouso', detail: 'A última e as 2 últimas semanas' },
  { id: 'hrv', label: 'HRV', detail: 'A da última noite, o estado e as 2 últimas semanas' },
  { id: 'battery', label: 'Body Battery', detail: 'Máxima e mínima de cada dia da semana' },
  { id: 'steps', label: 'Passos', detail: 'Do dia e da semana, até a última sincronização do Garmin' },
  { id: 'burn', label: 'Calorias gastas', detail: 'Do relógio: ativas e em repouso' },
]

const KNOWN = new Set(HOME_ELEMENTS.map((element) => element.id))

export const DEFAULT_AREAS: HomeAreas = {
  focus: ['workout', 'sleep', 'food', 'runVolume', 'habits'],
  quick: ['water', 'race', 'body', 'restingHr', 'hrv', 'battery', 'steps', 'burn', 'records', 'streak'],
}

const clean = (ids: HomeCardId[]) => [...new Set(ids.filter((id) => KNOWN.has(id)))]

/** The areas as saved; or else the default, leaving out what the older layout had hidden. */
export function homeAreas(settings: Pick<Settings, 'homeAreas' | 'home'>): Required<HomeAreas> {
  if (settings.homeAreas) {
    const { focus, quick, week } = settings.homeAreas
    return { focus: clean(focus), quick: clean(quick), week: week !== false }
  }
  const hidden = new Set(settings.home?.hidden ?? [])
  return {
    focus: DEFAULT_AREAS.focus.filter((id) => !hidden.has(id)),
    quick: DEFAULT_AREAS.quick.filter((id) => !hidden.has(id)),
    week: true,
  }
}

/** Puts an element in an area (at the end) or takes it out. */
export function toggleElement(areas: HomeAreas, area: HomeArea, id: HomeCardId, on: boolean): HomeAreas {
  const without = areas[area].filter((other) => other !== id)
  return { ...areas, [area]: on ? [...without, id] : without }
}
