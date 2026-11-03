import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, TextInput } from '../../components/ui'

const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices

/**
 * Reads a product barcode with the camera (Chrome on Android), or takes it typed in.
 * `onDetected` should be stable (useCallback): the camera restarts when it changes.
 */
export function BarcodeScanner({ onClose, onDetected }: { onClose: () => void; onDetected: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string>()
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!canScan) return
    let stopped = false
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })

    const scan = async () => {
      if (stopped || !video.current) return
      try {
        const [code] = await detector.detect(video.current)
        if (code?.rawValue && !stopped) {
          stopped = true
          onDetected(code.rawValue)
          return
        }
      } catch {
        // Frame not ready yet: try the next one.
      }
      timer = setTimeout(() => void scan(), 250)
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (media) => {
        if (stopped || !video.current) {
          media.getTracks().forEach((track) => track.stop())
          return
        }
        stream = media
        video.current.srcObject = media
        await video.current.play()
        void scan()
      })
      .catch(() => setError('Não foi possível abrir a câmera. Digite o código abaixo.'))

    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [onDetected])

  function submit(event: FormEvent) {
    event.preventDefault()
    const code = typed.replace(/\D/g, '')
    if (code.length >= 8) onDetected(code)
  }

  return (
    <Modal open title="Código de barras" onClose={onClose}>
      {canScan && !error ? (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-critical/80" />
        </div>
      ) : (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">
          {error ?? 'Este navegador não lê códigos pela câmera (no celular Android, use o Chrome). Digite os números do código.'}
        </p>
      )}
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <TextInput
          inputMode="numeric"
          aria-label="Números do código de barras"
          placeholder="Ou digite os números"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={typed.replace(/\D/g, '').length < 8}>
          Buscar
        </Button>
      </form>
    </Modal>
  )
}
