'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAllIssues } from '@/lib/hooks'
import { FilterBar, type FilterState } from './filter-bar'
import { KanbanBoard } from './kanban-board'
import { Plus } from 'lucide-react'
import { useUi } from '@/lib/store'

export function BoardView({ wsId }: { wsId: string }) {
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<FilterState>({
    q: '',
    assigneeId: '',
    projectId: '',
    priority: ''
  })

  useEffect(() => {
    setFilters((f) => ({
      ...f,
      projectId: searchParams.get('project') ?? '',
      assigneeId: searchParams.get('assignee') ?? ''
    }))
  }, [searchParams])

  const issues = useAllIssues(wsId, {
    q: filters.q || undefined,
    assigneeId: filters.assigneeId || undefined,
    projectId: filters.projectId || undefined,
    priority: filters.priority === '' ? undefined : filters.priority
  })

  const openNew = useUi((s) => s.openNewIssue)

  return (
    <div className="flex h-full flex-col">
      <FilterBar wsId={wsId} filters={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1">
        {issues.isLoading ? (
          <div className="grid grid-cols-2 gap-3 p-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 rounded-xl border border-line bg-panel/50 p-2">
                <div className="skeleton h-4 w-20" />
                <div className="skeleton h-16" />
                <div className="skeleton h-16" />
              </div>
            ))}
          </div>
        ) : issues.isError ? (
          <div className="flex h-full items-center justify-center text-sm text-danger">
            Failed to load issues. Retrying…
          </div>
        ) : issues.data ? (
          <KanbanBoard issues={issues.data} />
        ) : null}
      </div>
      <button
        onClick={() => openNew({})}
        className="btn-primary fixed bottom-5 right-5 z-40 gap-1.5 shadow-xl md:hidden"
        aria-label="New issue"
      >
        <Plus size={14} /> New
      </button>
    </div>
  )
}

function EmptyBoard() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <h2 className="text-lg font-semibold">Nothing here yet</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          Press <kbd className="rounded border border-line bg-raise px-1.5 py-0.5 font-mono text-xs">c</kbd> to create your
          first issue, or hit ⌘K for commands.
        </p>
      </div>
    </div>
  )
}
