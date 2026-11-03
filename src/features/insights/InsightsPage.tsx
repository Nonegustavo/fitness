import { ArrowDown } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { LineOverTime } from '../../components/TimeCharts'
import { Card, Empty, Field, Page, Segmented, Select } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { shiftDay } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import {
  analyze,
  describe,
  highlights,
  lowerFirst,
  MIN_GROUP,
  MIN_POINTS,
  pairPoints,
  strengthLabel,
  timingNote,
  type Finding,
} from './analysis'
import { GroupsChart, TrendChart } from './ExploreChart'
import { availableMetrics, formatMetric, hourAxis, type DailyData, type Metric, type MetricGroup } from './metrics'
import { useDailyData } from './useDailyData'

type Period = '90' | '180' | '365' | 'all'

const PERIODS: { value: Period; label: string }[] = [
  { value: '90', label: '90 dias' },
  { value: '180', label: '6 meses' },
  { value: '365', label: '1 ano' },
  { value: 'all', label: 'Tudo' },
]

const GROUP_ORDER: MetricGroup[] = ['Sono', 'Recuperação', 'Dia', 'Treino', 'Alimentação', 'Hábitos', 'Corpo']

/** Pairs to open the explorer with when there are no highlights yet, first available wins. */
const STARTERS: [string, string][] = [
  ['activityMinutes', 'hrv'],
  ['bedtime', 'sleepScore'],
  ['sleepHours', 'steps'],
  ['steps', 'sleepHours'],
]

export default function InsightsPage() {
  const today = useToday()
  const [period, setPeriod] = useState<Period>('all')
  const from = period === 'all' ? undefined : shiftDay(today, -(Number(period) - 1))
  const data = useDailyData(from, today)
  const found = useMemo(() => (data ? highlights(data) : undefined), [data])
  const [pick, setPick] = useState<{ x: string; y: string }>()
  const explorer = useRef<HTMLDivElement>(null)

  if (!data || !found) return null
  const metrics = availableMetrics(data)
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]))
  const start =
    pick ??
    (found[0] ? { x: found[0].x.key, y: found[0].y.key } : undefined) ??
    STARTERS.map(([x, y]) => ({ x, y })).find((pair) => byKey.has(pair.x) && byKey.has(pair.y))
  const x = start && byKey.get(start.x)
  const y = start && byKey.get(start.y)

  function explore(finding: Finding) {
    setPick({ x: finding.x.key, y: finding.y.key })
    explorer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <Page title="Correlações" subtitle="Como hábitos, treino e alimentação andam junto com seu sono, recuperação e peso">
      <Segmented label="Período" value={period} options={PERIODS} onChange={setPeriod} />

      <Card title="Destaques">
        {found.length === 0 ? (
          <NoHighlights data={data} />
        ) : (
          <ul className="divide-y divide-line">
            {found.map((finding) => (
              <li key={`${finding.x.key}-${finding.y.key}`} className="py-3">
                <p className="text-sm">{describe(finding)}</p>
                <p className="mt-1 text-xs text-muted">
                  Relação {strengthLabel(finding)} · {finding.n} dias ·{' '}
                  <button
                    type="button"
                    onClick={() => explore(finding)}
                    className="inline-flex items-center gap-0.5 font-medium text-accent-ink"
                  >
                    ver no gráfico <ArrowDown size={12} aria-hidden />
                  </button>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div ref={explorer} className="scroll-mt-4">
        <Card title="Explorar">
          {!x || !y ? (
            <Empty>Ainda não há dados suficientes para cruzar.</Empty>
          ) : (
            <Explorer data={data} metrics={metrics} x={x} y={y} onPick={setPick} />
          )}
        </Card>
      </div>

      <Card title="Como ler">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>
            O que acontece num dia é comparado com a noite seguinte: o sono conta para a manhã em que termina, como o
            Garmin faz.
          </li>
          <li>
            Os destaques passam por um filtro contra o acaso: mesmo testando dezenas de pares de uma vez, no máximo 1 em
            cada 10 seria coincidência.
          </li>
          <li>
            Andar junto não prova causa. Um dia de treino pesado e uma noite pior podem ter uma terceira causa, como o
            calor ou o estresse.
          </li>
          <li>
            Embaixo do gráfico: ρ vai de −1 a 1 e mede o quanto as duas medidas sobem e descem juntas; d mede a distância
            entre as médias dos dois grupos, em desvios-padrão; p é a chance de ver uma relação dessas só por acaso.
          </li>
        </ul>
      </Card>
    </Page>
  )
}

function MetricSelect({
  label,
  value,
  metrics,
  onChange,
}: {
  label: string
  value: string
  metrics: Metric[]
  onChange: (key: string) => void
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {GROUP_ORDER.map((group) => {
          const options = metrics.filter((metric) => metric.group === group)
          return options.length === 0 ? null : (
            <optgroup key={group} label={group}>
              {options.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.label}
                </option>
              ))}
            </optgroup>
          )
        })}
      </Select>
    </Field>
  )
}

function Explorer({
  data,
  metrics,
  x,
  y,
  onPick,
}: {
  data: DailyData
  metrics: Metric[]
  x: Metric
  y: Metric
  onPick: (pick: { x: string; y: string }) => void
}) {
  const points = useMemo(() => pairPoints(data, x, y), [data, x, y])
  const finding = useMemo(() => analyze(data, x, y), [data, x, y])
  const series = (metric: Metric) =>
    [...data.rows].flatMap(([date, row]) => (row[metric.key] === undefined ? [] : [{ date, value: row[metric.key] }])).sort((a, b) => a.date.localeCompare(b.date))
  const needed = x.binary ? `${MIN_GROUP} dias com e ${MIN_GROUP} sem` : `${MIN_POINTS} dias`
  // A done / not done line is just spikes; the groups chart already shows it.
  const overTime = [x, y].filter((metric) => !metric.binary)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricSelect label="Comparar" value={x.key} metrics={metrics} onChange={(key) => onPick({ x: key, y: y.key })} />
        <MetricSelect label="Com" value={y.key} metrics={metrics} onChange={(key) => onPick({ x: x.key, y: key })} />
      </div>
      <p className="text-xs text-muted">
        {x.key === y.key
          ? 'Escolha duas medidas diferentes.'
          : `Cada ponto é um dia: ${lowerFirst(x.label)} e ${lowerFirst(y.label)} ${timingNote(x, y)}.`}
      </p>

      {x.key !== y.key && points.length > 0 && (
        x.binary ? <GroupsChart x={x} y={y} points={points} /> : <TrendChart x={x} y={y} points={points} />
      )}

      {x.key !== y.key && (
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          {finding ? (
            <>
              <p>{describe(finding)}</p>
              <p className="mt-1 text-xs text-ink-2">
                Relação {strengthLabel(finding)} ·{' '}
                {finding.kind === 'trend' ? `ρ ${formatNumber(finding.rho, 2)}` : `d ${formatNumber(finding.strength, 2)}`} ·
                {finding.p < 0.01 ? ' p < 0,01' : ` p = ${formatNumber(finding.p, 2)}`} · {finding.n} dias
                {finding.p >= 0.05 && ' · pode ser acaso'}
              </p>
            </>
          ) : (
            <p className="text-ink-2">
              Poucos dias com as duas medidas ({points.length}). Para comparar, são precisos pelo menos {needed}.
            </p>
          )}
        </div>
      )}

      {x.key !== y.key && overTime.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm font-medium">Ao longo do tempo</p>
          {overTime.map((metric) => {
            const points = series(metric)
            return (
              <div key={metric.key}>
                <p className="mb-1 text-xs text-ink-2">{metric.label}</p>
                <LineOverTime
                  points={points}
                  unit={metric.unit}
                  label={metric.label}
                  digits={metric.digits}
                  format={(value) => formatMetric(metric, value)}
                  axis={hourAxis(metric, points.map((point) => point.value))}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Why there's nothing yet, and what would bring the first highlights. */
function NoHighlights({ data }: { data: DailyData }) {
  const count = (key: string) => [...data.rows.values()].filter((row) => row[key] !== undefined).length
  const habitDays = Math.max(0, ...data.metrics.filter((m) => m.group === 'Hábitos').map((m) => count(m.key)))
  const tips: ReactNode[] = []
  if (habitDays < 21) {
    tips.push(
      <>
        Marque seus <Link to="/habitos" className="font-medium text-accent-ink">hábitos</Link> todos os dias, inclusive os
        que não fez: com umas 3 semanas, dá para ver o efeito deles no sono.
      </>,
    )
  }
  const hrvDays = count('hrv')
  const garmin = (
    <Link to="/ajustes" className="font-medium text-accent-ink">
      Ajustes → Garmin
    </Link>
  )
  if (hrvDays === 0) {
    tips.push(<>Conecte o Garmin em {garmin} para cruzar a HRV, a FC de repouso e os treinos.</>)
  } else if (hrvDays < 60) {
    tips.push(
      <>
        Traga mais meses do Garmin em {garmin}: a HRV, a FC de repouso e os treinos cobrem só {hrvDays}{' '}
        {hrvDays === 1 ? 'dia' : 'dias'} por enquanto.
      </>,
    )
  }
  if (count('kcal') < 21) tips.push('Registre a alimentação por algumas semanas para cruzar calorias com o peso e o sono.')
  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-2">
        Ainda não apareceu nenhuma relação clara. Um destaque só aparece quando a diferença se repete o bastante para não
        ser acaso.
      </p>
      {tips.length > 0 && (
        <ul className="list-disc space-y-1.5 pl-5 text-ink-2">
          {tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
