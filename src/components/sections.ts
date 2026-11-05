import {
  CalendarDays,
  ChartScatter,
  Dumbbell,
  Flame,
  Footprints,
  GlassWater,
  House,
  ListChecks,
  Moon,
  NotebookPen,
  Scale,
  Settings,
  Sparkles,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import type { Tone } from './tone'

export interface Section {
  to: string
  label: string
  /** For the phone's bottom bar, where room is short. */
  short?: string
  icon: LucideIcon
  tone: Tone
}

/** Every section, as the desktop sidebar lists them, each with its color. */
export const SECTIONS: Section[] = [
  { to: '/', label: 'Hoje', icon: House, tone: 'today' },
  { to: '/treinos', label: 'Treinos', icon: Dumbbell, tone: 'training' },
  { to: '/calendario', label: 'Calendário', icon: CalendarDays, tone: 'training' },
  { to: '/corrida', label: 'Corrida', icon: Footprints, tone: 'today' },
  { to: '/alimentacao', label: 'Alimentação', icon: Utensils, tone: 'food' },
  { to: '/corpo', label: 'Corpo', icon: Scale, tone: 'body' },
  { to: '/sono', label: 'Sono', icon: Moon, tone: 'sleep' },
  { to: '/calorias', label: 'Calorias gastas', short: 'Calorias', icon: Flame, tone: 'training' },
  { to: '/analise', label: 'Análise', icon: Sparkles, tone: 'analysis' },
  { to: '/correlacoes', label: 'Correlações', icon: ChartScatter, tone: 'insights' },
  { to: '/agua', label: 'Água', icon: GlassWater, tone: 'water' },
  { to: '/habitos', label: 'Hábitos', icon: ListChecks, tone: 'habits' },
  { to: '/diario', label: 'Diário', icon: NotebookPen, tone: 'journal' },
  { to: '/ajustes', label: 'Ajustes', icon: Settings, tone: 'settings' },
]

/** The phone's bottom bar fits five: four sections, then "Mais" for the rest. */
export const DEFAULT_BOTTOM = ['/', '/treinos', '/alimentacao', '/corpo']

/** The four sections of the bottom bar as chosen (unknown or repeated ones fall back to the default). */
export function bottomSections(chosen: string[] | undefined): Section[] {
  const paths = [...new Set((chosen ?? []).filter((path) => SECTIONS.some((section) => section.to === path)))]
  const list = paths.length === 4 ? paths : DEFAULT_BOTTOM
  return list.map((path) => SECTIONS.find((section) => section.to === path)!)
}
