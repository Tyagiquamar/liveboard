'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { KanbanSquare, Table2, Activity, Plus, FolderKanban, UserPlus } from 'lucide-react'
import { useMembers, useProjects, useCreateProject, useAddMember } from '@/lib/hooks'
import { useUi } from '@/lib/store'
import { Avatar } from './avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui-dialog'

export function Sidebar({ wsId }: { wsId: string }) {
  const pathname = usePathname()
  const projects = useProjects(wsId)
  const members = useMembers(wsId)
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  void setProjectFilter

  const views = [
    { href: `/w/${wsId}/board`, label: 'Board', icon: KanbanSquare },
    { href: `/w/${wsId}/table`, label: 'Table', icon: Table2 },
    { href: `/w/${wsId}/activity`, label: 'Activity', icon: Activity }
  ]

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-panel md:flex">
      <nav className="p-2" aria-label="Views">
        {views.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                active ? 'bg-accent/15 text-accent' : 'text-ink-muted hover:bg-hoverbg hover:text-ink'
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-3 px-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Projects</span>
          <button
            onClick={() => useUi.getState().setCreateProjectOpen(true)}
            className="rounded p-0.5 text-ink-faint hover:bg-hoverbg hover:text-ink"
            aria-label="New project"
          >
            <Plus size={13} />
          </button>
        </div>
        {(projects.data?.items ?? []).map((p) => (
          <Link
            key={p.id}
            href={`/w/${wsId}/board?project=${p.id}`}
            className="mb-0.5 flex items-center gap-2 rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-hoverbg hover:text-ink"
          >
            <FolderKanban size={13} className="text-ink-faint" />
            <span className="truncate">{p.name}</span>
          </Link>
        ))}
        {!projects.data?.items.length && !projects.isLoading && (
          <p className="px-2 py-1 text-xs text-ink-faint">No projects yet</p>
        )}
      </div>

      <div className="mt-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Team</span>
          <button
            onClick={() => useUi.getState().setInviteOpen(true)}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-ink-faint hover:text-ink"
            aria-label="Invite member"
          >
            <UserPlus size={12} /> Invite
          </button>
        </div>
        <ul className="space-y-1.5">
          {(members.data?.items ?? []).map((m) =>
            m.user ? (
              <li key={m.id} className="flex items-center gap-2 text-sm text-ink-muted">
                <Avatar name={m.user.name} username={m.user.username} color={m.user.color} size={20} />
                <span className="truncate">{m.user.name}</span>
                {m.role === 'owner' && <span className="ml-auto text-[10px] text-ink-faint">owner</span>}
              </li>
            ) : null
          )}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-[10px] leading-relaxed text-ink-faint">
          ⌘K commands · ? shortcuts
        </p>
      </div>

      <NewProjectDialog wsId={wsId} />
      <InviteDialog wsId={wsId} />
    </aside>
  )
}

function NewProjectDialog({ wsId }: { wsId: string }) {
  const open = useUi((s) => s.createProjectOpen)
  const setOpen = useUi((s) => s.setCreateProjectOpen)
  const create = useCreateProject(wsId)
  const [name, setName] = useState('')

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setName('')
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            create.mutate({ name: name.trim() }, { onSuccess: () => setOpen(false) })
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Platform"
            aria-label="Project name"
            className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-base outline-none placeholder:text-ink-faint focus:border-accent"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim() || create.isPending} className="btn-primary px-4">
              Create
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function InviteDialog({ wsId }: { wsId: string }) {
  const open = useUi((s) => s.inviteOpen)
  const setOpen = useUi((s) => s.setInviteOpen)
  const addMember = useAddMember(wsId)
  const [username, setUsername] = useState('')

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setUsername('')
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!username.trim()) return
            addMember.mutate({ username: username.trim() }, { onSuccess: () => setOpen(false) })
          }}
        >
          <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="invite-username">
            Username
          </label>
          <div className="flex gap-2">
            <span className="inline-flex items-center rounded-md border border-r-0 border-line bg-canvas px-2 text-sm text-ink-faint">@</span>
            <input
              id="invite-username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              pattern="[a-z0-9_]{2,24}"
              placeholder="bob"
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-base outline-none placeholder:text-ink-faint focus:border-accent"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-ink-faint">Users must have an account. Try “alice”, “bob” or “carol”.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={!username.trim() || addMember.isPending} className="btn-primary px-4">
              Add member
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
