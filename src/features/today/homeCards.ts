import type { HomeCardId, HomeLayout } from '../../db/types'

/** Every card the Hoje screen can show, in the default order. */
export const HOME_CARDS: { id: HomeCardId; label: string; detail: string }[] = [
  { id: 'insights', label: 'Análise do dia', detail: 'O que o Claude vê nos seus dados e no diário' },
  { id: 'sleep', label: 'Última noite', detail: 'Sono, HRV e Body Battery' },
  { id: 'planned', label: 'Treino planejado', detail: 'O treino de hoje no calendário do Garmin' },
  { id: 'workout', label: 'Musculação', detail: 'Próxima ficha ou treino em andamento' },
  { id: 'food', label: 'Alimentação', detail: 'Calorias e macros do dia' },
  { id: 'body', label: 'Corpo', detail: 'Último peso e tendência' },
  { id: 'water', label: 'Água', detail: 'Total do dia e botões de 1 toque' },
  { id: 'habits', label: 'Hábitos', detail: 'Check do dia' },
  { id: 'journal', label: 'Diário', detail: 'Como foi o dia' },
]

/** The saved arrangement over the known cards: unknown ids dropped, new cards appended, visible unless hidden. */
export function homeLayout(saved: HomeLayout | undefined): { id: HomeCardId; visible: boolean }[] {
  const known = HOME_CARDS.map((card) => card.id)
  const order = saved?.order.filter((id) => known.includes(id)) ?? []
  return [...order, ...known.filter((id) => !order.includes(id))].map((id) => ({
    id,
    visible: !saved?.hidden.includes(id),
  }))
}
