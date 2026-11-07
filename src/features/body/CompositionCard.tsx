import { Pencil, Ruler } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Stat } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import type { Sex, WeightEntry } from '../../db/types'
import { formatDay, relativeDay, type DayKey } from '../../lib/dates'
import { formatFixed, formatNumber } from '../../lib/format'
import { useMeasurements } from './body'
import { BodyProfileModal, bodyProfileText } from './BodyProfile'
import { bmi, bmiClass, healthyGap, healthyWeights, navyEstimate, type NavyEstimate, type NavyNeed, type SiteReading } from './composition'
import { MeasurementModal } from './MeasurementModal'

const SITE_NAME: Record<SiteReading['site'], string> = { neck: 'pescoço', waist: 'cintura', abdomen: 'abdômen', hip: 'quadril' }

/** What the Navy formula still needs, in words. */
function needText(need: NavyNeed, sex: Sex | undefined): string {
  switch (need) {
    case 'height':
      return 'sua altura'
    case 'sex':
      return 'o sexo'
    case 'neck':
      return 'a medida do pescoço'
    case 'waist':
      return sex === 'male'
        ? 'a do abdômen, na altura do umbigo'
        : sex === 'female'
          ? 'a da cintura, na parte mais fina'
          : 'a da cintura ou do abdômen'
    case 'hip':
      return 'a do quadril'
  }
}

/** "a, b e c". */
const listText = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`)

/**
 * The BMI of the last weigh-in and the healthy weights for the height (WHO), and the body fat by the U.S.
 * Navy formula from the latest measurements, next to the scale's.
 */
export function CompositionCard({ weights, today }: { weights: WeightEntry[]; today: DayKey }) {
  const settings = useSettings()
  const measurements = useMeasurements()
  const [editing, setEditing] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const { heightCm, sex } = settings
  const latest = weights.at(-1)

  return (
    <Card
      title="IMC e gordura"
      icon={Ruler}
      tone="body"
      action={
        // What the numbers below are worked out with, and where to change it.
        heightCm !== undefined && (
          <Button size="sm" variant="ghost" aria-label={`Altura e sexo: ${bodyProfileText(settings)}. Editar`} onClick={() => setEditing(true)}>
            <Pencil size={14} /> {bodyProfileText(settings)}
          </Button>
        )
      }
    >
      {heightCm === undefined ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-2">Informe sua altura para ver o IMC, o peso saudável e a gordura pela fórmula da Marinha.</p>
          <Button size="sm" variant="primary" onClick={() => setEditing(true)}>
            Informar
          </Button>
        </div>
      ) : (
        latest && <BmiView weight={latest} heightCm={heightCm} today={today} />
      )}

      {measurements && (
        <NavyView
          estimate={navyEstimate({ sex, heightCm, entries: measurements })}
          sex={sex}
          scale={[...weights].reverse().find((entry) => entry.bodyFatPct !== undefined)}
          today={today}
          onProfile={() => setEditing(true)}
          onMeasure={() => setMeasuring(true)}
        />
      )}

      {editing && <BodyProfileModal onClose={() => setEditing(false)} />}
      {measuring && <MeasurementModal entry={null} sites={settings.measurementSites} onClose={() => setMeasuring(false)} />}
    </Card>
  )
}

function BmiView({ weight, heightCm, today }: { weight: WeightEntry; heightCm: number; today: DayKey }) {
  const value = bmi(weight.weightKg, heightCm)
  const range = healthyWeights(heightCm)
  const gap = healthyGap(weight.weightKg, heightCm)
  // Room around the healthy band, and the weight always inside the bar.
  const pad = (range.high - range.low) * 0.4
  const from = Math.min(range.low, weight.weightKg) - pad
  const to = Math.max(range.high, weight.weightKg) + pad
  const at = (kg: number) => `${((kg - from) / (to - from)) * 100}%`
  const where =
    gap === 0
      ? 'Dentro da faixa saudável'
      : `${formatFixed(Math.abs(gap))} kg ${gap > 0 ? 'acima' : 'abaixo'} da faixa saudável`

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="IMC" value={formatFixed(value)} note={bmiClass(value)} />
        <Stat label="Peso saudável" value={`${formatFixed(range.low)}–${formatFixed(range.high)} kg`} note="IMC de 18,5 a 24,9" />
      </div>
      <div
        role="img"
        aria-label={`Peso de ${formatFixed(weight.weightKg)} kg; faixa saudável de ${formatFixed(range.low)} a ${formatFixed(range.high)} kg`}
        className="relative mt-7 mb-6"
      >
        <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
          <span className="absolute inset-y-0 bg-good/30" style={{ left: at(range.low), right: `calc(100% - ${at(range.high)})` }} />
        </div>
        <span
          aria-hidden
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-(--tone-body)"
          style={{ left: at(weight.weightKg) }}
        />
        <span aria-hidden className="absolute bottom-full mb-2 -translate-x-1/2 text-xs font-medium whitespace-nowrap tabular-nums" style={{ left: at(weight.weightKg) }}>
          {formatFixed(weight.weightKg)} kg
        </span>
        {[range.low, range.high].map((kg) => (
          <span key={kg} aria-hidden className="absolute top-full mt-1.5 -translate-x-1/2 text-[11px] text-muted tabular-nums" style={{ left: at(kg) }}>
            {formatFixed(kg)}
          </span>
        ))}
      </div>
      <p className="text-sm text-ink-2">
        {where}, pelo último peso ({relativeDay(weight.date, today)}).{' '}
        <span className="text-muted">O IMC não separa músculo de gordura.</span>
      </p>
    </div>
  )
}

function NavyView({
  estimate,
  sex,
  scale,
  today,
  onProfile,
  onMeasure,
}: {
  estimate: NavyEstimate
  sex: Sex | undefined
  /** The latest weigh-in with the scale's body fat. */
  scale: WeightEntry | undefined
  today: DayKey
  onProfile: () => void
  onMeasure: () => void
}) {
  const { percent, readings, missing } = estimate
  const sameDay = readings.every((reading) => reading.date === readings[0]?.date)
  const measured = sameDay
    ? readings.length > 0 &&
      `${listText(readings.map((reading) => `${SITE_NAME[reading.site]} ${formatNumber(reading.cm)} cm`))}, de ${formatDay(readings[0].date, "d 'de' MMM")}`
    : listText(readings.map((reading) => `${SITE_NAME[reading.site]} ${formatNumber(reading.cm)} cm (${formatDay(reading.date, "d 'de' MMM")})`))
  // Without the height, the card's own button above asks for it (and the sex, in the same sheet).
  const needsSex = missing.includes('sex') && !missing.includes('height')
  const needsMeasures = missing.some((need) => need !== 'height' && need !== 'sex')

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="mb-2 text-sm font-medium">Gordura corporal</p>
      {missing.length > 0 ? (
        <>
          <p className="text-sm text-ink-2">
            Para a fórmula da Marinha, {missing.length === 1 ? 'falta' : 'faltam'} {listText(missing.map((need) => needText(need, sex)))}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {needsSex && (
              <Button size="sm" onClick={onProfile}>
                Informar o sexo
              </Button>
            )}
            {needsMeasures && (
              <Button size="sm" onClick={onMeasure}>
                Registrar medidas
              </Button>
            )}
          </div>
          {scale && (
            <p className="mt-3 text-xs text-muted">
              Pela balança: {formatFixed(scale.bodyFatPct!)}% ({relativeDay(scale.date, today)}).
            </p>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Pela Marinha"
              value={percent !== undefined ? `${formatFixed(percent)}%` : '—'}
              note={percent !== undefined ? 'pelas medidas' : 'confira as medidas'}
            />
            {scale && <Stat label="Pela balança" value={`${formatFixed(scale.bodyFatPct!)}%`} note={relativeDay(scale.date, today)} />}
          </div>
          <p className="mt-2 text-xs text-muted first-letter:uppercase">
            {percent === undefined ? 'As medidas não dão um resultado possível: ' : ''}
            {measured}.
          </p>
        </>
      )}
    </div>
  )
}
