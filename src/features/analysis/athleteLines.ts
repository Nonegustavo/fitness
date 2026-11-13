import type { Activity, ActivityStream, DailyHealth, Pain, Race } from '../../db/types'
import { formatDay, type DayKey } from '../../lib/dates'
import { formatClock, formatFixed, formatNumber, formatSigned } from '../../lib/format'
import { shiftPeriod } from '../../lib/periods'
import type { PlannedEvent } from '../garmin/calendar'
import { nextRaceView } from '../races/race'
import { ACWR_FLAGS, dailyLoads, FORM_ZONES, loadSeries, loadStatus, type LoadDay, type LoadStatus } from '../running/load'
import { distanceLabel, fitnessOf, monthlyVdot, predictRace, runEfforts, type Effort, type RunFitness } from '../running/predict'
import { BANDS, readiness, readinessDay, type Readiness } from '../running/readiness'
import { formatPace, type EffortSource } from '../running/running'

/** What the lines read; the daily analysis' input has all of it. */
export interface AthleteInput {
  sources: {
    activities: Activity[]
    health: DailyHealth[]
    pains?: Pain[]
    /** The heart rate samples of the activities without the watch's zones, for their training load. */
    streams?: ReadonlyMap<string, Pick<ActivityStream, 'step' | 'hr'>>
  }
  /** The runs' best stretches: their samples, or the cache of what they hold. */
  streams?: EffortSource
  planned: PlannedEvent[] | null
  /** The races of the app's list. */
  races?: Race[]
  today: DayKey
}

const whole = (value: number) => formatNumber(value, 0)
const clock = (seconds: number) => `~${formatClock(seconds)}`
const short = (date: DayKey) => formatDay(date, 'd/MM')

function loadLine(status: LoadStatus): string {
  const form =
    status.formPct !== undefined && status.zone
      ? ` (${formatSigned(status.formPct, 0)}% do CTL: ${FORM_ZONES[status.zone].label.toLowerCase()}, ${FORM_ZONES[status.zone].text})`
      : ''
  const ratio = status.acwr !== undefined && status.flag ? `${formatFixed(status.acwr, 2)}, ${ACWR_FLAGS[status.flag]}` : 'sem histórico suficiente'
  return (
    `- Carga de treino (TRIMP de Edwards: minutos em cada zona de FC × o número da zona, de toda atividade do relógio com FC): ` +
    `hoje ${whole(status.load)}, últimos 7 dias ${whole(status.acute)}, média semanal das últimas 4 semanas ${whole(status.chronic)}. ` +
    `Fadiga (ATL, 7 dias) ${whole(status.atl)}, condicionamento (CTL, 42 dias) ${whole(status.ctl)}, forma (TSB = CTL − ATL) ` +
    `${formatSigned(Math.round(status.tsb), 0)}${form}. ACWR (7 dias contra a média semanal de 28): ${ratio}.`
  )
}

/** Fitness some weeks back, to see it building up or fading. */
function fitnessTrend(series: LoadDay[]): string | undefined {
  const back = [56, 28, 14].flatMap((days) => {
    const day = series[series.length - 1 - days]
    return day ? [`há ${days / 7} semanas ${whole(day.ctl)}`] : []
  })
  return back.length > 0 ? `- Condicionamento (CTL): ${back.join(', ')}, hoje ${whole(series.at(-1)!.ctl)}.` : undefined
}

const EFFECT_WORDS = { up: 'ajuda', down: 'pesa', neutral: 'neutro' } as const

function readinessLine(result: Readiness, today: DayKey): string {
  const when = result.date === today ? 'hoje' : `de ${short(result.date)} (a noite de hoje ainda não chegou do relógio)`
  const factors = result.factors.map((factor) =>
    factor.key === 'pains'
      ? `Dores ${factor.reason}: tira ${result.penalty} pontos`
      : `${factor.label} ${factor.reason}: ${EFFECT_WORDS[factor.effect]}`,
  )
  return (
    `- Prontidão para treinar ${when} (0 a 100, no estilo do Training Readiness do Garmin, calculada pelo app: nota do sono 30%, ` +
    `HRV contra a faixa normal 25%, FC de repouso contra a média de 30 dias 15% e carga 20%, menos as dores): ` +
    `${result.score}, ${BANDS[result.band].label.toLowerCase()}. ` +
    `Fatores: ${factors.join('; ')}.`
  )
}

const effortText = (effort: Effort) => `${distanceLabel(effort.meters)} em ${formatClock(effort.seconds)}, ${short(effort.date)}`

function predictionsLine({ reference, predictions }: RunFitness): string | undefined {
  if (!reference) return undefined
  const times = predictions.map(
    (prediction) => `${prediction.label} ${clock(prediction.seconds)} (${formatPace(prediction.seconds / (prediction.meters / 1000))}/km)`,
  )
  return `- Previsões de prova (fórmula de Riegel, do melhor trecho longo e forte dos últimos 90 dias: ${effortText(reference)}): ${times.join(', ')}.`
}

function vdotLine(best: Effort, efforts: Effort[], today: DayKey): string {
  const months = monthlyVdot(efforts, today, 6).map(
    ({ month, best: top }) => `${formatDay(month, 'MMM')} ${top ? formatFixed(top.vdot, 1) : '—'}`,
  )
  return (
    `- VO2max estimado (VDOT de Daniels e Gilbert, do melhor trecho de 3 km ou mais nos últimos 90 dias: ${effortText(best)}): ` +
    `${formatFixed(best.vdot, 1)}. O melhor de cada mês (6 meses): ${months.join(' · ')}.`
  )
}

/**
 * The training load (ATL, CTL, TSB, ACWR), today's readiness with its factors, the race predictions, the VDOT
 * and the next race's predicted time, as computed by the app, for the daily analysis.
 */
export function athleteLines({ sources, streams, planned, races, today }: AthleteInput): string[] {
  const lines: string[] = []
  const series = loadSeries(dailyLoads(sources.activities, sources.streams), today)
  const status = loadStatus(series)
  if (status) {
    lines.push(loadLine(status))
    const trend = fitnessTrend(series)
    if (trend) lines.push(trend)
  }

  const date = readinessDay(sources.health, today)
  const ready = readiness({ date, health: sources.health, load: loadStatus(series, date), pains: sources.pains })
  if (ready) lines.push(readinessLine(ready, today))

  // Only the runs of the months shown: the rest would be slow to go through for nothing.
  const since = shiftPeriod('month', today, -5)
  const efforts = streams ? runEfforts(sources.activities.filter((activity) => activity.date >= since), streams) : []
  const fitness = fitnessOf(efforts, today)
  const predictions = predictionsLine(fitness)
  if (predictions) lines.push(predictions)
  if (fitness.best) lines.push(vdotLine(fitness.best, efforts, today))

  const race = nextRaceView(races ?? [], planned, today, sources.activities)
  const prediction = race?.distance && predictRace(fitness, race.distance)
  if (race && prediction) {
    const ends = prediction.ends
      ? ` (${clock(prediction.ends[0].seconds)} para ${distanceLabel(prediction.ends[0].meters)}, ${clock(prediction.ends[1].seconds)} para ${distanceLabel(prediction.ends[1].meters)})`
      : ''
    const goal = race.goalSec !== undefined ? `; a meta do atleta é ${formatClock(race.goalSec)}` : ''
    lines.push(`- Previsão para a próxima prova, ${race.name}: ${clock(prediction.seconds)} para ${distanceLabel(prediction.meters)}${ends}${goal}.`)
  }
  return lines
}
