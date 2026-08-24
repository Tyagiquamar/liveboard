'use client'

import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useMembers, useProjects } from '@/lib/hooks'
import { priorityMeta } from '@/lib/constants'

export interface FilterState {
  q: string
  assigneeId: string
  projectId: string
  priority: number | ''
}

const inputCls =
  'rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-accent'

export function FilterBar({
  wsId,
  filters,
  onChange,
  projectDisabled
}: {
  wsId: string
  filters: FilterState
  onChange: (f: FilterState) => void
  projectDisabled?: boolean
}) {
  const members = useMembers(wsId)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onFocus = () => inputRef.current?.focus()
    window.addEventListener('lb:focus-search', onFocus)
    return () => window.removeEventListener('lb:focus-search', onFocus)
  }, [])

  const dirty = filters.q || filters.assigneeId || (!projectDisabled && filters.projectId) || filters.priority !== ''

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel/60 px-3 py-2">
      <label className="relative">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          ref={inputRef}
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
          placeholder="Filter issues…"
          aria-label="Search and filter issues"
          className={`${inputCls} w-56 pl-8`}
        />
      </label>

      <select
        value={filters.assigneeId}
        onChange={(e) => onChange({ ...filters, assigneeId: e.target.value })}
        aria-label="Filter by assignee"
        className={inputCls}
      >
        <option value="">Anyone</option>
        {(members.data?.items ?? []).map((m) =>
          m.user ? (
            <option key={m.id} value={m.user.id}>
              {m.user.name}
            </option>
          ) : null
        )}
        <option value="none">Unassigned</option>
      </select>

      {!projectDisabled && <ProjectSelect wsId={wsId} filters={filters} onChange={onChange} />}

      <select
        value={String(filters.priority)}
        onChange={(e) => onChange({ ...filters, priority: e.target.value === '' ? '' : Number(e.target.value) })}
        aria-label="Filter by priority"
        className={inputCls}
      >
        <option value="">Any priority</option>
        {[4, 3, 2, 1, 0].map((p) => (
          <option key={p} value={p}>
            {priorityMeta(p).label}
          </option>
        ))}
      </select>

      {dirty ? (
        <button
          onClick={() => onChange({ q: '', assigneeId: '', projectId: '', priority: '' })}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-faint hover:text-ink"
        >
          <X size={12} /> Clear
        </button>
      ) : null}

      <span className="ml-auto hidden items-center gap-1 text-[10px] text-ink-faint sm:flex">
        press <kbd className="rounded border border-line px-1 font-mono">/</kbd> to focus
      </span>
    </div>
  )
}

function ProjectSelect({
  wsId,
  filters,
  onChange
}: {
  wsId: string
  filters: FilterState
  onChange: (f: FilterState) => void
}) {
  const projects = useProjects(wsId)
  return (
    <select
      value={filters.projectId}
      onChange={(e) => onChange({ ...filters, projectId: e.target.value })}
      aria-label="Filter by project"
      className={inputCls}
    >
      <option value="">All projects</option>
      {(projects.data?.items ?? []).map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )
}
