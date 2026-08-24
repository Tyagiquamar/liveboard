'use client'

import { cn, initials } from '@/lib/utils'

export function Avatar({
  name,
  color,
  size = 24,
  className,
  ring
}: {
  name: string
  color?: string
  size?: number
  className?: string
  ring?: boolean
}) {
  return (
    <span
      title={name}
      style={{ width: size, height: size, background: color ?? '#6e79f4', fontSize: Math.max(9, size * 0.38) }}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white',
        ring && 'ring-2 ring-panel',
        className
      )}
      aria-label={name}
    >
      {initials(name)}
    </span>
  )
}
