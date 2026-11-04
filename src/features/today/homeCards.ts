import type { HomeCardId, HomeLayout } from '../../db/types'

/**
 * Where a card goes on the Hoje screen: the main list (which also holds the "Em foco" carousel and
 * the "Visualização rápida" grid as entries), a page of the carousel, or a tile of the grid.
 */
export type HomeZone = 'main' | 'focus' | 'quick'

/** Every card the Hoje screen can show, in the default order. */
export const HOME_CARDS: { id: HomeCardId; label: string; detail: string; zone: HomeZone }[] = [
  { id: 'agenda', label: 'Minha semana', detail: 'Os treinos da semana, de domingo a sábado, e como ela vai', zone: 'main' },
  { id: 'focus', label: 'Em foco', detail: 'Cartões grandes lado a lado, para deslizar', zone: 'main' },
  { id: 'quick', label: 'Visualização rápida', detail: 'Os números do dia em cartões menores', zone: 'main' },
  { id: 'workout', label: 'Musculação', detail: 'Ficha programada para hoje, próxima ficha ou treino em andamento', zone: 'main' },
  { id: 'planned', label: 'Treino planejado', detail: 'O treino de hoje no calendário do Garmin, com a descrição', zone: 'main' },
  { id: 'water', label: 'Água', detail: 'Total do dia e botões de 1 toque', zone: 'main' },
  { id: 'habits', label: 'Hábitos', detail: 'Check do dia', zone: 'main' },
  { id: 'journal', label: 'Diário', detail: 'Como foi o dia', zone: 'main' },
  { id: 'sleep', label: 'Sono', detail: 'Nota, horários e as fases da última noite', zone: 'focus' },
  { id: 'food', label: 'Alimentação', detail: 'Calorias e macros do dia', zone: 'focus' },
  { id: 'insights', label: 'Análise do dia', detail: 'O que o Claude vê nos seus dados e no diário', zone: 'focus' },
  { id: 'week', label: 'Semana passada', detail: 'Alimentação, treinos, sono, peso, água e hábitos contra a semana anterior', zone: 'focus' },
  { id: 'race', label: 'Próxima prova', detail: 'Contagem regressiva para a prova do calendário do Garmin', zone: 'quick' },
  { id: 'body', label: 'Peso', detail: 'Último peso, meta e variação em 7 dias', zone: 'quick' },
  { id: 'restingHr', label: 'FC de repouso', detail: 'A última, contra a média da semana', zone: 'quick' },
  { id: 'hrv', label: 'HRV', detail: 'A da última noite e o estado', zone: 'quick' },
  { id: 'battery', label: 'Body Battery', detail: 'Máxima e mínima do dia', zone: 'quick' },
  { id: 'steps', label: 'Passos', detail: 'Do dia, até a última sincronização do Garmin', zone: 'quick' },
  { id: 'burn', label: 'Calorias gastas', detail: 'Do relógio: ativas e em repouso', zone: 'quick' },
]

export const ZONE_OF = Object.fromEntries(HOME_CARDS.map((card) => [card.id, card.zone])) as Record<HomeCardId, HomeZone>

/** Orders that were the default once: a layout saved in one of them only hid cards, so it follows today's default. */
const PAST_DEFAULTS: HomeCardId[][] = [
  ['insights', 'week', 'sleep', 'planned', 'workout', 'food', 'body', 'water', 'habits', 'journal'],
  ['insights', 'week', 'sleep', 'planned', 'agenda', 'workout', 'food', 'body', 'water', 'habits', 'journal'],
]

const same = (a: HomeCardId[], b: HomeCardId[]) => a.length === b.length && a.every((id, i) => id === b[i])

export interface PlacedCard {
  id: HomeCardId
  visible: boolean
  zone: HomeZone
}

/**
 * The saved arrangement over the known cards: unknown ids dropped, and a card added after the
 * layout was saved placed after the card that comes before it by default. Visible unless hidden.
 */
export function homeLayout(saved: HomeLayout | undefined): PlacedCard[] {
  const known = HOME_CARDS.map((card) => card.id)
  let order = saved?.order.filter((id) => known.includes(id)) ?? []
  if (PAST_DEFAULTS.some((past) => same(past, order))) order = []
  known.forEach((id, index) => {
    if (order.includes(id)) return
    const before = known
      .slice(0, index)
      .reverse()
      .find((other) => order.includes(other))
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id)
  })
  return order.map((id) => ({ id, visible: !saved?.hidden.includes(id), zone: ZONE_OF[id] }))
}

/** The arrangement to save: the zones one after the other, each in its order. */
export const layoutToSave = (cards: PlacedCard[]): HomeLayout => ({
  order: cards.map((card) => card.id),
  hidden: cards.filter((card) => !card.visible).map((card) => card.id),
})
