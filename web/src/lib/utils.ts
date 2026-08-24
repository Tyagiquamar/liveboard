import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const REL_UNITS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [60, 'second'],
  [3600, 'minute'],
  [86400, 'hour'],
  [604800, 'day'],
  [2629800, 'week'],
  [31557600, 'month'],
  [Infinity, 'year']
]

export function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = (then - Date.now()) / 1000
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  let prev = 1
  for (const [limit, unit] of REL_UNITS) {
    if (abs < limit) return rtf.format(Math.round(diff / prev), unit)
    prev = limit
  }
  return ''
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const ORDER_STEP = 1024

export function orderForIndex(sortedOrders: number[], index: number): number {
  const prev = index > 0 ? sortedOrders[index - 1] : undefined
  const next = sortedOrders[index] ?? undefined
  if (prev === undefined && next === undefined) return -ORDER_STEP
  if (prev === undefined) return next! - ORDER_STEP
  if (next === undefined) return prev + ORDER_STEP
  return (prev + next) / 2
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: ReturnType<typeof setTimeout> | null = null
  return (...a: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `req-${Math.random().toString(36).slice(2)}-${Date.now()}`
}
