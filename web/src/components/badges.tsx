'use client'

import { Flag } from 'lucide-react'
import { priorityMeta, STATUS_META } from '@/lib/constants'
import type { Status } from '@/lib/types'
import { cn } from '@/lib/utils'

export function PriorityIcon({ value, size = 13 }: { value: number; size?: number }) {
  const p = priorityMeta(value)
  return (
    <Flag size={size} style={{ color: p.color }} fill={value >= 3 ? p.color : 'none'} aria-label={`Priority ${p.label}`} />
  )
}

export function StatusDot({ status, size = 8 }: { status: Status; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: STATUS_META[status].dot }}
      aria-hidden
    />
  )
}

export function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md bg-raise px-1.5 py-0.5 text-xs font-medium', m.text)}>
      <StatusDot status={status} />
      {m.label}
    </span>
  )
}
