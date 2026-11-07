import { Pencil } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, Card, DecimalInput, Field, Segmented } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { Settings, Sex } from '../../db/types'
import { formatNumber, parseDecimal } from '../../lib/format'

const SEXES: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Masculino' },
  { value: 'female', label: 'Feminino' },
]

/** "178" or "1,78" (meters, as people often say it) to centimeters. */
function heightFrom(text: string): number | undefined {
  const value = parseDecimal(text)
  if (value === undefined) return undefined
  return Math.round((value < 3 ? value * 100 : value) * 10) / 10
}

/** "1,78 m · masculino", or undefined when neither is set. */
export function bodyProfileText({ heightCm, sex }: Pick<Settings, 'heightCm' | 'sex'>): string | undefined {
  const parts = [
    heightCm !== undefined && `${formatNumber(heightCm / 100, 2)} m`,
    sex && SEXES.find((option) => option.value === sex)!.label.toLowerCase(),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/** Height and sex, for the BMI and the Navy body fat formula. */
export function BodyProfileModal({ onClose }: { onClose: () => void }) {
  const settings = useSettings()
  const [heightText, setHeightText] = useState(settings.heightCm !== undefined ? formatNumber(settings.heightCm) : '')
  const [sex, setSex] = useState(settings.sex)
  const heightCm = heightFrom(heightText)
  const valid = heightText.trim() === '' || (heightCm !== undefined && heightCm >= 100 && heightCm <= 250)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    await patch(db.settings, SETTINGS_ID, { heightCm, sex })
    onClose()
  }

  return (
    <Modal open title="Altura e sexo" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Altura (cm)"
          hint={heightCm !== undefined && valid ? `${formatNumber(heightCm / 100, 2)} m` : 'Em centímetros, como 178'}
        >
          <DecimalInput autoFocus={settings.heightCm === undefined} value={heightText} onChange={(e) => setHeightText(e.target.value)} placeholder="178" />
        </Field>
        <Field label="Sexo" group hint="A fórmula da Marinha tem uma versão para cada, com medidas diferentes.">
          <Segmented<Sex | ''> label="Sexo" value={sex ?? ''} options={SEXES} onChange={(value) => setSex(value || undefined)} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={!valid}>
          Salvar
        </Button>
      </form>
    </Modal>
  )
}

/** Ajustes: the height and sex that Corpo uses, with the same editor. */
export function BodyProfileCard() {
  const settings = useSettings()
  const [editing, setEditing] = useState(false)
  return (
    <Card
      title="Altura e sexo"
      action={
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil size={16} /> Editar
        </Button>
      }
    >
      <p className="text-sm">{bodyProfileText(settings) ?? 'Ainda não informados.'}</p>
      <p className="mt-1 text-xs text-muted">Em Corpo, para o IMC, o peso saudável e a gordura pela fórmula da Marinha.</p>
      {editing && <BodyProfileModal onClose={() => setEditing(false)} />}
    </Card>
  )
}
