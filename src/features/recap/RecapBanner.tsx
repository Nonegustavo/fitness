import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, PartyPopper, X } from 'lucide-react'
import { Link } from 'react-router'
import { IconTile, toneColor } from '../../components/tone'
import { IconButton, Pending } from '../../components/ui'
import { db } from '../../db/schema'
import type { DayKey } from '../../lib/dates'
import { recapBannerYear } from './recap'

/** The year whose banner was put away on this device (local, not synced: each device asks once). */
const DISMISSED_KEY = 'recapBanner'

/** On Hoje from December 1 to January 15: the year's recap is ready. Closing it hides it on this device. */
export function RecapBanner({ today }: { today: DayKey }) {
  const year = recapBannerYear(today)
  const dismissed = useLiveQuery(
    async () => (year === undefined ? null : (((await db.meta.get(DISMISSED_KEY))?.value as number | undefined) ?? null)),
    [year],
  )
  if (year === undefined || dismissed === year) return null
  // The screen waits for it, so the banner doesn't push everything down once it comes.
  if (dismissed === undefined) return <Pending />

  return (
    <section
      aria-label={`Retrospectiva de ${year}`}
      className="flex items-center gap-3 rounded-2xl border border-line py-2 pr-1 pl-4"
      style={{ background: `color-mix(in oklab, ${toneColor('analysis')} 12%, var(--surface))` }}
    >
      <IconTile icon={PartyPopper} tone="analysis" size="md" />
      <Link to={`/retrospectiva?ano=${year}`} className="min-w-0 flex-1 py-1">
        <span className="block text-sm font-semibold">Sua retrospectiva de {year}</span>
        <span className="flex items-center gap-0.5 text-xs text-ink-2">
          O seu ano em números <ChevronRight size={14} aria-hidden />
        </span>
      </Link>
      <IconButton label="Dispensar a retrospectiva" onClick={() => void db.meta.put({ key: DISMISSED_KEY, value: year })}>
        <X size={18} />
      </IconButton>
    </section>
  )
}
