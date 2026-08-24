'use client'

import { MessageSquare, GripVertical } from 'lucide-react'
import { useMembers } from '@/lib/hooks'
import { useUi, useSession } from '@/lib/store'
import type { Issue } from '@/lib/types'
import { cn, relTime } from '@/lib/utils'
import { Avatar } from './avatar'
import { PriorityIcon } from './badges'

export function IssueCard({ issue }: { issue: Issue }) {
  const openIssue = useUi((s) => s.openIssue)
  const members = useMembers(issue.workspaceId)
  const me = useSession((s) => s.me)

  const assignee = (members.data?.items ?? []).find((m) => m.user?.id === issue.assigneeId)?.user
  const pending = issue.pending

  function onClick(e: React.MouseEvent) {
    if (e.detail === 0) return
    openIssue(issue.id)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      openIssue(issue.id)
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open ${issue.key}: ${issue.title}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        'group cursor-pointer rounded-lg border border-line bg-panel p-3 transition-all hover:border-accent/50 hover:bg-raise focus-visible:border-accent',
        pending && 'opacity-60 ring-1 ring-warn/40'
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
          <GripVertical size={12} />
        </span>
        <p className={cn('flex-1 text-sm leading-snug', pending && 'italic')}>{issue.title}</p>
        {issue.priority > 0 && <PriorityIcon value={issue.priority} />}
      </div>

      <div className="mt-2.5 flex items-center gap-2 pl-[18px]">
        <span className="font-mono text-[11px] text-accent">{issue.key || '···'}</span>
        {issue.labels.slice(0, 2).map((l) => (
          <span key={l} className="rounded bg-hoverbg px-1.5 py-0.5 text-[10px] text-ink-muted">
            {l}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2">
          {issue.commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-ink-faint" title={`${issue.commentCount} comments`}>
              <MessageSquare size={11} />
              {issue.commentCount}
            </span>
          )}
          {!pending && <time className="text-[10px] text-ink-faint">{relTime(issue.updatedAt)}</time>}
          {assignee ? (
            <Avatar name={assignee.name} color={assignee.color} size={20} />
          ) : me ? (
            <Avatar name="" color="#26272e" size={20} />
          ) : null}
        </span>
      </div>
    </article>
  )
}
