'use client'

import { useEffect, useState } from 'react'
import { useProjects, useCreateIssue, type CreateIssueInput } from '@/lib/hooks'
import { useMembers } from '@/lib/hooks'
import { PRIORITIES, STATUSES, STATUS_META } from '@/lib/constants'
import { useUi } from '@/lib/store'
import type { Status } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui-dialog'

export function NewIssueDialog() {
  const state = useUi((s) => s.newIssue)
  const close = useUi((s) => s.closeNewIssue)
  const [wsId, setWsId] = useState('')

  useEffect(() => {
    if (!state) return
    const m = window.location.pathname.match(/^\/w\/([a-f0-9]{24})/)
    setWsId(m ? m[1] : '')
  }, [state])

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && close()}>
      {state && wsId && <NewIssueForm wsId={wsId} defaultStatus={state.defaultStatus} projectId={state.projectId} onDone={close} />}
    </Dialog>
  )
}

function NewIssueForm({
  wsId,
  defaultStatus,
  projectId,
  onDone
}: {
  wsId: string
  defaultStatus?: string
  projectId?: string
  onDone: () => void
}) {
  const projects = useProjects(wsId)
  const members = useMembers(wsId)
  const create = useCreateIssue(wsId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<Status>((defaultStatus as Status) ?? 'todo')
  const [priority, setPriority] = useState(0)
  const [assigneeId, setAssigneeId] = useState('')
  const [pid, setPid] = useState(projectId ?? '')

  useEffect(() => {
    if (!pid && projects.data?.items.length) setPid(projects.data.items[0].id)
  }, [projects.data, pid])

  function submit() {
    if (!title.trim() || !pid) return
    const input: CreateIssueInput = {
      projectId: pid,
      title: title.trim(),
      description,
      status,
      priority,
      assigneeId: assigneeId || null
    }
    create.mutate(input, { onSuccess: onDone })
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New issue</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Issue title"
          aria-label="Title"
          className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-lg font-medium outline-none placeholder:text-ink-faint focus:border-accent"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add description…"
          rows={3}
          aria-label="Description"
          className="w-full resize-none rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-accent"
        />

        <div className="grid grid-cols-2 gap-2.5">
          <Select label="Project" value={pid} onChange={setPid}>
            {(projects.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select label="Status" value={status} onChange={(v) => setStatus(v as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
          <Select label="Priority" value={String(priority)} onChange={(v) => setPriority(Number(v))}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          <Select label="Assignee" value={assigneeId} onChange={setAssigneeId}>
            <option value="">Unassigned</option>
            {(members.data?.items ?? []).map((m) =>
              m.user ? (
                <option key={m.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ) : null
            )}
          </Select>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-ink-faint">⌘↵ to create</span>
          <button
            type="submit"
            disabled={!title.trim() || !pid || create.isPending}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) {
                e.preventDefault()
                submit()
              }
            }}
            className="btn-primary px-4"
          >
            {create.isPending ? 'Creating…' : 'Create issue'}
          </button>
        </div>
      </form>
    </DialogContent>
  )
}

function Select({
  label,
  value,
  onChange,
  children
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-ink-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm outline-none focus:border-accent"
      >
        {children}
      </select>
    </label>
  )
}
