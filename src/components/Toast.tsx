import { useSyncExternalStore, type ReactNode } from 'react'

export interface ToastOptions {
  message: string
  action?: { label: string; onClick: () => void }
}

interface ToastData extends ToastOptions {
  key: number
}

export type ShowToast = (toast: ToastOptions) => void

/** How many stay on screen: one more pushes the oldest out. */
export const MAX_TOASTS = 3
const PLAIN_MS = 4000
/** One with a button ("Desfazer") has to be read and reached: it stays longer. */
const ACTION_MS = 6000

// Kept outside React, so a toast can also come from code that isn't a component (a failed save caught
// in main.tsx) and so one deletion's "Desfazer" isn't replaced by the next toast.
let toasts: ToastData[] = []
let nextKey = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()

function set(next: ToastData[]) {
  for (const { key } of toasts) {
    if (next.some((toast) => toast.key === key)) continue
    clearTimeout(timers.get(key))
    timers.delete(key)
  }
  toasts = next
  for (const listener of listeners) listener()
}

const dismiss = (key: number) => set(toasts.filter((toast) => toast.key !== key))

/** The toasts after one more comes in: the same plain message again takes the place of the first. */
export function withToast<T extends ToastOptions>(shown: T[], next: T, max = MAX_TOASTS): T[] {
  const others = next.action ? shown : shown.filter((toast) => toast.action || toast.message !== next.message)
  return [...others, next].slice(-max)
}

/** Shows a toast, from anywhere; it goes away by itself. */
export const showToast: ShowToast = (toast) => {
  const key = nextKey++
  set(withToast(toasts, { ...toast, key }))
  timers.set(
    key,
    setTimeout(() => dismiss(key), toast.action ? ACTION_MS : PLAIN_MS),
  )
}

/** For components: the same `showToast`, kept as a hook so the screens read as before. */
export const useToast = (): ShowToast => showToast

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const shown = useSyncExternalStore(subscribe, () => toasts)
  return (
    <>
      {children}
      {/* At the top, so they never cover the rest timer or the bottom navigation; taps pass between them. */}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-4 top-[max(env(safe-area-inset-top),0.75rem)] z-[60] mx-auto flex max-w-sm flex-col gap-2"
      >
        {shown.map((toast) => (
          <div
            key={toast.key}
            className="pointer-events-auto flex animate-drop items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-plane shadow-lg"
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="shrink-0 font-semibold underline underline-offset-2"
                onClick={() => {
                  toast.action?.onClick()
                  dismiss(toast.key)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
