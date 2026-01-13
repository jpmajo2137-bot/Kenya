import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { cn } from './cn'

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[rgb(var(--panel2))] shadow-2xl',
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="text-base font-bold text-white">{title}</div>
          <button
            className="rounded-xl px-2 py-1 text-sm font-semibold text-white/80 hover:bg-white/5"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-white/10 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  )
}


