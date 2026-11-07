import { Card, Empty, Page, SkeletonCard } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { formatDay } from '../../lib/dates'
import { useActivities } from './activities'
import { ActivityRow, FitHowTo, ImportFitButton } from './components'

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export default function ActivitiesPage() {
  const activities = useActivities()
  const today = useToday()
  if (!activities) {
    return (
      <Page title="Atividades" back={{ to: '/treinos', label: 'Treinos' }}>
        <SkeletonCard lines={6} />
      </Page>
    )
  }

  // One card per month, newest first.
  const months = new Map<string, typeof activities>()
  for (const activity of activities) {
    const month = activity.date.slice(0, 7)
    months.set(month, [...(months.get(month) ?? []), activity])
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
    </Page>
  )
}
