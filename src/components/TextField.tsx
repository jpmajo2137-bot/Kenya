import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-12 w-full rounded-2xl border border-white/12 bg-white/8 px-4 text-sm font-semibold text-white outline-none placeholder:text-white/55 ring-[rgb(var(--purple))]/25 focus:ring-4',
        className,
      )}
      {...props}
    />
  )
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-[96px] w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/55 ring-[rgb(var(--purple))]/25 focus:ring-4',
        className,
      )}
      {...props}
    />
  )
}


