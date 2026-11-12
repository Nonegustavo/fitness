import { bottomSections, SECTIONS } from '../../../components/sections'
import { Button, Card, Field, Select } from '../../../components/ui'
import { useSettings } from '../../../db/hooks'
import { updateSettings } from '../../../db/settings'

/** The four sections of the phone's bottom bar; the others stay under "Mais". */
export function NavBarCard() {
  const settings = useSettings()
  const current = bottomSections(settings.navBar).map((section) => section.to)
  const choose = (slot: number, path: string) =>
    void updateSettings((stored) => {
      const next = bottomSections(stored.navBar).map((section) => section.to)
      // A section already on the bar trades places with the one it replaces.
      const taken = next.indexOf(path)
      if (taken >= 0) next[taken] = next[slot]
      next[slot] = path
      return { navBar: next }
    })
  return (
    <Card title="Barra de baixo">
      <p className="mb-3 text-sm text-ink-2">As quatro seções da barra do celular; as outras ficam em Mais.</p>
      <div className="grid grid-cols-2 gap-3">
        {current.map((path, slot) => (
          <Field key={slot} label={`${slot + 1}ª posição`}>
            <Select value={path} onChange={(event) => choose(slot, event.target.value)}>
              {SECTIONS.filter((section) => section.to !== '/ajustes').map((section) => (
                <option key={section.to} value={section.to}>
                  {section.label}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
      {settings.navBar && (
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => void updateSettings(() => ({ navBar: undefined }))}>
          Voltar ao padrão
        </Button>
      )}
    </Card>
  )
}
