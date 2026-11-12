import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { SortableList } from '../../../components/Sortable'
import { Button, Card, IconButton, TextInput } from '../../../components/ui'
import { useSettings } from '../../../db/hooks'
import { updateSettings } from '../../../db/settings'

/** "Antebraço esquerdo" -> "antebraco_esquerdo". */
function siteKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function SitesCard() {
  const { measurementSites: sites } = useSettings()
  const [label, setLabel] = useState('')

  async function add(event: FormEvent) {
    event.preventDefault()
    const name = label.trim()
    if (!name) return
    await updateSettings(({ measurementSites: stored }) => {
      const base = siteKey(name) || 'local'
      let key = base
      for (let n = 2; stored.some((site) => site.key === key); n++) key = `${base}_${n}`
      return { measurementSites: [...stored, { key, label: name }] }
    })
    setLabel('')
  }

  return (
    <Card title="Locais de medida">
      <p className="mb-2 text-xs text-muted">
        Arraste para mudar a ordem do formulário, da tabela e do gráfico em Corpo. Remover um local só o tira do
        formulário; as medidas antigas continuam salvas.
      </p>
      <SortableList
        className="divide-y divide-line"
        itemClassName="flex items-center gap-2 bg-surface py-0.5"
        items={sites}
        getId={(site) => site.key}
        onReorder={(list) => void updateSettings(() => ({ measurementSites: list }))}
      >
        {(site, handle) => (
          <>
            <span className="-ml-2 flex">{handle}</span>
            <span className="min-w-0 flex-1 text-sm">{site.label}</span>
            <IconButton
              label={`Remover ${site.label}`}
              onClick={() =>
                void updateSettings(({ measurementSites: stored }) => ({
                  measurementSites: stored.filter((other) => other.key !== site.key),
                }))
              }
            >
              <X size={16} />
            </IconButton>
          </>
        )}
      </SortableList>
      <form onSubmit={add} className="mt-2 flex gap-2">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Novo local (ex.: Antebraço)" />
        <Button type="submit" disabled={!label.trim()}>
          Adicionar
        </Button>
      </form>
    </Card>
  )
}
