import { Dumbbell, HeartPulse, ListChecks, Moon, Scale, Sparkles, Utensils, type LucideIcon } from 'lucide-react'
import type { Tone } from '../../components/tone'
import type { InsightSection } from '../../db/types'

export const AREAS: Record<InsightSection['area'], { label: string; icon: LucideIcon; tone: Tone }> = {
  sono: { label: 'Sono', icon: Moon, tone: 'sleep' },
  recuperacao: { label: 'Recuperação', icon: HeartPulse, tone: 'recovery' },
  treino: { label: 'Treino', icon: Dumbbell, tone: 'training' },
  alimentacao: { label: 'Alimentação', icon: Utensils, tone: 'food' },
  corpo: { label: 'Corpo', icon: Scale, tone: 'body' },
  habitos: { label: 'Hábitos', icon: ListChecks, tone: 'habits' },
  geral: { label: 'Geral', icon: Sparkles, tone: 'analysis' },
}
