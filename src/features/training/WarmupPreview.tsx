import { Flame, X } from 'lucide-react'
import { Button, IconButton } from '../../components/ui'
import { formatNumber } from '../../lib/format'
import { formatWarmup, type WarmupSet } from './warmup'

/**
 * The warm-up suggested for the first working set's load, "20×10 · 40×8 · 60×5 · 80×3", with "Usar",
 * which puts it in place of the warm-ups not done yet.
 */
export function WarmupPreview({
  workKg,
  warmup,
  onUse,
  onClose,
}: {
  /** The first working set's load; undefined when there's none yet. */
  workKg: number | undefined
  warmup: WarmupSet[]
  onUse: () => void
  onClose: () => void
}) {
  const message =
    workKg === undefined
      ? 'Informe a carga da primeira série para sugerir o aquecimento.'
      : warmup.length === 0
        ? 'A carga já é leve: não há o que aquecer abaixo dela.'
        : undefined
  return (
    <div className="mt-2 rounded-xl bg-surface-2 p-2.5 text-sm">
      <div className="flex items-center gap-2">
        <Flame size={16} aria-hidden className="shrink-0 text-accent-ink" />
        <p className="min-w-0 flex-1 text-xs text-ink-2">
          Aquecimento{workKg !== undefined && ` até ${formatNumber(workKg, 2)} kg`}
        </p>
        {warmup.length > 0 && (
          <Button size="sm" className="h-8" onClick={onUse}>
            Usar
          </Button>
        )}
        <IconButton label="Fechar sugestão de aquecimento" className="-my-1 size-8" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <p className={message ? 'mt-1 text-ink-2' : 'mt-1 font-semibold tabular-nums'}>{message ?? formatWarmup(warmup)}</p>
    </div>
  )
}
