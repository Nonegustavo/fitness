import { Images, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Modal } from '../../components/Modal'
import { Button, cx } from '../../components/ui'

/** A large picture for the plate and the small print of a label, at the cost of a heavier preview. */
const PHOTO_VIDEO: MediaTrackConstraints = { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }

/**
 * The phone's rear camera playing on `video` while `on`. `ready` once frames arrive; `error` when the
 * camera can't open (no camera, permission denied), so the screen can offer the gallery instead.
 */
export function useRearCamera(
  video: RefObject<HTMLVideoElement | null>,
  constraints: MediaTrackConstraints,
  on = true,
): { ready: boolean; error?: string } {
  const [state, setState] = useState<{ ready: boolean; error?: string }>({ ready: false })
  useEffect(() => {
    if (!on) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ ready: false, error: 'Este aparelho não deu acesso à câmera.' })
      return
    }
    let stopped = false
    let stream: MediaStream | undefined
    navigator.mediaDevices
      .getUserMedia({ video: constraints, audio: false })
      .then(async (media) => {
        if (stopped || !video.current) {
          media.getTracks().forEach((track) => track.stop())
          return
        }
        stream = media
        video.current.srcObject = media
        await video.current.play()
        if (!stopped) setState({ ready: true })
      })
      .catch(() => {
        if (!stopped) setState({ ready: false, error: 'Não foi possível abrir a câmera.' })
      })
    return () => {
      stopped = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [video, constraints, on])
  return state
}

/** The frame on the video as a JPEG, at the camera's full size. */
function grab(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível tirar a foto.'))), 'image/jpeg', 0.92),
  )
}

/** "Galeria": a picture from the phone instead of the camera. */
export function GalleryButton({ onPick }: { onPick: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button variant="ghost" onClick={() => input.current?.click()}>
        <Images size={18} /> Galeria
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onPick(file)
          event.target.value = ''
        }}
      />
    </>
  )
}

/**
 * The in-app camera: the rear camera with a shutter, and "Galeria" to pick a picture instead. `square`
 * marks the middle of the frame, the part a food's photo keeps.
 */
export function CameraCapture({
  title,
  hint,
  square = false,
  onCapture,
  onClose,
}: {
  title: string
  /** What to frame, over the picture. */
  hint?: string
  square?: boolean
  onCapture: (picture: Blob) => void
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const camera = useRearCamera(video, PHOTO_VIDEO)
  const [shooting, setShooting] = useState(false)
  const [error, setError] = useState<string>()

  async function shoot() {
    if (!video.current || !camera.ready || shooting) return
    setShooting(true)
    try {
      onCapture(await grab(video.current))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setShooting(false)
    }
  }

  return (
    <Modal open title={title} onClose={onClose}>
      {camera.error ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">{camera.error} Escolha uma foto da galeria.</p>
      ) : (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} muted playsInline className="aspect-[3/4] w-full object-cover" />
          {square && (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 aspect-square -translate-y-1/2 border-2 border-white/80" />
          )}
          {hint && (
            <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/40 px-3 py-1.5 text-center text-xs text-white">{hint}</p>
          )}
          {!camera.ready && (
            <LoaderCircle
              size={28}
              aria-hidden
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/80"
            />
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div>
          <GalleryButton onPick={onCapture} />
        </div>
        <button
          type="button"
          aria-label="Tirar a foto"
          disabled={!camera.ready || shooting}
          onClick={() => void shoot()}
          className={cx(
            'inline-flex size-16 items-center justify-center rounded-full border-4 border-ink-2 transition active:scale-90 disabled:opacity-40',
            shooting && 'animate-pulse',
          )}
        >
          <span className="size-12 rounded-full bg-ink" />
        </button>
        <span />
      </div>
    </Modal>
  )
}
