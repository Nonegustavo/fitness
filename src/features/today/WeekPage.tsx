import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Card, IconButton, Page, Segmented, SkeletonCard } from '../../components/ui'
import { useToday } from '../../db/hooks'
import type { DayKey } from '../../lib/dates'
import { SummaryRows, useSummaryRows } from './WeeklyCard'
import { beforeLabel, stepSummary, summaryPeriod, summaryTitle, type SummaryGrain, type SummaryPeriod } from './weekly'

const TABS: { value: SummaryGrain; label: string }[] = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
]

/**
 * A week or a month next to the one before. With nothing in the address it opens on the last complete
 * week, where the Sunday summary notification and the Hoje card lead; `?periodo=mes&inicio=…` keep the
 * tab and the period through a reload and going back.
 */
export default function WeekPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const grain: SummaryGrain = params.get('periodo') === 'mes' ? 'month' : 'week'
  const period = summaryPeriod(grain, params.get('inicio') ?? undefined, today)

  // The other tab opens on its period holding the first day shown (the week's month, the month's first week).
  const show = (next: SummaryGrain, start: DayKey) =>
    setParams(next === 'month' ? { periodo: 'mes', inicio: start } : { inicio: start }, { replace: true })

  return (
    <Page
      title="Resumo"
      icon={CalendarRange}
      tone="insights"
      subtitle={grain === 'week' ? 'Cada semana, de domingo a sábado, ao lado da anterior' : 'Cada mês ao lado do anterior'}
    >
      <div className="flex justify-center">
        <Segmented
          label="Período do resumo"
          value={grain}
          options={TABS}
          onChange={(next) => show(next, summaryPeriod(next, period.from, today).from)}
        />
      </div>
      <PeriodNav period={period} today={today} onStep={(steps) => show(grain, stepSummary(period, steps))} />
      <Summary key={`${period.grain}:${period.from}:${period.to}`} period={period} />
      <Link
        to={`/calendario?dia=${period.from}`}
        className="mx-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-accent-ink"
      >
        <CalendarDays size={16} /> Ver os dias no calendário
      </Link>
    </Page>
  )
}

function PeriodNav({ period, today, onStep }: { period: SummaryPeriod; today: DayKey; onStep: (steps: number) => void }) {
  const noun = period.grain === 'week' ? 'Semana' : 'Mês'
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-1">
      <IconButton label={`${noun} anterior`} onClick={() => onStep(-1)}>
        <ChevronLeft size={20} />
      </IconButton>
      <div className="min-w-0 text-center" aria-live="polite">
        <p className="truncate text-base font-semibold tabular-nums">
          {summaryTitle(period, today)}
          {period.partial && <span className="font-normal text-ink-2">, até hoje</span>}
        </p>
        <p className="truncate text-xs text-muted">{beforeLabel(period)}</p>
      </div>
      <IconButton label={period.grain === 'week' ? 'Próxima semana' : 'Próximo mês'} disabled={!period.canForward} onClick={() => onStep(1)}>
        <ChevronRight size={20} />
      </IconButton>
    </div>
  )
}

function Summary({ period }: { period: SummaryPeriod }) {
  const rows = useSummaryRows(period)
  if (!rows) return <SkeletonCard lines={4} />
  return (
    <Card>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{period.grain === 'week' ? 'Sem registros nesta semana.' : 'Sem registros neste mês.'}</p>
      ) : (
        <SummaryRows rows={rows} grain={period.grain} />
      )}
    </Card>
  )
}
