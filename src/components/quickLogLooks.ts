import { Bandage, Camera, Dumbbell, GlassWater, ListChecks, NotebookPen, Ruler, Scale, Utensils, type LucideIcon } from 'lucide-react'
import { KIND_ICONS, KIND_TONES } from '../features/calendar/components'
import type { QuickLogId } from './quickLogItems'
import type { Tone } from './tone'

/** How each item of the "+" reads and looks, in its sheet and in the sheet's editor. */
export const LOOKS: Record<QuickLogId, { label: string; detail: string; icon: LucideIcon; tone: Tone }> = {
  food: { label: 'Alimento', detail: 'Na refeição desta hora', icon: Utensils, tone: 'food' },
  plate: { label: 'Foto do prato', detail: 'A câmera, para ler o prato', icon: Camera, tone: 'food' },
  weight: { label: 'Pesagem', detail: 'Peso e composição', icon: Scale, tone: 'body' },
  measure: { label: 'Medição', detail: 'As medidas do corpo', icon: Ruler, tone: 'body' },
  workout: { label: 'Treino', detail: 'O de hoje, ou a próxima ficha', icon: Dumbbell, tone: 'training' },
  walk: { label: 'Caminhada', detail: 'Programar uma, hoje ou toda semana', icon: KIND_ICONS.walk, tone: KIND_TONES.walk },
  habits: { label: 'Hábitos', detail: 'O check do dia', icon: ListChecks, tone: 'habits' },
  journal: { label: 'Diário', detail: 'Como foi o dia', icon: NotebookPen, tone: 'journal' },
  pain: { label: 'Dor', detail: 'Uma dor ou desconforto, no diário', icon: Bandage, tone: 'journal' },
  water: { label: 'Água', detail: 'Os botões dos copos favoritos', icon: GlassWater, tone: 'water' },
}
