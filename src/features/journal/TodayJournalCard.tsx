import { NotebookPen } from 'lucide-react'
import { Link } from 'react-router'
import { Card } from '../../components/ui'
import type { DayKey } from '../../lib/dates'
import { JournalEditor } from './JournalEditor'

/** The diary right on the Hoje screen: tap a face, write a line. */
export function TodayJournalCard({ today }: { today: DayKey }) {
  return (
    <Card
      icon={NotebookPen}
      tone="journal"
      title="Diário"
      action={
        <Link to="/diario" className="text-sm font-medium text-accent-ink">
          Outros dias
        </Link>
      }
    >
      <JournalEditor date={today} rows={3} />
    </Card>
  )
}
