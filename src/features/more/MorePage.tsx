import { ChevronRight, GlassWater, ListChecks, Settings } from 'lucide-react'
import { Link } from 'react-router'
import { Card, Page } from '../../components/ui'

const LINKS = [
  { to: '/agua', label: 'Água', detail: 'Meta, recipientes e histórico', icon: GlassWater },
  { to: '/habitos', label: 'Hábitos', detail: 'Check do dia, sequências e histórico', icon: ListChecks },
  { to: '/ajustes', label: 'Ajustes', detail: 'Sincronização, backup e locais de medida', icon: Settings },
]

/** The sections that don't fit the phone's bottom bar. */
export default function MorePage() {
  return (
    <Page title="Mais">
      <Card>
        <ul className="divide-y divide-line">
          {LINKS.map(({ to, label, detail, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex items-center gap-3 py-3 hover:text-accent-ink">
                <Icon size={22} className="shrink-0 text-ink-2" />
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
