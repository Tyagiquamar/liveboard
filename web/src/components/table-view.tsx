'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useIssuesInfinite, useMembers, useUpdateIssue, useProjects } from '@/lib/hooks'
import { FilterBar, type FilterState } from './filter-bar'
import { PriorityIcon } from './badges'
import { PRIORITIES, STATUSES, STATUS_META } from '@/lib/constants'
import { useUi } from '@/lib/store'
import type { Issue, Member, Status } from '@/lib/types'
import { relTime } from '@/lib/utils'

export function TableView({ wsId }: { wsId: string }) {
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<FilterState>({ q: '', assigneeId: '', projectId: '', priority: '' })

  useEffect(() => {
    setFilters((f) => ({
      ...f,
      projectId: searchParams.get('project') ?? '',
      assigneeId: searchParams.get('assignee') ?? ''
    }))
  }, [searchParams])

  const query = useIssuesInfinite(wsId, {
    q: filters.q || undefined,
    assigneeId: filters.assigneeId || undefined,
    projectId: filters.projectId || undefined,
    priority: filters.priority === '' ? undefined : filters.priority
  })
  const update = useUpdateIssue(wsId)
  const openIssue = useUi((s) => s.openIssue)
  const members = useMembers(wsId)
  const projects = useProjects(wsId)

  const issues = query.data?.pages.flatMap((p) => p.items) ?? []

  function cyclePriority(issue: Issue) {
    update.mutate({ id: issue.id, patch: { priority: (issue.priority + 1) % 5 } })
  }

  return (
    <div className="flex h-full flex-col">
      <FilterBar wsId={wsId} filters={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label="Issue table">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-panel text-left text-xs uppercase tracking-wide text-ink-faint">
            <tr className="border-b border-line [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium">
              <th className="w-[45%]">Issue</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Assignee</th>
              <th>Project</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr
                key={issue.id}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openIssue(issue.id)
                }}
                onClick={() => openIssue(issue.id)}
                className="cursor-pointer border-b border-line/60 transition-colors hover:bg-hoverbg/50 focus-visible:bg-hoverbg"
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-accent">{issue.key}</span>
                    <span className="truncate">{issue.title}</span>
                  </div>
                  {issue.labels.length > 0 && (
                    <div className="mt-1 flex gap-1.5 pl-[calc(11px+8px+2ch)]">
                      {issue.labels.map((l) => (
                        <span key={l} className="rounded bg-hoverbg px-1.5 py-0.5 text-[10px] text-ink-muted">
                          {l}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={issue.status}
                    onChange={(e) => update.mutate({ id: issue.id, patch: { status: e.target.value as Status } })}
                    aria-label={`Status of ${issue.key}`}
                    className="rounded-md border-none bg-transparent p-0 text-xs outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => cyclePriority(issue)}
                    aria-label={`Priority: ${PRIORITIES[issue.priority].label}, click to change`}
                    title={`${PRIORITIES[issue.priority].label} — click to change`}
                    className="flex items-center gap-1.5 rounded px-1 py-1 hover:bg-hoverbg"
                  >
                    <PriorityIcon value={issue.priority} />
                    <span className="text-xs text-ink-muted">{PRIORITIES[issue.priority].label}</span>
                  </button>
                </td>
                <td className="px-3" onClick={(e) => e.stopPropagation()}>
                  <AssigneePicker issue={issue} members={members.data?.items ?? []} wsId={wsId} />
                </td>
                <td className="px-3 text-xs text-ink-muted">
                  {projects.data?.items.find((p) => p.id === issue.projectId)?.name ?? '—'}
                </td>
                <td className="px-3 text-xs text-ink-faint">{relTime(issue.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!query.isLoading && !issues.length && (
          <div className="p-10 text-center text-sm text-ink-muted">No issues match these filters.</div>
        )}

        {query.hasNextPage && (
          <div className="flex justify-center py-4">
            <button onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage} className="btn-ghost text-sm">
              {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function AssigneePicker({
  issue,
  members,
  wsId
}: {
  issue: Issue
  members: Member[]
  wsId: string
}) {
  void wsId
  const update = useUpdateIssue(issue.workspaceId)
  const current = members.find((m) => m.user?.id === issue.assigneeId)?.user

  return (
    <select
      value={issue.assigneeId ?? ''}
      onChange={(e) =>
        update.mutate({ id: issue.id, patch: { assigneeId: e.target.value || null } })
      }
      aria-label={`Assignee of ${issue.key}`}
      onClick={(e) => e.stopPropagation()}
      className="-mx-1 rounded bg-transparent p-1 text-xs outline-none hover:bg-hoverbg focus-visible:ring-1 focus-visible:ring-accent"
    >
      <option value="">Unassigned</option>
      {members.map((m) =>
        m.user ? (
          <option key={m.id} value={m.user.id}>
            {m.user.name}
          </option>
        ) : null
      )}
      <option value={issue.assigneeId ?? ''} hidden>
        {current?.name ?? ''}
      </option>
    </select>
  )
}
