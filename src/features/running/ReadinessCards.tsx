import { ArrowDown, ArrowUp, CircleGauge, Minus } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { Card, cx, SkeletonCard } from '../../components/ui'
import { relativeDay, shiftDay, type DayKey } from '../../lib/dates'
import { useDailyHealth } from '../garmin/recovery'
import { usePains } from '../journal/pains'
import { Note, SmallCard, ThinBar, TileSkeleton, Value } from '../today/tiles'
import { loadStatus } from './load'
import { useTrainingLoad } from './LoadCards'
import { BANDS, readiness, readinessDay, type Readiness, type ReadinessFactor } from './readiness'

/**
 * Today's readiness, or yesterday's while the watch hasn't brought the night; null with too little to go on,
 * undefined while loading.
 */
export function useReadiness(today: DayKey): Readiness | null | undefined {
  // The 30 days before yesterday too: the normal the night is compared with.
  const health = useDailyHealth(shiftDay(today, -32), today)
  const pains = usePains()
  const load = useTrainingLoad(today)
  return useMemo(() => {
    if (!health || !pains || !load) return undefined
    const date = readinessDay(health, today)
    return readiness({ date, health, load: loadStatus(load.series, date), pains }) ?? null
  }, [health, pains, load, today])
}

const EFFECTS: Record<ReadinessFactor['effect'], { icon: typeof ArrowUp; className: string; label: string }> = {
  up: { icon: ArrowUp, className: 'text-good', label: 'ajuda' },
  down: { icon: ArrowDown, className: 'text-critical', label: 'pesa' },
  neutral: { icon: Minus, className: 'text-muted', label: 'neutro' },
}

/** The score on a ring of its band's color. */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const radius = 42
  const length = 2 * Math.PI * radius
  return (
    <div className="relative size-20 shrink-0">
      <svg aria-hidden viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx={50} cy={50} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={10} />
        <circle
          cx={50}
          cy={50}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * length} ${length}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold tabular-nums">{score}</span>
    </div>
  )
}

/** Each input with an arrow for how it weighs today, and why. */
function Factors({ result }: { result: Readiness }) {
  return (
    <ul className="space-y-1 text-sm">
      {result.factors.map((factor) => {
        const effect = EFFECTS[factor.effect]
        return (
          <li key={factor.key} className="flex gap-2">
            <effect.icon size={15} aria-hidden className={cx('mt-0.5 shrink-0', effect.className)} />
            <span className="min-w-0">
              <span className="text-ink-2">
                {factor.label}
                <span className="sr-only"> ({effect.label})</span>:
              </span>{' '}
              {factor.reason}
              {factor.key === 'pains' && <span className="text-muted"> · −{result.penalty}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

const title = (result: Readiness, today: DayKey) =>
  result.date === today ? 'Prontidão' : `Prontidão · ${relativeDay(result.date, today)}`

export function ReadinessBig({ today }: { today: DayKey }) {
  const result = useReadiness(today)
  if (result === undefined) return <SkeletonCard lines={5} />
  if (!result) return null
  const band = BANDS[result.band]
  return (
    <Card
      icon={CircleGauge}
      tone="recovery"
      title={title(result, today)}
      action={
        <Link to="/sono" className="text-sm font-medium text-accent-ink">
          Recuperação
        </Link>
      }
    >
      <div className="flex items-center gap-4" role="img" aria-label={`Prontidão ${result.score} de 100: ${band.label.toLowerCase()}`}>
        <ScoreRing score={result.score} color={band.color} />
        <div className="min-w-0">
          <p className="text-lg font-semibold">{band.label}</p>
          <p className="text-sm text-ink-2">{band.advice}</p>
        </div>
      </div>
      <div className="mt-3">
        <Factors result={result} />
      </div>
    </Card>
  )
}

export function ReadinessSmall({ today }: { today: DayKey }) {
  const result = useReadiness(today)
  if (result === undefined) return <TileSkeleton />
  if (!result) return null
  const band = BANDS[result.band]
  const leaning = result.factors.filter((factor) => factor.effect !== 'neutral')
  return (
    <SmallCard icon={CircleGauge} tone="recovery" label={title(result, today)} to="/sono">
      <Value value={result.score} unit={band.label.toLowerCase()} />
      <ThinBar value={result.score} max={100} color={band.color} />
      {leaning.length > 0 && (
        <Note>{leaning.map((factor) => `${factor.effect === 'up' ? '↑' : '↓'} ${factor.label}`).join(' · ')}</Note>
      )}
    </SmallCard>
  )
}
