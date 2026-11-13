import {
  CalendarDays,
  CalendarRange,
  ChartScatter,
  CloudSun,
  Dumbbell,
  Flame,
  Footprints,
  GlassWater,
  House,
  ListChecks,
  Medal,
  Moon,
  NotebookPen,
  PartyPopper,
  Scale,
  Settings,
  Sparkles,
  SportShoe,
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
  { to: '/corrida', label: 'Corrida', icon: SportShoe, tone: 'today' },
  { to: '/alimentacao', label: 'Alimentação', icon: Utensils, tone: 'food' },
  { to: '/corpo', label: 'Corpo', icon: Scale, tone: 'body' },
  { to: '/sono', label: 'Sono e recuperação', short: 'Sono', icon: Moon, tone: 'sleep' },
  { to: '/calorias', label: 'Calorias gastas', short: 'Calorias', icon: Flame, tone: 'training' },
  { to: '/analise', label: 'Análise do dia', short: 'Análise', icon: Sparkles, tone: 'analysis' },
  { to: '/correlacoes', label: 'Correlações', icon: ChartScatter, tone: 'insights' },
  { to: '/agua', label: 'Água', icon: GlassWater, tone: 'water' },
  // Sky blue like Água: the rain is what matters most in it.
  { to: '/clima', label: 'Clima', icon: CloudSun, tone: 'water' },
  { to: '/habitos', label: 'Hábitos', icon: ListChecks, tone: 'habits' },
  { to: '/diario', label: 'Diário', icon: NotebookPen, tone: 'journal' },
  { to: '/ajustes', label: 'Ajustes', icon: Settings, tone: 'settings' },
]

/**
 * Screens that aren't sections of their own: on the phone they are under "Mais", on the computer
 * below the sections in the sidebar. They can't go on the bottom bar.
 */
export const SCREENS: Section[] = [
  { to: '/corrida/provas', label: 'Provas', icon: Medal, tone: 'analysis' },
  { to: '/passos', label: 'Passos', icon: Footprints, tone: 'today' },
  { to: '/semana', label: 'Resumo', icon: CalendarRange, tone: 'insights' },
  { to: '/retrospectiva', label: 'Retrospectiva', icon: PartyPopper, tone: 'analysis' },
]

/** Screens reached from "Mais" that aren't sections, with the color their page uses. */
const SCREEN_TONES: Record<string, Tone> = { '/passos': 'today', '/semana': 'insights', '/retrospectiva': 'analysis' }

const under = (pathname: string, path: string) => (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`))

/**
 * Which entry of a menu the screen at `pathname` belongs to: the longest of the menu's paths it falls
 * under (on /corrida/provas, "Provas" rather than "Corrida").
 */
export function currentEntry(pathname: string, paths: string[]): string | undefined {
  return paths.filter((path) => under(pathname, path)).sort((a, b) => b.length - a.length)[0]
}

/** The section color of a route: the screen's own, else the longest section path it falls under. */
export function toneForPath(pathname: string): Tone | undefined {
  const screen = Object.keys(SCREEN_TONES).find((path) => under(pathname, path))
  if (screen) return SCREEN_TONES[screen]
  const section = currentEntry(
    pathname,
    SECTIONS.filter((item) => item.to !== '/').map((item) => item.to),
  )
  return SECTIONS.find((item) => item.to === section)?.tone ?? (pathname === '/' ? 'today' : undefined)
}

/** The phone's bottom bar fits five: four sections, then "Mais" for the rest. */
export const DEFAULT_BOTTOM = ['/', '/treinos', '/alimentacao', '/corpo']

/** The four sections of the bottom bar as chosen (unknown or repeated ones fall back to the default). */
export function bottomSections(chosen: string[] | undefined): Section[] {
  const paths = [...new Set((chosen ?? []).filter((path) => SECTIONS.some((section) => section.to === path)))]
  const list = paths.length === 4 ? paths : DEFAULT_BOTTOM
  return list.map((path) => SECTIONS.find((section) => section.to === path)!)
}
