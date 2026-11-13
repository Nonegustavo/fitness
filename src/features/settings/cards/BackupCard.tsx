import { Download, Upload } from 'lucide-react'
import { useRef } from 'react'
import { useToast } from '../../../components/Toast'
import { Button, Card } from '../../../components/ui'
import { exportBackup, importBackup } from '../../../db/backup'
import { db } from '../../../db/schema'
import { dayKey } from '../../../lib/dates'
import { shareFile } from '../../../lib/share'
import { isAndroidApp } from '../../healthconnect/plugin'

/**
 * What to say when an import fails. importBackup refuses a file with a plain Error in Portuguese,
 * meant for the user; anything else (a database or browser error) gets a sentence of its own.
 */
function importError(error: unknown): string {
  if (error instanceof SyntaxError) return 'Arquivo inválido.'
  if (error instanceof Error && error.constructor === Error && error.message) return error.message
  return 'Não foi possível importar este arquivo.'
}

export function BackupCard() {
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)

  async function onExport() {
    try {
      const blob = new Blob([JSON.stringify(await exportBackup(db))], { type: 'application/json' })
      const fileName = `fitness-backup-${dayKey()}.json`
      // The app's WebView ignores downloads: the file goes to the share sheet, to save in Drive or Arquivos.
      if (isAndroidApp()) {
        await shareFile(blob, fileName, 'Backup do Fitness')
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      console.warn(error)
      toast({ message: 'Não foi possível exportar o backup.' })
    }
  }

  async function onImport(file: File) {
    try {
      const written = await importBackup(db, JSON.parse(await file.text()))
      toast({ message: written > 0 ? `${written} registros importados` : 'Nada novo para importar' })
    } catch (error) {
      toast({ message: importError(error) })
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
