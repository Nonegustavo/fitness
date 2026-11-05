import {
  CalendarDays,
  ChartScatter,
  ChevronRight,
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
} from 'lucide-react'
import { Link } from 'react-router'
import { bottomSections } from '../../components/sections'
import { IconTile, type Tone } from '../../components/tone'
import { Card, Page } from '../../components/ui'
import { useSettings } from '../../db/hooks'

/** Every screen, in the order of the sidebar; the ones on the bottom bar are left out. */
const LINKS: { to: string; label: string; detail: string; icon: typeof Moon; tone: Tone }[] = [
  { to: '/', label: 'Hoje', detail: 'Em foco, visualização rápida e o próximo passo do dia', icon: House, tone: 'today' },
  { to: '/treinos', label: 'Treinos', detail: 'Fichas, treino em andamento, histórico e exercícios', icon: Dumbbell, tone: 'training' },
  {
    to: '/calendario',
    label: 'Calendário',
    detail: 'Programar as fichas nos dias, com as corridas do Garmin',
    icon: CalendarDays,
    tone: 'training',
  },
  { to: '/corrida', label: 'Corrida', detail: 'Volume, ritmo, constância, recordes e a próxima prova', icon: Footprints, tone: 'today' },
  { to: '/alimentacao', label: 'Alimentação', detail: 'Refeições, calorias e macros do dia', icon: Utensils, tone: 'food' },
  { to: '/corpo', label: 'Corpo', detail: 'Peso, medidas e a tendência', icon: Scale, tone: 'body' },
  { to: '/calorias', label: 'Calorias gastas', detail: 'Ativas e em repouso, contra o que você comeu', icon: Flame, tone: 'training' },
  { to: '/passos', label: 'Passos', detail: 'Dia a dia, com as médias', icon: Footprints, tone: 'today' },
  { to: '/sono', label: 'Sono e recuperação', detail: 'Noite, HRV, FC de repouso e Body Battery do Garmin', icon: Moon, tone: 'sleep' },
  { to: '/analise', label: 'Análise do dia', detail: 'O Claude lê seus dados e o diário', icon: Sparkles, tone: 'analysis' },
  {
    to: '/correlacoes',
    label: 'Correlações',
    detail: 'Hábitos, treino e alimentação × sono, recuperação e peso',
    icon: ChartScatter,
    tone: 'insights',
  },
  { to: '/agua', label: 'Água', detail: 'Meta, recipientes e histórico', icon: GlassWater, tone: 'water' },
  { to: '/habitos', label: 'Hábitos', detail: 'Check do dia, sequências, lembretes e histórico', icon: ListChecks, tone: 'habits' },
  { to: '/diario', label: 'Diário', detail: 'Como foi o dia, humor e energia', icon: NotebookPen, tone: 'journal' },
  { to: '/ajustes', label: 'Ajustes', detail: 'Sincronização, Garmin, backup e locais de medida', icon: Settings, tone: 'settings' },
]

/** The sections that don't fit the phone's bottom bar. */
export default function MorePage() {
  const settings = useSettings()
  const onBar = new Set(bottomSections(settings.navBar).map((section) => section.to))
  return (
    <Page title="Mais">
      <Card>
        <ul className="divide-y divide-line">
          {LINKS.filter((link) => !onBar.has(link.to)).map(({ to, label, detail, icon, tone }) => (
            <li key={to}>
              <Link to={to} className="flex items-center gap-3 py-3 hover:text-accent-ink">
                <IconTile icon={icon} tone={tone} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{label}</span>
                  <span className="block truncate text-xs text-muted">{detail}</span>
                </span>
                <ChevronRight size={18} className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  )
}
