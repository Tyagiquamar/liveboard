'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWorkspaces, useCreateWorkspace } from '@/lib/hooks'
import { useSession, useUi } from '@/lib/store'
import { Avatar } from '@/components/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui-dialog'
import { useState } from 'react'

export default function WorkspacesPage() {
  const router = useRouter()
  const token = useSession((s) => s.token)
  const me = useSession((s) => s.me)
  const workspaces = useWorkspaces()
  const openCreate = useUi((s) => s.setCreateWorkspaceOpen)

  useEffect(() => {
    if (!token && !localStorage.getItem('lb_token')) router.replace('/login')
  }, [token, router])

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={me?.name ?? '?'} username={me?.username} size={32} />
          <div>
            <div className="text-sm font-semibold">{me?.name}</div>
            <div className="text-xs text-ink-faint">@{me?.username}</div>
          </div>
        </div>
        <button
          onClick={() => openCreate(true)}
          className="btn-primary"
        >
          New workspace
        </button>
      </header>

      <h1 className="mb-4 text-xl font-semibold tracking-tight">Your workspaces</h1>

      {workspaces.isLoading ? (
        <div className="space-y-3">
          <div className="skeleton h-20" />
          <div className="skeleton h-20" />
        </div>
      ) : !workspaces.data?.items.length ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <p className="text-sm text-ink-muted">No workspaces yet.</p>
          <p className="mt-1 text-xs text-ink-faint">Create one to start collaborating in real time.</p>
          <button onClick={() => openCreate(true)} className="btn-primary mt-4">
            Create workspace
          </button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {workspaces.data.items.map((ws) => (
            <li key={ws.id}>
              <Link
                href={`/w/${ws.id}/board`}
                className="group block rounded-xl border border-line bg-panel p-5 transition-colors hover:border-accent/60 hover:bg-raise"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-sm font-bold text-accent">
                  {ws.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="mt-3 font-medium">{ws.name}</div>
                <div className="text-xs text-ink-faint">/{ws.slug}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateWorkspaceDialog />
    </div>
  )
}

function CreateWorkspaceDialog() {
  const open = useUi((s) => s.createWorkspaceOpen)
  const setOpen = useUi((s) => s.setCreateWorkspaceOpen)
  const create = useCreateWorkspace()
  const [name, setName] = useState('')
  const router = useRouter()

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setName('')
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            create.mutate({ name: name.trim() }, {
              onSuccess: (ws) => {
                setOpen(false)
                router.push(`/w/${ws.id}/board`)
              }
            })
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc"
            aria-label="Workspace name"
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
