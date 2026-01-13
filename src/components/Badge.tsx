import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-white/10 bg-slate-950/25 px-3 py-1.5 text-xs font-semibold text-white/90',
        className,
      )}
      {...props}
    />
  )
}


