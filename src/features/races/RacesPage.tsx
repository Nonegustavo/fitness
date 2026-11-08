import { CalendarPlus, Medal, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useToast } from '../../components/Toast'
import { Button, Card, Empty, Page, SkeletonCard } from '../../components/ui'
import { useNewFromLink } from '../../components/useNewFromLink'
import { useToday } from '../../db/hooks'
import type { Race } from '../../db/types'
import { formatDay, shiftDay } from '../../lib/dates'
import { useActivities } from '../activities/activities'
import { eventKey, eventTitle } from '../calendar/agenda'
import { raceDistance } from '../running/predict'
import { useRecentFitness } from '../running/RacePrediction'
import { AheadRow, countdown, DoneRow } from './components'
import { distanceText, garminRaces, raceDone } from './race'
import { RaceModal } from './RaceModal'
import { bringRace, useCalendarWithPast, useRaces } from './races'

/** How far back the Garmin calendar's races are offered to bring in. */
const GARMIN_BACK_DAYS = 60

/**
 * The races: the ones ahead (with the goal and the time predicted), the Garmin calendar's not in the
 * list yet (one tap brings each), and the ones done, with their time against the goal.
 */
export default function RacesPage() {
  const today = useToday()
  const toast = useToast()
  const races = useRaces()
  const events = useCalendarWithPast()
  const activities = useActivities()
  const fitness = useRecentFitness(today)
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<Race | 'new' | null>(null)
  useNewFromLink('prova', () => setEditing('new'))

  // `?prova=<id>` (from the calendar or a run) opens that race once.
  const asked = params.get('prova')
  useEffect(() => {
    if (!asked || !races) return
    const race = races.find((item) => item.id === asked)
    if (race) setEditing(race)
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('prova')
        return next
      },
      { replace: true },
    )
  }, [asked, races, setParams])

  const back = { to: '/corrida', label: 'Corrida' }
  const actions = (
    <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
      <Plus size={16} /> Nova
    </Button>
  )
  if (!races || events === undefined || !activities) {
    return (
      <Page title="Provas" icon={Medal} tone="analysis" back={back} actions={actions}>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={4} />
      </Page>
    )
  }

  const ahead = races.filter((race) => !raceDone(race, activities, today))
  const done = races.filter((race) => raceDone(race, activities, today)).reverse()
  const fromGarmin = garminRaces(events, races).filter((event) => event.date >= shiftDay(today, -GARMIN_BACK_DAYS))

  return (
    <Page title="Provas" icon={Medal} tone="analysis" back={back} actions={actions}>
      <Card title="Próximas">
        {ahead.length === 0 ? (
          <Empty>Nenhuma prova à frente.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {ahead.map((race) => (
              <AheadRow key={race.id} race={race} today={today} fitness={fitness} onOpen={() => setEditing(race)} />
            ))}
          </ul>
        )}
      </Card>

      {fromGarmin.length > 0 && (
        <Card title="No calendário do Garmin">
          <p className="mb-1 text-xs text-muted">
            Trazendo para as suas provas, dá para pôr a meta, ver o resultado, e a prova e o treino do treinador no dia viram um
            item só no calendário.
          </p>
          <ul className="divide-y divide-line">
            {fromGarmin.map((event) => {
              const distance = distanceText(raceDistance(event.title))
              return (
                <li key={eventKey(event)} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{eventTitle(event.title)}</span>
                    <span className="block text-sm text-ink-2 first-letter:uppercase">
                      {[formatDay(event.date, "EEE, d 'de' MMM"), event.date >= today && countdown(event.date, today), distance]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const race = await bringRace(event)
                      toast({ message: `${race.name} está nas suas provas` })
                    }}
                  >
                    <CalendarPlus size={16} /> Trazer
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card title="Feitas">
        {done.length === 0 ? (
          <Empty>As provas feitas aparecem aqui, com o tempo e a meta.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {done.map((race) => (
              <DoneRow key={race.id} race={race} activities={activities} onOpen={() => setEditing(race)} />
            ))}
          </ul>
        )}
      </Card>

      {editing && <RaceModal race={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}
