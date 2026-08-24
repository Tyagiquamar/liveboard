'use client'

import { useActivity } from '@/lib/hooks'
import type { ActivityEvent, Issue } from '@/lib/types'
import { STATUS_META } from '@/lib/constants'
import { relTime } from '@/lib/utils'

function describe(ev: ActivityEvent): string {
  const data = ev.data as Record<string, unknown>
  switch (ev.type) {
    case 'issue.created':
      return 'created this issue'
    case 'issue.updated': {
      const changes = (data.changes ?? {}) as Record<string, unknown>
      if ('status' in changes && typeof changes.status === 'string') {
        return `moved to ${STATUS_META[changes.status as keyof typeof STATUS_META]?.label ?? String(changes.status)}`
      }
      if ('title' in changes) return 'renamed the issue'
      if ('assigneeId' in changes) return changes.assigneeId ? 'assigned a teammate' : 'unassigned'
      if ('priority' in changes) return `set priority to ${String(changes.priority)}`
      if ('labels' in changes) return 'updated labels'
      return 'updated details'
    }
    case 'comment.created':
      return 'left a comment'
    default:
      return ev.type
  }
}

export function ActivityFeedInline({ wsId, issueId }: { wsId: string; issueId: string }) {
  const activity = useActivity(wsId)
  const items =
    (activity.data?.pages.flatMap((p) => p.items) ?? []).filter(
      (e) => e.entityId === issueId && ['issue.created', 'issue.updated', 'comment.created'].includes(e.type)
    ) ?? []

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-label="Issue activity">
      <ol className="space-y-2.5">
        {items.map((ev) => (
          <li key={ev.id} className="flex items-baseline gap-2 text-xs">
            <span className="font-medium" style={{ color: ev.actor.color }}>
              {ev.actor.name}
            </span>
            <span className="text-ink-muted">{describe(ev)}</span>
            <time className="ml-auto shrink-0 text-[10px] text-ink-faint">{relTime(ev.ts)}</time>
          </li>
        ))}
      </ol>
      {!items.length && !activity.isLoading && (
        <p className="pt-6 text-center text-xs text-ink-faint">No history yet.</p>
      )}
    </div>
  )
}
