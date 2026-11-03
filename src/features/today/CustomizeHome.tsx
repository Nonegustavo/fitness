import { RotateCcw } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { SortableList } from '../../components/Sortable'
import { Button, Switch } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { HomeCardId } from '../../db/types'
import { HOME_CARDS, homeLayout } from './homeCards'

type Arrangement = { id: HomeCardId; visible: boolean }[]

/** Show, hide and reorder the cards of the Hoje screen. Every change saves at once and syncs. */
export function CustomizeHome({ onClose }: { onClose: () => void }) {
  const settings = useSettings()
  const layout = homeLayout(settings.home)
  const store = (cards: Arrangement) =>
    void patch(db.settings, SETTINGS_ID, {
      home: { order: cards.map((card) => card.id), hidden: cards.filter((card) => !card.visible).map((card) => card.id) },
    })

  return (
    <Modal open title="Personalizar o Hoje" onClose={onClose}>
      <p className="mb-2 text-sm text-ink-2">Arraste para mudar a ordem e desligue o que não quer ver.</p>
      <SortableList
        className="divide-y divide-line"
        itemClassName="flex items-center gap-2 bg-surface py-1.5"
        items={layout}
        getId={(card) => card.id}
        onReorder={store}
      >
        {(card, handle) => {
          const info = HOME_CARDS.find((known) => known.id === card.id)!
          return (
            <>
              <span className="-ml-2 flex">{handle}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{info.label}</span>
                <span className="block truncate text-xs text-muted">{info.detail}</span>
              </span>
              <Switch
                checked={card.visible}
                label={`Mostrar ${info.label}`}
                onChange={(visible) => store(layout.map((other) => (other.id === card.id ? { ...other, visible } : other)))}
              />
            </>
          )
        }}
      </SortableList>
      <div className="mt-4 flex gap-2">
        <Button variant="ghost" onClick={() => void patch(db.settings, SETTINGS_ID, { home: undefined })}>
          <RotateCcw size={16} /> Voltar ao padrão
        </Button>
        <Button variant="primary" className="ml-auto" onClick={onClose}>
          Pronto
        </Button>
      </div>
    </Modal>
  )
}
