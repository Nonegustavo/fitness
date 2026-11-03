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
          className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-plane shadow-lg lg:bottom-6"
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
