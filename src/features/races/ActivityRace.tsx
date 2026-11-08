import { CalendarPlus, ChevronRight, Medal, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, Card } from '../../components/ui'
import type { Activity, Race } from '../../db/types'
import { daysBetween, formatDay } from '../../lib/dates'
import { useActivities } from '../activities/activities'
import { eventKey, eventTitle, raceRun } from '../calendar/agenda'
import { raceLine, whenText } from './components'
import { garminRaces } from './race'
import { RaceModal } from './RaceModal'
import { bringRace, linkRun, useCalendarWithPast, useRaces } from './races'

/** The race a run was (linked to it, or the longest run of the race's day); null when none, undefined while loading. */
function useRaceOf(activity: Activity): Race | null | undefined {
  const races = useRaces()
  const activities = useActivities()
  if (!races || !activities) return undefined
  return races.find((race) => raceRun(race, activities)?.id === activity.id) ?? null
}

/** Under a run that was a race: the race, with its time against the goal; it opens the race. */
export function RaceOfRun({ activity }: { activity: Activity }) {
  const race = useRaceOf(activity)
  const activities = useActivities()
  if (!race || !activities) return null
  const line = raceLine(race, activities)
  return (
    <Card icon={Medal} tone="analysis" title="Prova">
      <Link to={`/corrida/provas?prova=${race.id}`} className="flex items-center gap-2 hover:text-accent-ink">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{race.name}</span>
          {line && <span className="block text-sm text-ink-2">{line}</span>}
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </Link>
    </Card>
  )
}

/** "É uma prova", for a run that isn't one yet: which race it was. */
export function RaceLinkButton({ activity }: { activity: Activity }) {
  const race = useRaceOf(activity)
  const [picking, setPicking] = useState(false)
  if (race !== null) return null
  return (
    <>
      <Button variant="ghost" className="w-full" onClick={() => setPicking(true)}>
        <Medal size={16} /> É uma prova
      </Button>
      {picking && <RacePicker activity={activity} onClose={() => setPicking(false)} />}
    </>
  )
}

/**
 * Which race a run was: one of the list on its day (or the day around it), one of the Garmin calendar
 * there (brought into the list with it), or a new one.
 */
function RacePicker({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const toast = useToast()
  const races = useRaces()
  const events = useCalendarWithPast()
  const [creating, setCreating] = useState(false)
  if (creating) {
    return (
      <RaceModal
        race={null}
        initial={{ name: activity.title ?? '', date: activity.date, activityId: activity.id }}
        onClose={onClose}
      />
    )
  }
  const near = (date: string) => Math.abs(daysBetween(date, activity.date)) <= 1
  const listed = (races ?? []).filter((race) => near(race.date))
  const calendar = garminRaces(events ?? null, races ?? []).filter((event) => near(event.date))
  const done = (name: string) => {
    toast({ message: `Corrida ligada a ${name}` })
    onClose()
  }
  const choice = 'flex w-full items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-left transition hover:text-accent-ink active:scale-[0.99]'

  return (
    <Modal open title="Qual prova foi?" onClose={onClose}>
      <p className="mb-3 text-sm text-ink-2 first-letter:uppercase">
        Corrida de {formatDay(activity.date)}
      </p>
      {listed.length + calendar.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {listed.map((race) => (
            <li key={race.id}>
              <button
                type="button"
                className={choice}
                onClick={async () => {
                  await linkRun(race, activity.id)
                  done(race.name)
                }}
              >
                <Medal size={18} className="shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{race.name}</span>
                  <span className="block text-xs text-muted first-letter:uppercase">{whenText(race)}</span>
                </span>
              </button>
            </li>
          ))}
          {calendar.map((event) => (
            <li key={eventKey(event)}>
              <button
                type="button"
                className={choice}
                onClick={async () => {
                  const race = await bringRace(event, activity.id)
                  done(race.name)
                }}
              >
                <CalendarPlus size={18} className="shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{eventTitle(event.title)}</span>
                  <span className="block text-xs text-muted first-letter:uppercase">
                    {formatDay(event.date, "EEE, d 'de' MMM")} · do calendário do Garmin
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">Nenhuma prova neste dia, nem nas suas provas nem no calendário do Garmin.</p>
      )}
      <Button className="w-full" onClick={() => setCreating(true)}>
        <Plus size={16} /> Nova prova
      </Button>
    </Modal>
  )
}
