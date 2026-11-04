import { RotateCcw } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { SortableList } from '../../components/Sortable'
import { Button, Switch } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { HomeCardId } from '../../db/types'
import { HOME_CARDS, homeLayout, layoutToSave, type HomeZone, type PlacedCard } from './homeCards'

const SECTIONS: { zone: HomeZone; title: string; hint: string }[] = [
  { zone: 'main', title: 'Cartões', hint: 'Na ordem da tela. "Em foco" e "Visualização rápida" são os grupos abaixo.' },
  { zone: 'focus', title: 'Em foco', hint: 'Os cartões grandes do carrossel, para deslizar.' },
  { zone: 'quick', title: 'Visualização rápida', hint: 'Os cartões menores, dois por linha.' },
]

/** Show, hide and reorder the cards of the Hoje screen, group by group. Every change saves at once and syncs. */
export function CustomizeHome({ onClose }: { onClose: () => void }) {
  const settings = useSettings()
  const layout = homeLayout(settings.home)
  const inZone = (zone: HomeZone) => layout.filter((card) => card.zone === zone)
  const store = (cards: PlacedCard[]) => void patch(db.settings, SETTINGS_ID, { home: layoutToSave(cards) })
  // Reordering one group keeps the others as they are.
  const reorder = (zone: HomeZone, list: PlacedCard[]) =>
    store(SECTIONS.flatMap((section) => (section.zone === zone ? list : inZone(section.zone))))
  const show = (id: HomeCardId, visible: boolean) => store(layout.map((card) => (card.id === id ? { ...card, visible } : card)))

  return (
    <Modal open title="Personalizar o Hoje" onClose={onClose}>
      <p className="text-sm text-ink-2">Arraste para mudar a ordem e desligue o que não quer ver.</p>
      {SECTIONS.map(({ zone, title, hint }) => (
        <section key={zone} className="mt-4">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted">{hint}</p>
          <SortableList
            className="mt-1 divide-y divide-line"
            itemClassName="flex items-center gap-2 bg-surface py-1.5"
            items={inZone(zone)}
            getId={(card) => card.id}
            onReorder={(list) => reorder(zone, list)}
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
                  <Switch checked={card.visible} label={`Mostrar ${info.label}`} onChange={(visible) => show(card.id, visible)} />
                </>
              )
            }}
          </SortableList>
        </section>
      ))}
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
