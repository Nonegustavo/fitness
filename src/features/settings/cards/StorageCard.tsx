import { useEffect, useState } from 'react'
import { Card } from '../../../components/ui'

export function StorageCard() {
  const [persisted, setPersisted] = useState<boolean>()
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  return (
    <Card title="Armazenamento">
      <p className="text-sm text-ink-2">
        Os dados ficam primeiro neste aparelho, então o app funciona sem internet.{' '}
        {persisted === false &&
          'O navegador não garantiu que eles não serão apagados se faltar espaço: ligue a sincronização ou faça backups.'}
        {persisted === true && 'O navegador marcou esses dados como persistentes.'}
      </p>
    </Card>
  )
}
