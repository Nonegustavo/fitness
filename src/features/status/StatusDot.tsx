import { cx } from '../../components/ui'
import { needsAttention, worstLevel } from './health'
import { useSourceHealth } from './useSourceHealth'

/**
 * A small dot over an icon (the gear on Hoje, "Mais" on the bottom bar) when some source of data needs
 * a look: amber for a warning, red for an error; nothing when all is well. Its parent must be `relative`.
 */
export function StatusDot({ className }: { className?: string }) {
  const level = worstLevel(useSourceHealth())
  if (!needsAttention(level)) return null
  return (
    <span
      role="img"
      aria-label="Uma fonte de dados precisa de atenção"
      className={cx(
        // The ring in the surface color keeps the dot apart from the icon it sits on.
        'pointer-events-none absolute size-2 rounded-full ring-2 ring-surface',
        level === 'error' ? 'bg-critical' : 'bg-(--tone-habits)',
        className,
      )}
    />
  )
}
