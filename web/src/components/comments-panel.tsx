'use client'

import { useState } from 'react'
import { useComments, useAddComment, useMembers } from '@/lib/hooks'
import { lbs } from '@/lib/socket'
import { useRealtime, useSession } from '@/lib/store'
import type { Comment, Member } from '@/lib/types'
import { relTime } from '@/lib/utils'
import { MentionTextarea } from './mention-textarea'
import { Avatar } from './avatar'

export function CommentsPanel({ wsId, issueId }: { wsId: string; issueId: string }) {
  const comments = useComments(issueId)
  const add = useAddComment(issueId)
  const members = useMembers(wsId)
  const me = useSession((s) => s.me)
  const typingMap = useRealtime((s) => s.typing[`${wsId}:${issueId}`])
  const [draft, setDraft] = useState('')

  const items = [...(comments.data?.pages.flatMap((p) => p.items) ?? [])].reverse()
  const userById = new Map<string, NonNullable<Member['user']>>()
  for (const m of members.data?.items ?? []) {
    if (m.user) userById.set(m.user.id, m.user)
  }

  function submit() {
    const body = draft.trim()
    if (!body) return
    const mentionIds: string[] = []
    for (const [, username] of body.matchAll(/@([a-z0-9_]+)/gi)) {
      const hit = [...userById.values()].find(
        (u) => u.username.toLowerCase() === username.toLowerCase()
      )
      if (hit && !mentionIds.includes(hit.id)) mentionIds.push(hit.id)
    }
    setDraft('')
    lbs.emitTyping(wsId, issueId, false)
    add.mutate({ body, mentionIds })
  }

  const othersTyping = Object.entries(typingMap ?? {}).filter(([uid]) => uid !== me?.id)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-label="Comments">
        {comments.isLoading ? (
          <>
            <div className="skeleton h-14" />
            <div className="skeleton h-10 w-3/4" />
          </>
        ) : !items.length ? (
          <p className="pt-6 text-center text-xs text-ink-faint">
            No comments yet. Start the conversation — everything is live.
          </p>
        ) : (
          items.map((c) => (
            <CommentItem key={c.id} comment={c} author={userById.get(c.authorId)} />
          ))
        )}
      </div>

      <div className="border-t border-line p-3">
        {othersTyping.length > 0 && (
          <p className="mb-1.5 text-[11px] text-accent" aria-live="polite">
            {othersTyping.map(([, t]) => t.name).join(', ')}{' '}
            {othersTyping.length === 1 ? 'is' : 'are'} typing…
          </p>
        )}
        <MentionTextarea
          wsId={wsId}
          value={draft}
          onChange={setDraft}
          onTyping={() => lbs.emitTyping(wsId, issueId, true)}
          onSubmit={submit}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-ink-faint">↵ to post · shift+↵ newline</span>
          <button onClick={submit} disabled={!draft.trim() || add.isPending} className="btn-primary px-3 py-1 text-xs">
            Comment
          </button>
        </div>
      </div>
    </div>
  )
}

function renderBody(body: string): React.ReactNode[] {
  const parts = body.split(/(@[a-z0-9_]+\b)/gi)
  return parts.map((part, i) =>
    /^@[a-z0-9_]+$/i.test(part) ? (
      <span key={i} className="rounded bg-accent/15 px-1 font-medium text-accent">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

function CommentItem({ comment, author }: { comment: Comment; author?: Member['user'] }) {
  return (
    <article className="flex gap-2.5">
      <Avatar name={author?.name ?? '?'} color={author?.color} size={28} className="mt-0.5" />
      <div className="min-w-0 flex-1 rounded-lg bg-canvas px-3 py-2">
        <header className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{author?.name ?? 'Member'}</span>
          <time className="text-[10px] text-ink-faint">{relTime(comment.createdAt)}</time>
        </header>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-muted">
          {renderBody(comment.body)}
        </p>
      </div>
    </article>
  )
}
