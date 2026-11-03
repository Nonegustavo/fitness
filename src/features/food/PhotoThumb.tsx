import { ImageIcon } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { cx } from '../../components/ui'
import { usePhotoUrl } from './photos'

/** A plate photo kept with the meal; tap to see it whole. */
export function PhotoThumb({ id, className }: { id: string; className?: string }) {
  const url = usePhotoUrl(id)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        aria-label="Ver a foto do prato"
        className={cx('flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2', className)}
      >
        {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImageIcon size={20} className="text-muted" />}
      </button>
      {open && url && (
        <Modal open title="Foto do prato" onClose={() => setOpen(false)}>
          <img src={url} alt="Foto do prato" className="w-full rounded-xl" />
        </Modal>
      )}
    </>
  )
}
