'use client'

import { useMemo, useRef, useState } from 'react'
import { useMembers } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import type { Member } from '@/lib/types'

interface MentionState {
  token: string
  start: number
}

export function MentionTextarea({
  wsId,
  value,
  onChange,
  onSubmit,
  onTyping,
  placeholder = 'Leave a comment… @mention teammates',
  disabled
}: {
  wsId: string
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  onTyping?: () => void
  placeholder?: string
  disabled?: boolean
}) {
  const members = useMembers(wsId)
  const [mention, setMention] = useState<MentionState | null>(null)
  const [hi, setHi] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)

  const candidates = useMemo(() => {
    if (!mention) return []
    const q = mention.token.toLowerCase()
    return (members.data?.items ?? [])
      .map((m) => m.user)
      .filter((u): u is NonNullable<Member['user']> => !!u && u.username.startsWith(q))
      .slice(0, 6)
  }, [mention, members.data])

  function detectMention(text: string, caret: number): MentionState | null {
    const before = text.slice(0, caret)
    const match = /(^|\s)@([a-z0-9_]*)$/i.exec(before)
    if (!match) return null
    const start = caret - match[2].length - 1
    return { token: match[2], start }
  }

  function applyMention(username: string) {
    if (!mention || !ref.current) return
    const el = ref.current
    const after = value.slice(el.selectionStart)
    const next = `${value.slice(0, mention.start)}@${username} ${after.replace(/^\s+/, '')}`
    onChange(next)
    setMention(null)
    setHi(0)
    requestAnimationFrame(() => {
      const pos = mention!.start + username.length + 2
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={3}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Comment"
        onChange={(e) => {
          onChange(e.target.value)
          onTyping?.()
          const st = detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
          setMention(st)
          setHi(0)
        }}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        onKeyDown={(e) => {
          if (mention && candidates.length) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHi((h) => (h + 1) % candidates.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHi((h) => (h - 1 + candidates.length) % candidates.length)
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              applyMention(candidates[hi].username)
              return
            }
            if (e.key === 'Escape') {
              setMention(null)
              return
            }
          }
          if (onSubmit && (e.metaKey || !e.shiftKey) && e.key === 'Enter' && !mention) {
            if (e.metaKey || !e.shiftKey) {
              e.preventDefault()
              onSubmit()
            }
          }
        }}
        className="w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-accent disabled:opacity-60"
      />

      {mention && candidates.length > 0 && (
        <ul
          role="listbox"
          aria-label="Member suggestions"
          className="absolute bottom-full left-3 z-20 mb-1 w-52 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-xl"
        >
          {candidates.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === hi}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  applyMention(u.username)
                }}
                onMouseEnter={() => setHi(i)}
                className={cn(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm',
                  i === hi ? 'bg-hoverbg text-ink' : 'text-ink-muted'
                )}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ background: u.color }}
                >
                  {u.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="font-medium">{u.username}</span>
                <span className="ml-auto text-[10px] text-ink-faint">{u.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
