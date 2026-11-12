import { Download, Upload } from 'lucide-react'
import { useRef } from 'react'
import { useToast } from '../../../components/Toast'
import { Button, Card } from '../../../components/ui'
import { exportBackup, importBackup } from '../../../db/backup'
import { db } from '../../../db/schema'
import { dayKey } from '../../../lib/dates'

export function BackupCard() {
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)

  async function onExport() {
    const backup = await exportBackup(db)
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `fitness-backup-${dayKey()}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function onImport(file: File) {
    try {
      const written = await importBackup(db, JSON.parse(await file.text()))
      toast({ message: written > 0 ? `${written} registros importados` : 'Nada novo para importar' })
    } catch (error) {
      toast({ message: error instanceof SyntaxError ? 'Arquivo inválido.' : String((error as Error).message ?? error) })
    }
  }

  return (
    <Card title="Backup">
      <p className="mb-3 text-sm text-ink-2">
        Exporte tudo para um arquivo e importe em outro aparelho. Importar não apaga nada: só traz o que for mais recente.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void onExport()}>
          <Download size={16} /> Exportar
        </Button>
        <Button size="sm" onClick={() => fileInput.current?.click()}>
          <Upload size={16} /> Importar
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onImport(file)
          event.target.value = ''
        }}
      />
    </Card>
  )
}
