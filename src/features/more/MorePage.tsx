import {
  CalendarDays,
  ChartScatter,
  ChevronRight,
  Footprints,
  GlassWater,
  ListChecks,
  Moon,
  NotebookPen,
  Settings,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { Link } from 'react-router'
import { IconTile, type Tone } from '../../components/tone'
import { Card, Page } from '../../components/ui'

const LINKS: { to: string; label: string; detail: string; icon: typeof Moon; tone: Tone }[] = [
  {
    to: '/calendario',
    label: 'Calendário',
    detail: 'Programar as fichas nos dias, com as corridas do Garmin',
    icon: CalendarDays,
    tone: 'training',
  },
  { to: '/recordes', label: 'Recordes de corrida', detail: 'Os 5 melhores tempos em cada distância e as mais longas', icon: Trophy, tone: 'analysis' },
  { to: '/passos', label: 'Passos', detail: 'Dia a dia, com as calorias do relógio', icon: Footprints, tone: 'today' },
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
  return (
    <Page title="Mais">
      <Card>
        <ul className="divide-y divide-line">
          {LINKS.map(({ to, label, detail, icon, tone }) => (
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
