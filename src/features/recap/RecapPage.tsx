import {
  Bandage,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Dumbbell,
  Footprints,
  GlassWater,
  ListChecks,
  Moon,
  Mountain,
  NotebookPen,
  PartyPopper,
  Route,
  Scale,
  Trophy,
  Utensils,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { toneColor } from '../../components/tone'
import { Button, Card, Empty, IconButton, Page, SkeletonCard } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { formatDay, type DayKey } from '../../lib/dates'
import { formatClock, formatDuration, formatNumber, formatSigned } from '../../lib/format'
import { levelOf, MOODS } from '../journal/journal'
import { formatPace } from '../running/running'
import { compactCount, defaultYear, monthName, recapText, recapYears, tonnes, type Recap } from './recap'
import { useFirstRecordDay, useRecap } from './useRecap'

const km = (value: number) => `${formatNumber(value, value >= 100 ? 0 : 1)} km`
const kg = (value: number) => `${formatNumber(value, 1)} kg`
const hours = (seconds: number) => formatDuration(seconds * 1000)
const day = (date: DayKey) => formatDay(date, "d 'de' MMM")
const activityLink = (id: string) => `/treinos/atividades/${id}`

const SECTIONS = ['running', 'walking', 'strength', 'steps', 'sleep', 'body', 'habits', 'food', 'water', 'journal', 'pains'] as const

/**
 * "Retrospectiva": a year in numbers, like Strava's Year in Sport. The highlights, the training days
 * month by month, then each area that has data, and the whole of it as text to paste anywhere.
 */
export default function RecapPage() {
  const today = useToday()
  const toast = useToast()
  const firstDay = useFirstRecordDay()
  const [params, setParams] = useSearchParams()
  const years = firstDay === undefined ? undefined : recapYears(firstDay ?? undefined, today)
  const asked = Number(params.get('ano'))
  const year = years && (years.includes(asked) ? asked : defaultYear(today, years))
  const recap = useRecap(year, today)
  const [fallback, setFallback] = useState<string | null>(null)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast({ message: 'Resumo copiado: é só colar onde quiser' })
    } catch {
      // Some WebViews block the clipboard: show the text to copy by hand.
      setFallback(text)
    }
  }

  return (
    <Page title="Retrospectiva" icon={PartyPopper} tone="analysis" subtitle="O seu ano em números">
      {years && year !== undefined && years.length > 1 && (
        <YearPicker years={years} year={year} onChange={(next) => setParams(next === defaultYear(today, years) ? {} : { ano: String(next) }, { replace: true })} />
      )}
      {!recap || recap.year !== year ? (
        <>
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
        </>
      ) : recap.trainingDays === 0 && SECTIONS.every((key) => !recap[key]) ? (
        <Card>
          <Empty>Nada registrado em {recap.year}.</Empty>
        </Card>
      ) : (
        <RecapView recap={recap} onCopy={() => void copy(recapText(recap))} />
      )}
      {fallback && (
        <Modal open title="Copie o texto" onClose={() => setFallback(null)}>
          <textarea
            readOnly
            autoFocus
            rows={12}
            value={fallback}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink"
          />
        </Modal>
      )}
    </Page>
  )
}

function YearPicker({ years, year, onChange }: { years: number[]; year: number; onChange: (year: number) => void }) {
  const index = years.indexOf(year)
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-1">
      <IconButton label="Ano anterior" disabled={index <= 0} onClick={() => onChange(years[index - 1])}>
        <ChevronLeft size={20} />
      </IconButton>
      <p className="text-base font-semibold tabular-nums" aria-live="polite">
        {year}
      </p>
      <IconButton label="Próximo ano" disabled={index >= years.length - 1} onClick={() => onChange(years[index + 1])}>
        <ChevronRight size={20} />
      </IconButton>
    </div>
  )
}

function RecapView({ recap, onCopy }: { recap: Recap; onCopy: () => void }) {
  return (
    <>
      <Hero recap={recap} onCopy={onCopy} />
      {recap.trainingDays > 0 && <MonthStrip recap={recap} />}
      {recap.running && <RunningCard running={recap.running} />}
      {recap.walking && (
        <Card title="Caminhada" icon={Mountain} tone="today">
          <Tiles
            items={[
              { label: 'Distância', value: km(recap.walking.km) },
              { label: 'Caminhadas', value: formatNumber(recap.walking.walks, 0) },
              { label: 'Tempo', value: hours(recap.walking.seconds) },
            ]}
          />
        </Card>
      )}
      {recap.strength && <StrengthCard strength={recap.strength} />}
      {recap.steps && (
        <Card title="Passos" icon={Footprints} tone="today">
          <Tiles
            items={[
              { label: 'Total', value: compactCount(recap.steps.total), note: formatNumber(recap.steps.total, 0) },
              { label: 'Média por dia', value: formatNumber(recap.steps.average, 0), note: `em ${formatNumber(recap.steps.days, 0)} dias` },
              { label: 'Melhor dia', value: formatNumber(recap.steps.best.steps, 0), note: day(recap.steps.best.date) },
            ]}
          />
        </Card>
      )}
      {recap.sleep && (
        <Card title="Sono" icon={Moon} tone="sleep">
          <Tiles
            items={[
              { label: 'Média por noite', value: hours(recap.sleep.averageSec), note: `${formatNumber(recap.sleep.nights, 0)} noites` },
              recap.sleep.averageScore !== undefined && { label: 'Nota média', value: formatNumber(recap.sleep.averageScore, 0) },
              recap.sleep.bestMonth && {
                label: 'Melhor mês',
                value: <span className="first-letter:uppercase">{monthName(recap.sleep.bestMonth.month)}</span>,
                note:
                  recap.sleep.bestMonth.averageScore !== undefined
                    ? `nota ${formatNumber(recap.sleep.bestMonth.averageScore, 0)}`
                    : `${hours(recap.sleep.bestMonth.averageSec)} por noite`,
              },
            ]}
          />
        </Card>
      )}
      {recap.body && <BodyCard body={recap.body} />}
      {recap.habits && <HabitsCard habits={recap.habits} />}
      {recap.food && (
        <Card title="Alimentação" icon={Utensils} tone="food">
          <Tiles
            items={[
              { label: 'Dias registrados', value: formatNumber(recap.food.days, 0) },
              recap.food.kcal > 0 && {
                label: 'Calorias por dia',
                value: formatNumber(recap.food.kcal, 0),
                note: recap.food.goalKcal ? `meta atual ${formatNumber(recap.food.goalKcal, 0)} kcal` : 'kcal',
              },
              recap.food.kcal > 0 && {
                label: 'Proteína por dia',
                value: `${formatNumber(recap.food.protein, 0)} g`,
                note: recap.food.goalProtein ? `meta atual ${formatNumber(recap.food.goalProtein, 0)} g` : undefined,
              },
              recap.food.onTarget !== undefined && {
                label: 'Na meta (±10%)',
                value: `${formatNumber(recap.food.onTarget, 0)} de ${formatNumber(recap.food.withGoal, 0)}`,
                note: 'dias, pelas calorias da meta atual',
              },
            ]}
          />
        </Card>
      )}
      {recap.water && (
        <Card title="Água" icon={GlassWater} tone="water">
          <Tiles
            items={[
              { label: 'Total', value: `${formatNumber(recap.water.liters, 0)} L` },
              { label: 'Dias registrados', value: formatNumber(recap.water.days, 0) },
              recap.water.goalDays > 0 && { label: 'Dias na meta', value: formatNumber(recap.water.goalDays, 0) },
            ]}
          />
        </Card>
      )}
      {recap.journal && (
        <Card title="Diário" icon={NotebookPen} tone="journal">
          <Tiles
            items={[
              recap.journal.days > 0 && { label: 'Dias escritos', value: formatNumber(recap.journal.days, 0) },
              recap.journal.mood !== undefined && {
                label: 'Humor médio',
                value: `${levelOf(MOODS, Math.round(recap.journal.mood))?.emoji ?? ''} ${formatNumber(recap.journal.mood, 1)}`,
                note: `de 5, em ${formatNumber(recap.journal.moodDays, 0)} dias`,
              },
            ]}
          />
        </Card>
      )}
      {recap.pains && (
        <Card title="Dores" icon={Bandage} tone="journal">
          <Tiles items={[{ label: 'Episódios', value: formatNumber(recap.pains.episodes, 0), note: recap.pains.names.join(', ') }]} />
        </Card>
      )}
      <Button className="w-full" onClick={onCopy}>
        <ClipboardCopy size={16} /> Copiar resumo
      </Button>
    </>
  )
}

/** The year and its big numbers, on a wash of the section colors. */
function Hero({ recap, onCopy }: { recap: Recap; onCopy: () => void }) {
  return (
    <section
      className="rounded-2xl border border-line p-4"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in oklab, var(--tone-analysis) 16%, var(--surface)), color-mix(in oklab, var(--tone-today) 12%, var(--surface)))',
      }}
    >
      <p className="text-sm text-ink-2">{recap.partial ? `Até ${formatDay(recap.to, "d 'de' MMMM")}` : 'O ano inteiro'}</p>
      <p className="text-4xl leading-tight font-bold tracking-tight tabular-nums">{recap.year}</p>
      {recap.highlights.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {recap.highlights.map((highlight) => (
            <li key={highlight.label} className="min-w-0 rounded-xl bg-surface/85 px-3 py-2.5">
              <p className="truncate text-2xl leading-tight font-bold tabular-nums" style={{ color: toneColor(highlight.tone) }}>
                {highlight.value}
              </p>
              <p className="line-clamp-2 text-xs text-ink-2">{highlight.label}</p>
            </li>
          ))}
        </ul>
      )}
      <Button variant="primary" className="mt-3 w-full" onClick={onCopy}>
        <ClipboardCopy size={16} /> Copiar resumo
      </Button>
    </section>
  )
}

/** Twelve bars: the share of each month's days with a workout. */
function MonthStrip({ recap }: { recap: Recap }) {
  const busiest = recap.months.reduce((best, month) => (month.days > best.days ? month : best))
  return (
    <Card title="Dias de treino por mês" icon={CalendarDays} tone="training">
      <ol className="grid grid-cols-12 items-end gap-1">
        {recap.months.map((month) => (
          <li key={month.month} className="flex min-w-0 flex-col items-center gap-1" aria-label={`${monthName(month.month)}: ${month.future ? 'ainda não chegou' : `${month.days} de ${month.length} dias`}`}>
            <span aria-hidden className="text-[10px] text-ink-2 tabular-nums">
              {month.future ? '' : month.days}
            </span>
            <span
              aria-hidden
              className="flex h-24 w-full items-end overflow-hidden rounded-md"
              style={
                month.future
                  ? { border: '1px dashed var(--line)' }
                  : { background: 'color-mix(in oklab, var(--tone-training) 14%, var(--surface-2))' }
              }
            >
              <span className="block w-full rounded-md" style={{ height: `${(month.days / month.length) * 100}%`, background: toneColor('training') }} />
            </span>
            <span aria-hidden className="text-[10px] text-muted uppercase">
              {monthName(month.month).slice(0, 3)}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-ink-2">
        {formatNumber(recap.trainingDays, 0)} dias com treino
        {recap.trainingSeconds >= 3600 && `, ${hours(recap.trainingSeconds)} no total`}
        {busiest.days > 0 && `. Mais ativo: ${monthName(busiest.month)}, ${busiest.days} dias.`}
      </p>
    </Card>
  )
}

function RunningCard({ running }: { running: NonNullable<Recap['running']> }) {
  const records = running.bests.filter((best) => best.record).length
  return (
    <Card title="Corrida" icon={Route} tone="today">
      <Tiles
        items={[
          { label: 'Distância', value: km(running.km) },
          { label: 'Corridas', value: formatNumber(running.runs, 0) },
          { label: 'Tempo', value: hours(running.seconds) },
          running.longest && { label: 'Mais longa', value: km(running.longest.km), note: day(running.longest.date) },
          running.fastest && {
            label: 'Ritmo mais rápido',
            value: `${formatPace(running.fastest.secondsPerKm)}/km`,
            note: `${km(running.fastest.km)} · ${day(running.fastest.date)}`,
          },
          records > 0 && { label: 'Recordes pessoais', value: formatNumber(records, 0), note: 'batidos no ano' },
        ]}
      />
      {running.bests.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-xs font-semibold text-ink-2">Melhores tempos do ano</h3>
          <ul className="divide-y divide-line">
            {running.bests.map((best) => (
              <li key={best.label}>
                <Link to={activityLink(best.activityId)} className="flex items-center gap-3 py-1.5 text-sm hover:text-accent-ink">
                  <span className="w-24 shrink-0 text-ink-2">{best.label}</span>
                  <span className="flex-1 font-semibold tabular-nums">{formatClock(best.seconds)}</span>
                  {best.record && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: toneColor('analysis') }}>
                      <Trophy size={14} aria-hidden /> recorde
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted tabular-nums">{day(best.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {running.races.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-xs font-semibold text-ink-2">Provas</h3>
          <ul className="divide-y divide-line">
            {running.races.map((race) => (
              <li key={race.activityId}>
                <Link to={activityLink(race.activityId)} className="block py-1.5 hover:text-accent-ink">
                  <span className="block truncate text-sm font-medium">{race.title}</span>
                  <span className="block text-xs text-muted tabular-nums">
                    {day(race.date)} · {km(race.km)} em {formatClock(race.seconds)}
                    {race.km >= 1 && ` · ${formatPace(race.seconds / race.km)}/km`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function StrengthCard({ strength }: { strength: NonNullable<Recap['strength']> }) {
  return (
    <Card title="Musculação" icon={Dumbbell} tone="training">
      <Tiles
        items={[
          { label: 'Treinos', value: formatNumber(strength.sessions, 0) },
          { label: 'Séries', value: formatNumber(strength.sets, 0) },
          { label: 'Volume', value: tonnes(strength.volumeKg), note: 'carga × repetições' },
          strength.seconds > 0 && { label: 'Tempo', value: hours(strength.seconds) },
          strength.topMuscle && { label: 'Mais treinado', value: strength.topMuscle.label, note: `${formatNumber(strength.topMuscle.sets, 0)} séries` },
        ]}
      />
      {strength.gains.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-xs font-semibold text-ink-2">Maiores ganhos de força (1RM estimado)</h3>
          <ul className="divide-y divide-line">
            {strength.gains.map((gain) => (
              <li key={gain.exerciseId} className="flex items-baseline gap-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{gain.name}</span>
                <span className="shrink-0 text-ink-2 tabular-nums">
                  {formatNumber(gain.fromKg, 0)} → {formatNumber(gain.toKg, 0)} kg
                </span>
                <span className="shrink-0 font-semibold tabular-nums" style={{ color: toneColor('training') }}>
                  {formatSigned(gain.toKg - gain.fromKg, 0)} kg
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function BodyCard({ body }: { body: NonNullable<Recap['body']> }) {
  const changed = body.weighIns >= 2
  return (
    <Card title="Corpo" icon={Scale} tone="body">
      <Tiles
        items={[
          changed
            ? { label: 'Peso (tendência)', value: `${formatSigned(body.end.kg - body.start.kg, 1)} kg`, note: `${kg(body.start.kg)} → ${kg(body.end.kg)}` }
            : { label: 'Peso', value: kg(body.end.kg), note: day(body.end.date) },
          changed && { label: 'Menor peso', value: kg(body.lowest.kg), note: day(body.lowest.date) },
          body.fat && {
            label: 'Gordura',
            value: `${formatSigned(body.fat.end - body.fat.start, 1)} p.p.`,
            note: `${formatNumber(body.fat.start, 1)}% → ${formatNumber(body.fat.end, 1)}%`,
          },
          { label: 'Pesagens', value: formatNumber(body.weighIns, 0) },
        ]}
      />
      {body.measurements.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-xs font-semibold text-ink-2">Medidas (primeira e última do ano)</h3>
          <ul className="divide-y divide-line">
            {body.measurements.map((site) => (
              <li key={site.key} className="flex items-baseline gap-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{site.label}</span>
                <span className="shrink-0 text-ink-2 tabular-nums">
                  {formatNumber(site.startCm, 1)} → {formatNumber(site.endCm, 1)} cm
                </span>
                <span className="w-14 shrink-0 text-right font-semibold tabular-nums">{formatSigned(site.endCm - site.startCm, 1)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function HabitsCard({ habits }: { habits: NonNullable<Recap['habits']> }) {
  return (
    <Card title="Hábitos" icon={ListChecks} tone="habits">
      <Tiles
        items={[
          { label: 'Cumpridos', value: `${formatNumber(habits.rate * 100, 0)}%`, note: 'média dos hábitos, sem os dias pulados' },
        ]}
      />
      <ul className="mt-3 divide-y divide-line">
        {habits.list.map((habit) => (
          <li key={habit.id} className="flex items-baseline gap-3 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{habit.name}</span>
            <span className="shrink-0 text-xs text-muted tabular-nums">
              {habit.best > 0 ? `melhor sequência: ${habit.best} ${habit.best === 1 ? habit.unit.slice(0, -1) : habit.unit}` : 'sem sequência'}
            </span>
            <span className="w-11 shrink-0 text-right font-semibold tabular-nums">{formatNumber(habit.rate * 100, 0)}%</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

type Tile = { label: string; value: ReactNode; note?: ReactNode }

/** The section's numbers, two or three to a row. */
function Tiles({ items }: { items: (Tile | false | undefined | null)[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items
        .filter((item): item is Tile => Boolean(item))
        .map((item) => (
          <li key={item.label} className="min-w-0 rounded-xl bg-surface-2 px-3 py-2">
            <p className="truncate text-xs text-ink-2">{item.label}</p>
            <p className="truncate text-lg leading-tight font-semibold tabular-nums">{item.value}</p>
            {item.note && <p className="truncate text-xs text-muted">{item.note}</p>}
          </li>
        ))}
    </ul>
  )
}
