import { useState } from 'react'
import { Button, Card, Empty, Page, SkeletonCard } from '../../components/ui'
import { useToday } from '../../db/hooks'
import type { Activity } from '../../db/types'
import { formatDay } from '../../lib/dates'
import { useActivities } from './activities'
import { ActivityRow, FitHowTo, ImportFitButton } from './components'

/** Activities shown at first, and how many more each "Mostrar mais" brings. */
const PAGE = 30

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export default function ActivitiesPage() {
  const activities = useActivities()
  const today = useToday()
  const [shown, setShown] = useState(PAGE)
  if (!activities) {
    return (
      <Page title="Atividades" back={{ to: '/treinos', label: 'Treinos' }}>
        <SkeletonCard lines={6} />
      </Page>
    )
  }

  // One card per month, newest first, for the activities shown so far.
  const months = new Map<string, Activity[]>()
  for (const activity of activities.slice(0, shown)) {
    const month = activity.date.slice(0, 7)
    const rows = months.get(month)
    if (rows) rows.push(activity)
    else months.set(month, [activity])
  }

  return (
    <Page title="Atividades" back={{ to: '/treinos', label: 'Treinos' }} actions={<ImportFitButton fromLink />}>
      {activities.length === 0 ? (
        <Card>
          <Empty>Nenhuma atividade importada ainda.</Empty>
          <FitHowTo />
        </Card>
      ) : (
        [...months].map(([month, rows]) => (
          <Card key={month} title={capitalize(formatDay(`${month}-01`, "MMMM 'de' yyyy"))}>
            <ul className="divide-y divide-line">
              {rows.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} today={today} />
              ))}
            </ul>
          </Card>
        ))
      )}
      {activities.length > shown && (
        <Button size="sm" variant="ghost" className="w-full" onClick={() => setShown((count) => count + PAGE)}>
          Mostrar mais
        </Button>
      )}
    </Page>
  )
}
