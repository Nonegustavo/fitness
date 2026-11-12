import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { bottomSections, SCREENS, SECTIONS } from '../../components/sections'
import { IconTile } from '../../components/tone'
import { Card, Page } from '../../components/ui'
import { useSettings } from '../../db/hooks'

/** Every screen in the order this list shows them, with what each is for. The names come from the menus. */
const DETAILS: [to: string, detail: string][] = [
  ['/', 'Em foco, visualização rápida e o próximo passo do dia'],
  ['/treinos', 'Fichas, treino em andamento, histórico e exercícios'],
  ['/calendario', 'Programar as fichas nos dias, com as corridas do Garmin'],
  ['/corrida', 'Volume, ritmo, constância, recordes e a próxima prova'],
  ['/corrida/provas', 'As próximas, com meta e previsão, e o resultado das feitas'],
  ['/alimentacao', 'Refeições, calorias e macros do dia'],
  ['/corpo', 'Peso, medidas e a tendência'],
  ['/calorias', 'Ativas e em repouso, contra o que você comeu'],
  ['/passos', 'Dia a dia, com as médias'],
  ['/sono', 'Noite, HRV, FC de repouso e Body Battery do Garmin'],
  ['/analise', 'O Claude lê seus dados e o diário'],
  ['/correlacoes', 'Hábitos, treino e alimentação × sono, recuperação e peso'],
  ['/semana', 'A semana que passou contra a anterior, área por área'],
  ['/retrospectiva', 'O seu ano em números, mês a mês'],
  ['/agua', 'Registros por dia, meta e recipientes'],
  ['/clima', 'Previsão e o tempo nos treinos'],
  ['/habitos', 'Check do dia, sequências, lembretes e histórico'],
  ['/diario', 'Como foi o dia, humor e energia'],
  ['/ajustes', 'Sincronização, Garmin, backup e locais de medida'],
]

const MENU = [...SECTIONS, ...SCREENS]

const LINKS = DETAILS.flatMap(([to, detail]) => {
  const entry = MENU.find((item) => item.to === to)
  return entry ? [{ ...entry, detail }] : []
})

/** The sections that don't fit the phone's bottom bar, and the screens that aren't sections. */
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
