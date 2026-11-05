import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button, TextInput } from '../../components/ui'
import { GalleryButton, useRearCamera } from './Camera'

const canDetect = typeof window !== 'undefined' && 'BarcodeDetector' in window
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']
// A smaller picture keeps the detection quick.
const SCAN_VIDEO: MediaTrackConstraints = { facingMode: { ideal: 'environment' } }

/**
 * Reads a product barcode with the camera (Chrome on Android), from a picture in the gallery, or typed in.
 * `onDetected` should be stable (useCallback): the scanning restarts when it changes.
 */
export function BarcodeScanner({ onClose, onDetected }: { onClose: () => void; onDetected: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const camera = useRearCamera(video, SCAN_VIDEO, canDetect)
  const detector = useMemo(() => (canDetect ? new BarcodeDetector({ formats: FORMATS }) : undefined), [])
  const [note, setNote] = useState<string>()
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!detector || !camera.ready) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
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
    void scan()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [detector, camera.ready, onDetected])

  async function fromPicture(file: File) {
    if (!detector) return
    setNote(undefined)
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const [code] = await detector.detect(bitmap)
      bitmap.close()
      if (code?.rawValue) onDetected(code.rawValue)
      else setNote('Nenhum código de barras nessa foto. Tente outra, mais de perto.')
    } catch {
      setNote('Não foi possível ler essa foto.')
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const code = typed.replace(/\D/g, '')
    if (code.length >= 8) onDetected(code)
  }

  return (
    <Modal open title="Código de barras" onClose={onClose}>
      {canDetect && !camera.error ? (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-critical/80" />
        </div>
      ) : (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">
          {camera.error
            ? `${camera.error} Escolha a foto do código na galeria ou digite os números.`
            : 'Este navegador não lê códigos pela câmera (no celular Android, use o Chrome). Digite os números do código.'}
        </p>
      )}
      {canDetect && (
        <div className="mt-2">
          <GalleryButton onPick={(file) => void fromPicture(file)} />
          {note && <p className="mt-1 text-xs text-critical">{note}</p>}
        </div>
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
