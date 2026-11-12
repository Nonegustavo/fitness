import { CircleMinus, CirclePlus, RotateCcw } from 'lucide-react'
import { updateSettings } from '../db/settings'
import { missingItems, quickLogItems, toggleQuickLog, type QuickLogId } from './quickLogItems'
import { LOOKS } from './quickLogLooks'
import { SortableList } from './Sortable'
import { IconTile } from './tone'
import { Button, IconButton } from './ui'

/**
 * Which items the "+" has and in what order; every change saves at once and syncs. On its own, so the
 * drag-and-drop it needs only loads when the editor opens.
 */
export default function QuickLogEditor({ items, onDone }: { items: QuickLogId[]; onDone: () => void }) {
  // From the items as stored: two taps one right after the other both count.
  const change = (next: (stored: QuickLogId[]) => QuickLogId[]) =>
    void updateSettings((settings) => ({ quickLog: next(quickLogItems(settings.quickLog)) }))
  const available = missingItems(items)
  return (
    <>
      <h3 className="text-sm font-semibold">Aparecem, nesta ordem</h3>
      {items.length === 0 ? (
        <p className="py-3 text-sm text-muted">Nada por enquanto.</p>
      ) : (
        <SortableList
          className="divide-y divide-line"
          itemClassName="flex items-center gap-2 bg-surface py-1.5"
          items={items}
          getId={(id) => id}
          onReorder={(list) => change(() => list)}
        >
          {(id, handle) => (
            <>
              <span className="-ml-2 flex">{handle}</span>
              <IconTile icon={LOOKS[id].icon} tone={LOOKS[id].tone} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{LOOKS[id].label}</span>
                <span className="block truncate text-xs text-muted">{LOOKS[id].detail}</span>
              </span>
              <IconButton label={`Tirar ${LOOKS[id].label}`} onClick={() => change((stored) => toggleQuickLog(stored, id, false))}>
                <CircleMinus size={20} />
              </IconButton>
            </>
          )}
        </SortableList>
      )}

      {available.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">Mais opções</h3>
          <ul className="divide-y divide-line">
            {available.map((id) => (
              <li key={id} className="flex items-center gap-2 py-1.5">
                <IconTile icon={LOOKS[id].icon} tone={LOOKS[id].tone} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{LOOKS[id].label}</span>
                  <span className="block truncate text-xs text-muted">{LOOKS[id].detail}</span>
                </span>
                <IconButton
                  label={`Adicionar ${LOOKS[id].label}`}
                  className="text-accent-ink"
                  onClick={() => change((stored) => toggleQuickLog(stored, id, true))}
                >
                  <CirclePlus size={20} />
                </IconButton>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" onClick={() => void updateSettings(() => ({ quickLog: undefined }))}>
          <RotateCcw size={16} /> Voltar ao padrão
        </Button>
        <Button variant="primary" className="ml-auto" onClick={onDone}>
          Pronto
        </Button>
      </div>
    </>
  )
}
