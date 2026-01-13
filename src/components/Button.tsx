import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md'

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 touch-target'

  const sizes: Record<Size, string> = {
    sm: 'h-8 sm:h-9 px-2.5 sm:px-3 text-xs sm:text-sm',
    md: 'h-10 sm:h-11 px-3 sm:px-4 text-xs sm:text-sm',
  }

  const variants: Record<Variant, string> = {
    primary:
      'bg-[rgba(var(--purple),0.85)] text-white hover:bg-[rgba(var(--purple),0.95)] shadow-sm ring-1 ring-white/10',
    secondary:
      'bg-[rgba(255,255,255,0.10)] text-white hover:bg-[rgba(255,255,255,0.16)] border border-white/14',
    ghost: 'bg-transparent text-white/90 hover:bg-white/8',
    danger: 'bg-[rgb(var(--orange))] text-white hover:bg-[rgb(var(--orange))]/92',
    success: 'bg-[rgba(var(--green),0.90)] text-slate-950 hover:bg-[rgba(var(--green),0.98)]',
  }

  return <button className={cn(base, sizes[size], variants[variant], className)} {...props} />
}


