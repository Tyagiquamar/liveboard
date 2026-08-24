export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const PALETTE = [
  '#f97316', '#22c55e', '#06b6d4', '#6366f1', '#a855f7',
  '#ec4899', '#ef4444', '#14b8a6', '#eab308', '#3b82f6'
]

export function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'ws'
  )
}

export function projectKeyFrom(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return (letters.slice(0, 4) || 'PROJ').padEnd(2, 'X')
}
