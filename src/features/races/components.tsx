import { Link } from 'react-router'
import type { Activity, Race } from '../../db/types'
import { daysBetween, formatDay, type DayKey } from '../../lib/dates'
import { formatClock } from '../../lib/format'
import { formatDistance } from '../activities/activities'
import { predictRace, type RunFitness } from '../running/predict'
import { predicted } from '../running/RacePrediction'
import { formatPace } from '../running/running'
import { distanceText, raceDistanceOf, raceResult, type RaceResult } from './race'

/** "Hoje", "Amanhã", "em 12 dias". */
export const countdown = (date: DayKey, today: DayKey): string => {
  const days = daysBetween(today, date)
  return days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `em ${days} dias`
}

/** "1:35 abaixo da meta", "0:40 acima da meta", "na meta". */
export function vsGoalText(vsGoal: number): string {
  if (Math.round(vsGoal) === 0) return 'na meta'
  return `${formatClock(Math.abs(vsGoal))} ${vsGoal < 0 ? 'abaixo' : 'acima'} da meta`
}

/** "38:25 · 6,24 km · 6:10/km", with "oficial" when it's the chip's time. */
export function resultText(result: RaceResult): string | undefined {
  if (result.seconds === undefined) return undefined
  return [
    `${formatClock(result.seconds)}${result.official ? ' oficial' : ''}`,
    result.meters ? formatDistance(result.meters) : undefined,
    result.pace ? `${formatPace(result.pace)}/km` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** "sáb, 15 de nov · 08:00 · 10 km". */
export function whenText(race: Race): string {
  return [formatDay(race.date, "EEE, d 'de' MMM"), race.time, distanceText(raceDistanceOf(race))].filter(Boolean).join(' · ')
}

/** A race ahead: when, how far, the goal (with its pace) and the time predicted from the recent runs. */
export function AheadRow({ race, today, fitness, onOpen }: { race: Race; today: DayKey; fitness?: RunFitness | null; onOpen: () => void }) {
  const distance = raceDistanceOf(race)
  const prediction = fitness && distance ? predictRace(fitness, distance) : undefined
  const goalPace = race.goalSec !== undefined && distance ? race.goalSec / (distance.meters / 1000) : undefined
  return (
    <li>
      <button type="button" onClick={onOpen} className="block w-full py-2.5 text-left hover:text-accent-ink">
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate font-medium">{race.name}</span>
          <span className="shrink-0 text-sm font-semibold text-accent-ink">{countdown(race.date, today)}</span>
        </span>
        <span className="block text-sm text-ink-2 first-letter:uppercase">{whenText(race)}</span>
        {(race.goalSec !== undefined || prediction) && (
          <span className="block text-xs text-muted">
            {[
              race.goalSec !== undefined && `Meta ${formatClock(race.goalSec)}${goalPace ? ` (${formatPace(goalPace)}/km)` : ''}`,
              prediction && `previsão ${predicted(prediction.seconds)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </button>
    </li>
  )
}

/** A race behind: its time and pace, against the goal, with the way to its run. */
export function DoneRow({ race, activities, onOpen }: { race: Race; activities: Activity[]; onOpen: () => void }) {
  const result = raceResult(race, activities)
  const text = resultText(result)
  return (
    <li className="flex items-start gap-3 py-2.5">
      <button type="button" onClick={onOpen} className="block min-w-0 flex-1 text-left hover:text-accent-ink">
        <span className="block truncate font-medium">{race.name}</span>
        <span className="block text-sm text-ink-2 first-letter:uppercase">{formatDay(race.date, "EEE, d 'de' MMM 'de' yyyy")}</span>
        <span className="block text-sm tabular-nums">{text ?? <span className="text-muted">Sem a corrida dela</span>}</span>
        {result.vsGoal !== undefined && (
          <span className={result.vsGoal <= 0 ? 'block text-xs font-medium text-good' : 'block text-xs text-ink-2'}>
            {vsGoalText(result.vsGoal)}
          </span>
        )}
      </button>
      {result.run && (
        <Link to={`/treinos/atividades/${result.run.id}`} className="shrink-0 pt-0.5 text-sm font-medium text-accent-ink">
          Corrida
        </Link>
      )}
    </li>
  )
}

/** The line of a race under its run: "Rústica de Morungava · 38:25 · 1:35 abaixo da meta". */
export function raceLine(race: Race, activities: Activity[]): string {
  const result = raceResult(race, activities)
  return [
    result.seconds !== undefined && `${formatClock(result.seconds)}${result.official ? ' oficial' : ''}`,
    result.vsGoal !== undefined && vsGoalText(result.vsGoal),
    result.vsGoal === undefined && race.time && `largada às ${race.time}`,
  ]
    .filter(Boolean)
    .join(' · ')
}
