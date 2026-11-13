import { ChevronRight, Plus, Scale } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PageTabs } from '../../components/PageTabs'
import { Button, Card, COLUMNS, Empty, Page, Select, SkeletonCard, Stack, Stat } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import type { MeasurementEntry, WeightEntry } from '../../db/types'
import { formatDay, formatTime, relativeDay } from '../../lib/dates'
import { formatFixed, formatNumber, formatSigned } from '../../lib/format'
import { changeOver } from '../../lib/stats'
import { metricSeries, useMeasurements, useWeights } from './body'
import { MeasurementModal } from './MeasurementModal'
import { PeriodControl, usePeriod } from '../../components/PeriodControl'
import { PeriodLine } from '../../components/TimeCharts'
import { describeExtras, WeightModal } from './WeightModal'
import { WeightGoalCard } from './WeightGoalCard'
import { ProgressPhotos } from './ProgressPhotos'
import { CompositionCard } from './CompositionCard'

type Tab = 'peso' | 'medidas' | 'fotos'

const TABS: { value: Tab; label: string }[] = [
  { value: 'peso', label: 'Peso e gordura' },
  { value: 'medidas', label: 'Medidas' },
  { value: 'fotos', label: 'Fotos' },
]

/** The tab each shortcut (`?novo=`) opens its form on. */
const TAB_OF_NEW: Record<string, Tab> = { peso: 'peso', medida: 'medidas', foto: 'fotos' }

const isTab = (value: string | null): value is Tab => TABS.some((tab) => tab.value === value)

const WEIGH_INS = ['pesagem', 'pesagens'] as const
const MEASURES = ['medição', 'medições'] as const

const LIST_LIMIT = 15

/** A single column in a tab's two (the photos, a first-time card), centered at the width of the phone layout's page. */
const ACROSS = 'xl:col-span-2 xl:mx-auto xl:w-full xl:max-w-3xl'

/** A tab loading, in the shape it will have: the summary and charts, and on a wide screen the list beside them. */
function SectionSkeleton() {
  return (
    <>
      <Stack>
        <SkeletonCard lines={4} />
      </Stack>
      <Stack className="max-xl:hidden">
        <SkeletonCard lines={8} />
      </Stack>
    </>
  )
}

export default function BodyPage() {
  const [params, setParams] = useSearchParams()
  const settings = useSettings()
  // The tab lives in the address (?aba=), so going back returns to it and the "+" knows it.
  const aba = params.get('aba')
  const tab: Tab = isTab(aba) ? aba : (TAB_OF_NEW[params.get('novo') ?? ''] ?? 'peso')
  const setTab = (next: Tab) =>
    setParams(
      (current) => {
        const changed = new URLSearchParams(current)
        changed.set('aba', next)
        return changed
      },
      { replace: true },
    )
  const [weightEditing, setWeightEditing] = useState<WeightEntry | 'new' | null>(
    params.get('novo') === 'peso' ? 'new' : null,
  )
  const [measurementEditing, setMeasurementEditing] = useState<MeasurementEntry | 'new' | null>(
    params.get('novo') === 'medida' ? 'new' : null,
  )
  // Bumped by `?novo=foto`: the photos tab opens the picker, then sets it back.
  const [photoAsked, setPhotoAsked] = useState(0)

  // The shortcuts (`?novo=peso`, `?novo=medida`, `?novo=foto`: the "+", the reminders) open the form
  // once, on its tab, also when Corpo is already open; then the flag goes, so it doesn't reopen.
  useEffect(() => {
    const novo = params.get('novo')
    if (!novo) return
    if (novo === 'peso') setWeightEditing('new')
    if (novo === 'medida') setMeasurementEditing('new')
    if (novo === 'foto') setPhotoAsked((count) => count + 1)
    setParams(
      (current) => {
        const changed = new URLSearchParams(current)
        changed.delete('novo')
        if (TAB_OF_NEW[novo]) changed.set('aba', TAB_OF_NEW[novo])
        return changed
      },
      { replace: true },
    )
  }, [params, setParams])

  return (
    <Page
      title="Corpo"
      icon={Scale}
      tone="body"
      wide
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
      {/* Each tab is two columns on a wide screen: its summary and charts, then its list. */}
      <PageTabs label="Seção" value={tab} options={TABS} onChange={setTab} className={COLUMNS}>
        {(shown) =>
          shown === 'peso' ? (
            <WeightSection onEdit={setWeightEditing} />
          ) : shown === 'medidas' ? (
            <MeasurementsSection onEdit={setMeasurementEditing} />
          ) : (
            // The photos have no list to put beside them: one column across both, as wide as before.
            <Stack className={ACROSS}>
              <ProgressPhotos asked={photoAsked} onAsked={() => setPhotoAsked(0)} />
            </Stack>
          )
        }
      </PageTabs>

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
  const [showAll, setShowAll] = useState(false)
  const period = usePeriod('corpo', { earliest: weights?.[0]?.date })

  // The trend is computed over the whole history and the charts cut it to the period, so it is right at its start.
  const weight = useMemo(() => metricSeries(weights ?? [], (entry) => entry.weightKg), [weights])
  const fat = useMemo(() => metricSeries(weights ?? [], (entry) => entry.bodyFatPct), [weights])

  if (!weights) return <SectionSkeleton />
  if (weights.length === 0) {
    return (
      <Stack className={ACROSS}>
        <Card>
          <Empty>Nenhuma pesagem ainda.</Empty>
          <Button variant="primary" className="w-full" onClick={() => onEdit('new')}>
            Registrar a primeira
          </Button>
        </Card>
      </Stack>
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
      <Stack>
        <Card>
          {/* Four across when the card itself is wide enough, not the window: on a computer it is one of two columns. */}
          <div className="@container">
            <div className="grid grid-cols-2 gap-4 @md:grid-cols-4">
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
          </div>
        </Card>

        <WeightGoalCard trend={weight.trend} today={today} />

        <CompositionCard weights={weights} today={today} />

        <PeriodControl period={period} className="" />

        <Card title="Peso (kg)">
          <PeriodLine
            periods={period.window}
            values={weight.readings}
            trend={weight.trend}
            how="mean"
            unit="kg"
            digits={1}
            label="Peso"
            noun={WEIGH_INS}
            goal={settings.weightGoal?.targetKg}
            height={220}
          />
        </Card>

        {fat.readings.length > 0 && (
          <Card title="Gordura corporal (%)">
            <PeriodLine
              periods={period.window}
              values={fat.readings}
              trend={fat.trend}
              how="mean"
              unit="%"
              digits={1}
              label="Gordura corporal"
              noun={WEIGH_INS}
              height={220}
            />
          </Card>
        )}
      </Stack>

      <Stack>
        <Card title="Pesagens">
          {/* No swipe to delete here: a sideways drag changes the tab. "Excluir" is in the weigh-in's sheet. */}
          <ul className="divide-y divide-line">
            {listed.map((entry) => {
              const extras = describeExtras(entry)
              return (
                <li key={entry.id}>
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
                </li>
              )
            })}
          </ul>
          {!showAll && weights.length > LIST_LIMIT && (
            <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setShowAll(true)}>
              Mostrar todas ({weights.length})
            </Button>
          )}
        </Card>
      </Stack>
    </>
  )
}

function MeasurementsSection({ onEdit }: { onEdit: (entry: MeasurementEntry | 'new') => void }) {
  const { measurementSites: sites } = useSettings()
  const measurements = useMeasurements()
  const [siteKey, setSiteKey] = useState<string>()
  // Measurements come weeks apart: month by month shows them best at first.
  const period = usePeriod('medidas', { grain: 'month', earliest: measurements?.[0]?.date })

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

  if (!measurements) return <SectionSkeleton />
  if (measurements.length === 0) {
    return (
      <Stack className={ACROSS}>
        <Card>
          <Empty>Nenhuma medição ainda.</Empty>
          <Button variant="primary" className="w-full" onClick={() => onEdit('new')}>
            Registrar medidas
          </Button>
        </Card>
      </Stack>
    )
  }

  return (
    <>
      <Stack>
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
            <PeriodControl period={period} />
            <PeriodLine periods={period.window} values={points} how="mean" unit="cm" digits={1} label={selected.label} noun={MEASURES} />
          </Card>
        )}
      </Stack>

      <Stack>
        <Card title="Histórico">
          {/* No swipe to delete here either: "Excluir" is in the measurement's sheet. */}
          <ul className="divide-y divide-line">
            {[...measurements].reverse().map((entry) => (
              <li key={entry.id}>
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
              </li>
            ))}
          </ul>
        </Card>
      </Stack>
    </>
  )
}
