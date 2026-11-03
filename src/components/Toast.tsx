import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

interface ToastData {
  key: number
  message: string
  action?: { label: string; onClick: () => void }
}

type ShowToast = (toast: Omit<ToastData, 'key'>) => void

const ToastContext = createContext<ShowToast>(() => {})

export const useToast = (): ShowToast => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null)
  const show = useCallback<ShowToast>((next) => setToast({ ...next, key: Date.now() }), [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.key}
          role="status"
          // At the top, so it never covers the rest timer or the bottom navigation.
          className="fixed inset-x-4 top-[max(env(safe-area-inset-top),0.75rem)] z-[60] mx-auto flex max-w-sm animate-drop items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-plane shadow-lg"
        >
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="shrink-0 font-semibold underline underline-offset-2"
              onClick={() => {
                toast.action?.onClick()
                setToast(null)
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}
