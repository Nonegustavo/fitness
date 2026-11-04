import { ChevronRight, Plus, Scale } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { SwipeToDelete, useRemoveWithUndo } from '../../components/SwipeToDelete'
import { Button, Card, Empty, Page, Segmented, Select, SkeletonCard, Stat } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { db } from '../../db/schema'
import type { MeasurementEntry, WeightEntry } from '../../db/types'
import { formatDay, formatTime, relativeDay, shiftDay } from '../../lib/dates'
import { formatFixed, formatNumber, formatSigned } from '../../lib/format'
import { changeOver } from '../../lib/stats'
import { metricSeries, useMeasurements, useWeights, type MetricSeries } from './body'
import { MeasurementModal } from './MeasurementModal'
import { LineOverTime, TrendChart } from '../../components/TimeCharts'
import { describeExtras, WeightModal } from './WeightModal'
import { WeightGoalCard } from './WeightGoalCard'
import { ProgressPhotos } from './ProgressPhotos'

type Tab = 'peso' | 'medidas' | 'fotos'
type Range = '30' | '90' | '365' | 'all'

const RANGES: { value: Range; label: string }[] = [
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
  { value: '365', label: '1 ano' },
  { value: 'all', label: 'Tudo' },
]

const LIST_LIMIT = 15

export default function BodyPage() {
  const [params, setParams] = useSearchParams()
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>(() => {
    const aba = params.get('aba')
    return aba === 'medidas' || aba === 'fotos' ? aba : 'peso'
  })
  const [weightEditing, setWeightEditing] = useState<WeightEntry | 'new' | null>(
    params.get('novo') === 'peso' ? 'new' : null,
  )
  const [measurementEditing, setMeasurementEditing] = useState<MeasurementEntry | 'new' | null>(null)

  // The "Registrar peso" shortcut opens the form once; drop the flag so it doesn't reopen.
  useEffect(() => {
    if (params.has('novo')) setParams({}, { replace: true })
  }, [params, setParams])

  return (
    <Page
      title="Corpo"
      icon={Scale}
      tone="body"
      actions={
        tab === 'fotos' ? undefined : tab === 'peso' ? (
          <Button size="sm" variant="primary" onClick={() => setWeightEditing('new')}>
            <Plus size={16} /> Pesagem
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => setMeasurementEditing('new')}>
            <Plus size={16} /> Medição
          </Button>
        )
      }
    >
      <Segmented
        label="Seção"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'peso', label: 'Peso e gordura' },
          { value: 'medidas', label: 'Medidas' },
          { value: 'fotos', label: 'Fotos' },
        ]}
      />

      {tab === 'peso' && <WeightSection onEdit={setWeightEditing} />}
      {tab === 'medidas' && <MeasurementsSection onEdit={setMeasurementEditing} />}
      {tab === 'fotos' && <ProgressPhotos />}

      {weightEditing && (
        <WeightModal entry={weightEditing === 'new' ? null : weightEditing} onClose={() => setWeightEditing(null)} />
      )}
      {measurementEditing && (
        <MeasurementModal
          entry={measurementEditing === 'new' ? null : measurementEditing}
          sites={settings.measurementSites}
          onClose={() => setMeasurementEditing(null)}
        />
      )}
    </Page>
  )
}

function WeightSection({ onEdit }: { onEdit: (entry: WeightEntry | 'new') => void }) {
  const today = useToday()
  const settings = useSettings()
  const weights = useWeights()
  const removeWithUndo = useRemoveWithUndo()
  const [range, setRange] = useState<Range>('90')
  const [showAll, setShowAll] = useState(false)

  const weight = useMemo(() => metricSeries(weights ?? [], (entry) => entry.weightKg), [weights])
  const fat = useMemo(() => metricSeries(weights ?? [], (entry) => entry.bodyFatPct), [weights])
  // The trend is computed over the whole history, then cut to the range, so it is right at the window's start.
  const from = range === 'all' ? '' : shiftDay(today, -Number(range))
  const weightInRange = useMemo(() => sliceSeries(weight, from), [weight, from])
  const fatInRange = useMemo(() => sliceSeries(fat, from), [fat, from])

  if (!weights) return <SkeletonCard lines={4} />
  if (weights.length === 0) {
    return (
      <Card>
        <Empty>Nenhuma pesagem ainda.</Empty>
        <Button variant="primary" className="w-full" onClick={() => onEdit('new')}>
          Registrar a primeira
        </Button>
      </Card>
    )
  }

  const latest = weights[weights.length - 1]
  const trendNow = weight.trend.at(-1)
  const change7 = changeOver(weight.trend, 7)
  const change30 = changeOver(weight.trend, 30)
  const latestFat = fat.readings.at(-1)
  const fatTrend = fat.trend.at(-1)
  const listed = [...weights].reverse().slice(0, showAll ? undefined : LIST_LIMIT)

  return (
    <>
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Último peso"
            value={`${formatFixed(latest.weightKg)} kg`}
            note={`${relativeDay(latest.date, today)}, ${formatTime(latest.time)}`}
          />
          <Stat label="Tendência" value={trendNow ? `${formatFixed(trendNow.value)} kg` : '—'} note="média suavizada" />
          <Stat label="Em 7 dias" value={change7 === undefined ? '—' : `${formatSigned(change7)} kg`} note="pela tendência" />
          <Stat label="Em 30 dias" value={change30 === undefined ? '—' : `${formatSigned(change30)} kg`} note="pela tendência" />
          {latestFat && (
            <Stat
              label="Gordura"
              value={`${formatFixed(latestFat.value)}%`}
              note={fatTrend && `tendência ${formatFixed(fatTrend.value)}%`}
            />
          )}
        </div>
      </Card>

      <WeightGoalCard trend={weight.trend} today={today} />

      <Segmented label="Período dos gráficos" value={range} onChange={setRange} options={RANGES} />

      <Card title="Peso (kg)">
        <TrendChart
          {...weightInRange}
          unit="kg"
          digits={1}
          label="Peso de cada dia e tendência"
          goal={settings.weightGoal?.targetKg}
        />
      </Card>

      {fat.readings.length > 0 && (
        <Card title="Gordura corporal (%)">
          <TrendChart {...fatInRange} unit="%" digits={1} label="Gordura corporal de cada dia e tendência" />
        </Card>
      )}

      <Card title="Pesagens">
        <ul className="divide-y divide-line">
          {listed.map((entry) => {
            const extras = describeExtras(entry)
            return (
              <SwipeToDelete
                key={entry.id}
                onDelete={() => removeWithUndo(db.weights, entry.id, `Pesagem de ${formatFixed(entry.weightKg)} kg apagada`)}
              >
                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  className="flex w-full items-center gap-3 py-1.5 text-left hover:text-accent-ink"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      <span className="font-medium">{formatFixed(entry.weightKg)} kg</span>
                      {entry.bodyFatPct !== undefined && (
                        <span className="text-ink-2"> · {formatFixed(entry.bodyFatPct)}% gordura</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {formatDay(entry.date, "EEE, d 'de' MMM 'de' yyyy")}, {formatTime(entry.time)}
                      {extras && ` · ${extras}`}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </button>
              </SwipeToDelete>
            )
          })}
        </ul>
        {!showAll && weights.length > LIST_LIMIT && (
          <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setShowAll(true)}>
            Mostrar todas ({weights.length})
          </Button>
        )}
      </Card>
    </>
  )
}

function sliceSeries(series: MetricSeries, from: string): MetricSeries {
  return {
    readings: series.readings.filter((point) => point.date >= from),
    trend: series.trend.filter((point) => point.date >= from),
  }
}

function MeasurementsSection({ onEdit }: { onEdit: (entry: MeasurementEntry | 'new') => void }) {
  const { measurementSites: sites } = useSettings()
  const measurements = useMeasurements()
  const removeWithUndo = useRemoveWithUndo()
  const [siteKey, setSiteKey] = useState<string>()

  // Latest value of each site and its change since the previous time that site was measured.
  const rows = useMemo(
    () =>
      sites.flatMap((site) => {
        const history = (measurements ?? []).filter((m) => m.values[site.key] !== undefined)
        const last = history.at(-1)
        if (!last) return []
        const previous = history.at(-2)
        const value = last.values[site.key]
        return [{ site, date: last.date, value, change: previous ? value - previous.values[site.key] : undefined }]
      }),
    [sites, measurements],
  )
  const selected =
    rows.find((row) => row.site.key === siteKey)?.site ?? rows.find((row) => row.site.key === 'waist')?.site ?? rows[0]?.site
  const points = useMemo(
    () =>
      selected
        ? (measurements ?? [])
            .filter((m) => m.values[selected.key] !== undefined)
            .map((m) => ({ date: m.date, value: m.values[selected.key] }))
        : [],
    [measurements, selected],
  )

  if (!measurements) return <SkeletonCard lines={4} />
  if (measurements.length === 0) {
    return (
      <Card>
        <Empty>Nenhuma medição ainda.</Empty>
        <Button variant="primary" className="w-full" onClick={() => onEdit('new')}>
          Registrar medidas
        </Button>
      </Card>
    )
  }

  return (
    <>
      <Card title="Medidas atuais (cm)">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-1 font-normal">Local</th>
              <th className="pb-1 text-right font-normal">Medida</th>
              <th className="pb-1 text-right font-normal">Variação</th>
              <th className="pb-1 text-right font-normal">Data</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.site.key} className="border-t border-line">
                <td className="py-1.5">{row.site.label}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{formatFixed(row.value)}</td>
                <td className="py-1.5 text-right text-ink-2 tabular-nums">
                  {row.change === undefined ? '—' : formatSigned(row.change)}
                </td>
                <td className="py-1.5 text-right text-xs text-muted tabular-nums">{formatDay(row.date, 'd/M/yy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {selected && (
        <Card
          title="Evolução"
          action={
            <Select
              aria-label="Local da medida"
              value={selected.key}
              onChange={(e) => setSiteKey(e.target.value)}
              className="h-9 w-auto text-sm"
            >
              {rows.map(({ site }) => (
                <option key={site.key} value={site.key}>
                  {site.label}
                </option>
              ))}
            </Select>
          }
        >
          <LineOverTime points={points} unit="cm" label={selected.label} />
        </Card>
      )}

      <Card title="Histórico">
        <ul className="divide-y divide-line">
          {[...measurements].reverse().map((entry) => (
            <SwipeToDelete
              key={entry.id}
              onDelete={() =>
                removeWithUndo(db.measurements, entry.id, `Medição de ${formatDay(entry.date, "d 'de' MMM")} apagada`)
              }
            >
              <button
                type="button"
                onClick={() => onEdit(entry)}
                className="flex w-full items-center gap-3 py-1.5 text-left hover:text-accent-ink"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{formatDay(entry.date, "d 'de' MMMM 'de' yyyy")}</span>
                  <span className="block truncate text-xs text-muted">
                    {sites
                      .filter((site) => entry.values[site.key] !== undefined)
                      .map((site) => `${site.label} ${formatNumber(entry.values[site.key])}`)
                      .join(' · ')}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted" />
              </button>
            </SwipeToDelete>
          ))}
        </ul>
      </Card>
    </>
  )
}
