import { X } from 'lucide-react'
import { useContext, useEffect, useEffectEvent, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { tabStops, wrappedStop } from './keys'
import { ToneContext } from './tone'
import { Button, IconButton } from './ui'

/** Open modals, innermost last: Escape only closes the top one. */
const openModals: symbol[] = []
/** The page's own overflow, put back when the last modal closes. */
let pageOverflow = ''

/** Bottom sheet on phones, centered dialog on wider screens. */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  // Not an effect dependency: a parent re-rendering mustn't reopen the modal and reshuffle the stack.
  const onEscape = useEffectEvent(() => onClose())
  // Rendered outside the page, so the section color comes from the context, not the DOM.
  const tone = useContext(ToneContext)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const id = Symbol('modal')
    // One lock shared by every open modal. Each saving and restoring its own left the page unscrollable
    // when a nested modal's saved "hidden" was put back last.
    if (openModals.length === 0) {
      pageOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    openModals.push(id)
    // The focus comes into the sheet, so the keyboard and a screen reader start there instead of on the
    // page behind. Onto the sheet itself, not a field (that would bring up the phone's keyboard), unless
    // one already asked for it (autoFocus).
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog.current && !dialog.current.contains(document.activeElement)) dialog.current.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (openModals.at(-1) !== id) return
      if (event.key === 'Escape') onEscape()
      else if (event.key === 'Tab' && dialog.current) {
        // Tab goes around inside the sheet, never out to the page under it.
        const inside = dialog.current.contains(document.activeElement) && document.activeElement !== dialog.current
        const to = wrappedStop(tabStops(dialog.current), inside ? (document.activeElement as HTMLElement) : null, event.shiftKey)
        if (!to) return
        event.preventDefault()
        to.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      openModals.splice(openModals.indexOf(id), 1)
      document.removeEventListener('keydown', onKey)
      if (openModals.length === 0) document.body.style.overflow = pageOverflow
      // And back to what opened it, when that is still on the page.
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade bg-black/50" onClick={onClose} />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-tone={tone}
        className="relative flex max-h-[92dvh] w-full animate-sheet flex-col rounded-t-3xl border border-line bg-surface shadow-xl outline-none sm:max-w-md sm:rounded-3xl"
      >
        <header className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <IconButton label="Fechar" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        <div className="scroll-fade-y overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function Confirm({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal open title={title} onClose={onClose}>
      <div className="text-sm text-ink-2">{message}</div>
      <div className="mt-5 flex gap-2">
        <Button className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          className="flex-1"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
