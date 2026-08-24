'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useIssue, useUpdateIssue, useDeleteIssue, useMembers, useActivity } from '@/lib/hooks'
import { lbs } from '@/lib/socket'
import { markDirty, clearDirty, useRealtime, useSession, useUi, useToasts } from '@/lib/store'
import { PRIORITIES, STATUSES, STATUS_META } from '@/lib/constants'
import type { Issue, Status } from '@/lib/types'
import { cn, relTime } from '@/lib/utils'
import { Avatar } from './avatar'
import { CommentsPanel } from './comments-panel'
import { ActivityFeedInline } from './activity-inline'

const selectCls =
  'w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm outline-none focus:border-accent'

export function IssueDetail({ wsId, issueId }: { wsId: string; issueId: string }) {
  const query = useIssue(issueId)
  const update = useUpdateIssue(wsId)
  const del = useDeleteIssue(wsId)
  const members = useMembers(wsId)
  const me = useSession((s) => s.me)
  const closeIssue = useUi((s) => s.closeIssue)
  const viewers = useRealtime((s) => s.viewers[issueId])

  const issue = query.data

  useEffect(() => {
    lbs.viewIssue(wsId, issueId)
    return () => lbs.blurIssue()
  }, [wsId, issueId])

  if (!issue) {
    return (
      <div className="space-y-3 p-5">
        <div className="skeleton h-6 w-24" />
        <div className="skeleton h-8 w-3/4" />
        <div className="skeleton h-24" />
      </div>
    )
  }

  function save(patch: Partial<Issue>, guard = false) {
    update.mutate({
      id: issue!.id,
      patch,
      ...(guard ? { baseVersion: issue!.version } : {})
    })
  }

  const others = (viewers ?? []).filter((v) => v.id !== me?.id)
  const youHere = (viewers ?? []).some((v) => v.id === me?.id)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-5 py-3">
        <span className="font-mono text-xs text-accent">{issue.key}</span>
        <span className="text-xs text-ink-faint">·</span>
        <span className="text-xs text-ink-faint">v{issue.version}</span>

        <span className="ml-auto flex items-center -space-x-1.5" aria-label={`${viewers?.length ?? 0} viewing`}>
          {youHere && (
            <span className="mr-1 text-[10px] text-accent" aria-hidden>
              You
            </span>
          )}
          {others.slice(0, 4).map((v) => (
            <Avatar key={v.id} name={v.name} color={v.color} size={20} ring />
          ))}
          {others.length > 0 && (
            <span className="sr-only">{others.map((o) => o.name).join(', ')} viewing now</span>
          )}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-5 pb-2">
          <EditableTitle issue={issue} onSave={(title) => save({ title }, true)} />
          <EditableDescription issue={issue} onSave={(description) => save({ description }, true)} />

          <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-line bg-canvas/50 p-3">
            <label className="text-xs">
              <span className="mb-1 block font-medium text-ink-muted">Status</span>
              <select value={issue.status} onChange={(e) => save({ status: e.target.value as Status })} className={selectCls} aria-label="Status">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs">
              <span className="mb-1 block font-medium text-ink-muted">Priority</span>
              <select value={issue.priority} onChange={(e) => save({ priority: Number(e.target.value) })} className={selectCls} aria-label="Priority">
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs">
              <span className="mb-1 block font-medium text-ink-muted">Assignee</span>
              <select
                value={issue.assigneeId ?? ''}
                onChange={(e) => save({ assigneeId: e.target.value || null })}
                className={selectCls}
                aria-label="Assignee"
              >
                <option value="">Unassigned</option>
                {(members.data?.items ?? []).map((m) =>
                  m.user ? (
                    <option key={m.id} value={m.user.id}>
                      {m.user.name}
                    </option>
                  ) : null
                )}
              </select>
            </label>

            <div className="text-xs">
              <span className="mb-1 block font-medium text-ink-muted">Labels</span>
              <LabelEditor issue={issue} onSave={(labels) => save({ labels })} />
            </div>

            <p className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2 text-[11px] text-ink-faint">
              <span>Created {relTime(issue.createdAt)}</span>
              <span>Updated {relTime(issue.updatedAt)}</span>
              <span>{issue.commentCount} comments</span>
              <button
                onClick={() => {
                  del.mutate(
                    { id: issue.id },
                    { onSuccess: () => closeIssue() }
                  )
                }}
                className="ml-auto text-danger/80 hover:text-danger"
              >
                Delete issue
              </button>
            </p>
          </div>
        </div>

        <div className="flex min-h-[280px] flex-col" style={{ height: 'calc(100vh - 420px)', minHeight: 320 }}>
          <Tabs wsId={wsId} issueId={issueId} />
        </div>
      </div>
    </div>
  )
}

function Tabs({ wsId, issueId }: { wsId: string; issueId: string }) {
  const [tab, setTab] = useState<'comments' | 'activity'>('comments')
  return (
    <>
      <div role="tablist" aria-label="Issue detail tabs" className="flex gap-1 border-b border-line px-5">
        {(['comments', 'activity'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-xs font-medium capitalize transition-colors',
              tab === t ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'comments' ? (
        <CommentsPanel wsId={wsId} issueId={issueId} />
      ) : (
        <ActivityFeedInline wsId={wsId} issueId={issueId} />
      )}
    </>
  )
}

function EditableTitle({ issue, onSave }: { issue: Issue; onSave: (title: string) => void }) {
  const [value, setValue] = useState(issue.title)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setValue(issue.title)
  }, [issue.title])

  function onChange(v: string) {
    setValue(v)
    markDirty(issue.id)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const trimmed = v.trim()
      if (trimmed && trimmed !== issue.title) {
        onSave(trimmed)
        setTimeout(() => clearDirty(issue.id), 600)
      }
    }, 700)
  }

  return (
    <textarea
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => timer.current && clearTimeout(timer.current)}
      aria-label="Issue title"
      className="-mx-2 mt-2 w-full resize-none rounded-md bg-transparent px-2 py-1 text-xl font-semibold leading-snug outline-none transition-colors hover:bg-hoverbg/40 focus:bg-canvas focus:ring-1 focus:ring-accent"
    />
  )
}

function EditableDescription({ issue, onSave }: { issue: Issue; onSave: (d: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(issue.description)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!editing) setValue(issue.description)
  }, [issue.description, editing])

  function commit() {
    setEditing(false)
    if (timer.current) clearTimeout(timer.current)
    if (value.trim() !== issue.description.trim()) onSave(value)
  }

  if (!editing) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Edit description"
        onClick={() => setEditing(true)}
        onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
        className="mt-2 min-h-[44px] cursor-text whitespace-pre-wrap rounded-md px-2 py-1.5 text-sm leading-relaxed text-ink-muted transition-colors hover:bg-hoverbg/40"
      >
        {issue.description || <span className="text-ink-faint italic">Add a description…</span>}
      </div>
    )
  }

  return (
    <textarea
      autoFocus
      rows={5}
      value={value}
      onChange={(e) => {
        setValue(e.target.value)
        markDirty(issue.id)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
      aria-label="Description editor"
      className="mt-2 w-full resize-none rounded-md border border-accent/60 bg-canvas px-2 py-1.5 text-sm leading-relaxed outline-none"
    />
  )
}

function LabelEditor({ issue, onSave }: { issue: Issue; onSave: (labels: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(issue.labels.join(', '))

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Edit labels"
        className="flex w-full flex-wrap gap-1 rounded-md border border-line bg-canvas px-2 py-1.5 text-left hover:border-accent/60"
      >
        {issue.labels.length ? (
          issue.labels.map((l) => (
            <span key={l} className="rounded bg-hoverbg px-1.5 py-0.5 text-[10px] text-ink-muted">
              {l}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-ink-faint">None</span>
        )}
      </button>
    )
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        setOpen(false)
        const labels = value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10)
        if (JSON.stringify(labels) !== JSON.stringify(issue.labels)) onSave(labels)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder="bug, frontend"
      aria-label="Labels, comma separated"
      className="w-full rounded-md border border-accent/60 bg-canvas px-2 py-1.5 text-xs outline-none"
    />
  )
}
