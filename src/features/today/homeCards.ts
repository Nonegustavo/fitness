import type { HomeCardId, HomeLayout } from '../../db/types'

/** Every card the Hoje screen can show, in the default order. */
export const HOME_CARDS: { id: HomeCardId; label: string; detail: string }[] = [
  { id: 'insights', label: 'Análise do dia', detail: 'O que o Claude vê nos seus dados e no diário' },
  { id: 'week', label: 'Semana passada', detail: 'Alimentação, treinos, sono, peso, água e hábitos contra a semana anterior' },
  { id: 'sleep', label: 'Última noite', detail: 'Sono, HRV e Body Battery' },
  { id: 'planned', label: 'Treino planejado', detail: 'O treino de hoje no calendário do Garmin' },
  { id: 'agenda', label: 'Próximos 7 dias', detail: 'Treinos programados e do Garmin, dia a dia' },
  { id: 'workout', label: 'Musculação', detail: 'Ficha programada para hoje, próxima ficha ou treino em andamento' },
  { id: 'food', label: 'Alimentação', detail: 'Calorias e macros do dia' },
  { id: 'body', label: 'Corpo', detail: 'Último peso e tendência' },
  { id: 'water', label: 'Água', detail: 'Total do dia e botões de 1 toque' },
  { id: 'habits', label: 'Hábitos', detail: 'Check do dia' },
  { id: 'journal', label: 'Diário', detail: 'Como foi o dia' },
]

/**
 * The saved arrangement over the known cards: unknown ids dropped, and a card added after the
 * layout was saved placed after the card that comes before it by default. Visible unless hidden.
 */
export function homeLayout(saved: HomeLayout | undefined): { id: HomeCardId; visible: boolean }[] {
  const known = HOME_CARDS.map((card) => card.id)
  const order = saved?.order.filter((id) => known.includes(id)) ?? []
  known.forEach((id, index) => {
    if (order.includes(id)) return
    const before = known
      .slice(0, index)
      .reverse()
      .find((other) => order.includes(other))
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id)
  })
  return order.map((id) => ({ id, visible: !saved?.hidden.includes(id) }))
}
