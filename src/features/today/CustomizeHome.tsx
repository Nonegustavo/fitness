import { CircleMinus, CirclePlus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { SortableList } from '../../components/Sortable'
import { Button, IconButton, Segmented, Switch } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { HomeAreas } from '../../db/types'
import { HOME_ELEMENTS, homeAreas, toggleElement, type HomeArea } from './homeCards'

const AREA_HINTS: Record<HomeArea, string> = {
  focus: 'Cartões grandes, todos do mesmo tamanho, para deslizar de lado.',
  quick: 'Cartões menores com o resumo, dois por linha.',
}

/** Which elements go in each area of the Hoje screen, and in what order. Every change saves at once and syncs. */
export function CustomizeHome({ onClose }: { onClose: () => void }) {
  const settings = useSettings()
  const areas = homeAreas(settings)
  const [area, setArea] = useState<HomeArea>('focus')
  const store = (next: HomeAreas) => void patch(db.settings, SETTINGS_ID, { homeAreas: next })
  const shown = areas[area].map((id) => HOME_ELEMENTS.find((element) => element.id === id)!)
  const available = HOME_ELEMENTS.filter((element) => !areas[area].includes(element.id))

  return (
    <Modal open title="Personalizar o Hoje" onClose={onClose}>
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Minha semana no topo</span>
          <span className="block text-xs text-muted">Os dias de domingo a sábado, acima do "Em foco"</span>
        </span>
        <Switch checked={areas.week} label="Mostrar Minha semana no topo" onChange={(week) => store({ ...areas, week })} />
      </div>
      <Segmented
        label="Área"
        value={area}
        onChange={setArea}
        options={[
          { value: 'focus', label: 'Em foco' },
          { value: 'quick', label: 'Visualização rápida' },
        ]}
      />
      <p className="mt-2 text-xs text-muted">{AREA_HINTS[area]} Um elemento pode estar nas duas áreas.</p>

      <h3 className="mt-4 text-sm font-semibold">Aparecem, nesta ordem</h3>
      {shown.length === 0 ? (
        <p className="py-3 text-sm text-muted">Nada nesta área: ela fica escondida.</p>
      ) : (
        <SortableList
          className="divide-y divide-line"
          itemClassName="flex items-center gap-2 bg-surface py-1.5"
          items={shown}
          getId={(element) => element.id}
          onReorder={(list) => store({ ...areas, [area]: list.map((element) => element.id) })}
        >
          {(element, handle) => (
            <>
              <span className="-ml-2 flex">{handle}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{element.label}</span>
                <span className="block truncate text-xs text-muted">{element.detail}</span>
              </span>
              <IconButton label={`Tirar ${element.label}`} onClick={() => store(toggleElement(areas, area, element.id, false))}>
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
            {available.map((element) => (
              <li key={element.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{element.label}</span>
                  <span className="block truncate text-xs text-muted">{element.detail}</span>
                </span>
                <IconButton
                  label={`Adicionar ${element.label}`}
                  className="text-accent-ink"
                  onClick={() => store(toggleElement(areas, area, element.id, true))}
                >
                  <CirclePlus size={20} />
                </IconButton>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" onClick={() => void patch(db.settings, SETTINGS_ID, { homeAreas: undefined })}>
          <RotateCcw size={16} /> Voltar ao padrão
        </Button>
        <Button variant="primary" className="ml-auto" onClick={onClose}>
          Pronto
        </Button>
      </div>
    </Modal>
  )
}
