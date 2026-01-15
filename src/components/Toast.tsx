import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { cn } from './cn'

type ToastItem = {
  id: string
  title: string
  description?: string
  position?: 'bottom-right' | 'center'
}

const ToastContext = createContext<{
  toast: (t: Omit<ToastItem, 'id'>) => void
} | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const toast = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setItems((prev) => [...prev, { id, ...t }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id))
    }, 2600)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-[320px] flex-col gap-2">
        {items
          .filter((t) => t.position !== 'center')
          .map((t) => (
          <div
            key={t.id}
            className={cn(
              'rounded-2xl border border-white/10 bg-[rgb(var(--panel2))]/95 p-3 shadow-xl backdrop-blur',
            )}
          >
            <div className="text-sm font-bold text-white">{t.title}</div>
            {t.description ? <div className="mt-0.5 text-xs text-white/70">{t.description}</div> : null}
          </div>
        ))}
      </div>
      <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center">
        <div className="flex w-[320px] flex-col gap-2">
          {items
            .filter((t) => t.position === 'center')
            .map((t) => (
            <div
              key={t.id}
              className={cn(
                'rounded-2xl border border-white/10 bg-[rgb(var(--panel2))]/95 p-3 shadow-xl backdrop-blur',
              )}
            >
              <div className="text-sm font-bold text-white">{t.title}</div>
              {t.description ? <div className="mt-0.5 text-xs text-white/70">{t.description}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('ToastProvider가 필요합니다.')
  return ctx
}


