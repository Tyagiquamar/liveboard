'use client'

import { useMemo } from 'react'
import { useActivity } from '@/lib/hooks'
import type { ActivityEvent, Issue } from '@/lib/types'
import { STATUS_META } from '@/lib/constants'
import { relTime } from '@/lib/utils'

const ICONS: Record<string, string> = {
  'issue.created': '＋',
  'issue.updated': '✎',
  'issue.deleted': '×',
  'comment.created': '💬',
  'project.created': '◇',
  'member.added': '＋'
}

function describe(ev: ActivityEvent): string {
  const data = ev.data as Record<string, unknown>
  switch (ev.type) {
    case 'issue.created':
      return `created ${(data.issue as Issue)?.key ?? 'an issue'}`
    case 'issue.updated': {
      const changes = (data.changes ?? {}) as Record<string, unknown>
      if ('status' in changes && typeof changes.status === 'string') {
        return `moved ${(data.issue as Issue)?.key ?? ''} to ${STATUS_META[changes.status as keyof typeof STATUS_META]?.label ?? changes.status}`
      }
      if ('title' in changes) return `renamed ${(data.issue as Issue)?.key ?? 'an issue'}`
      if ('assigneeId' in changes) return 'reassigned an issue'
      return 'updated an issue'
    }
    case 'issue.deleted':
      return `deleted ${String(data.issueId).slice(-6)}`
    case 'comment.created':
      return `commented on “${(data.issueTitle as string) ?? 'an issue'}”`
    case 'project.created':
      return `created project “${(data.project as { name?: string })?.name ?? ''}”`
    case 'member.added':
      return `added @${((data.member as { user?: { username?: string } })?.user?.username) ?? 'someone'}`
    default:
      return ev.type
  }
}

export function ActivityFeed({ wsId }: { wsId: string }) {
  const activity = useActivity(wsId)
  const items = useMemo(
    () => activity.data?.pages.flatMap((p) => p.items) ?? [],
    [activity.data]
  )

  return (
    <div className="mx-auto max-w-2xl p-4" role="feed" aria-label="Workspace activity">
      <h1 className="mb-4 text-lg font-semibold tracking-tight">Live activity</h1>

      {!items.length && !activity.isLoading ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-muted">
          Nothing yet — create issues, comment and invite teammates to see the stream light up.
        </p>
      ) : null}

      <ol className="relative space-y-0">
        <span aria-hidden className="absolute bottom-2 left-[13px] top-2 w-px bg-line" />
        {items.map((ev) => (
          <li key={ev.id} className="relative flex gap-3 py-2.5 pl-0">
            <span
              aria-hidden
              className="z-10 mt-0.5 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border border-line bg-panel text-xs"
              style={{ color: ev.actor.color }}
            >
              {ICONS[ev.type] ?? '•'}
            </span>
            <div className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3.5 py-2.5">
              <p className="text-sm leading-snug">
                <span className="font-medium" style={{ color: ev.actor.color }}>
                  {ev.actor.name}
                </span>{' '}
                <span className="text-ink-muted">{describe(ev)}</span>
              </p>
              <time className="mt-0.5 block text-[10px] text-ink-faint">{relTime(ev.ts)}</time>
            </div>
          </li>
        ))}
      </ol>

      {activity.hasNextPage && (
        <div className="flex justify-center py-4">
          <button onClick={() => void activity.fetchNextPage()} disabled={activity.isFetchingNextPage} className="btn-ghost">
            {activity.isFetchingNextPage ? 'Loading…' : 'Load earlier'}
          </button>
        </div>
      )}
    </div>
  )
}
