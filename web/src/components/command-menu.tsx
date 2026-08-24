'use client'

import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useMembers, useWorkspaces } from '@/lib/hooks'
import { useSession, useUi } from '@/lib/store'
import type { Issue } from '@/lib/types'
import { api } from '@/lib/api'
import { StatusDot } from './badges'

export function CommandMenu() {
  const open = useUi((s) => s.commandOpen)
  const preset = useUi((s) => s.commandPresetQuery)
  const setOpen = useUi((s) => s.setCommandOpen)
  const openIssue = useUi((s) => s.openIssue)
  const openNewIssue = useUi((s) => s.openNewIssue)
  const setInvite = useUi((s) => s.setInviteOpen)
  const setProject = useUi((s) => s.setCreateProjectOpen)
  const setShortcuts = useUi((s) => s.setShortcutsOpen)
  const me = useSession((s) => s.me)
  const router = useRouter()

  const [q, setQ] = useState('')
  const [results, setResults] = useState<Issue[]>([])
  const workspaces = useWorkspaces()
  const pathWsId = useMemo(() => {
    if (typeof window === 'undefined') return null
    const m = window.location.pathname.match(/^\/w\/([a-f0-9]{24})/)
    return m ? m[1] : null
  }, [open])
  const members = useMembers(pathWsId ?? '')

  useEffect(() => {
    if (open) setQ(preset)
  }, [open, preset])

  useEffect(() => {
    if (!pathWsId || q.trim().length < 2) {
      setResults([])
      return
    }
    const term = q.trim()
    let stale = false
    const t = setTimeout(async () => {
      try {
        const res = await api<{ items: Issue[] }>(
          `/workspaces/${pathWsId}/issues?q=${encodeURIComponent(term)}&limit=8`
        )
        if (!stale) setResults(res.items)
      } catch {
        void term
      }
    }, 220)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, pathWsId])

  function go(path: string) {
    setOpen(false)
    router.push(path)
  }

  if (!me) return null

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => setOpen(o)}
      label="Command menu"
      className="fixed left-1/2 top-24 z-[60] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
      shouldFilter={!pathWsId || q.length < 2}
    >
      <Command.Input
        value={q}
        onValueChange={setQ}
        autoFocus
        placeholder="Search issues or run a command…"
        className="w-full border-b border-line bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-ink-faint"
      />
      <Command.List className="max-h-80 overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-xs text-ink-faint">No matches</Command.Empty>

        {pathWsId && (
          <Command.Group heading={<GroupLabel>Actions</GroupLabel>}>
            <Item onSelect={() => (setOpen(false), openNewIssue({}))}>New issue</Item>
            <Item onSelect={() => (setOpen(false), setProject(true))}>New project</Item>
            <Item onSelect={() => (setOpen(false), setInvite(true))}>Invite member</Item>
            <Item onSelect={() => (setOpen(false), setShortcuts(true))}>Keyboard shortcuts</Item>
          </Command.Group>
        )}

        {pathWsId && (
          <Command.Group heading={<GroupLabel>Go to</GroupLabel>}>
            <Item onSelect={() => go(`/w/${pathWsId}/board`)}>Board view</Item>
            <Item onSelect={() => go(`/w/${pathWsId}/table`)}>Table view</Item>
            <Item onSelect={() => go(`/w/${pathWsId}/activity`)}>Activity feed</Item>
          </Command.Group>
        )}

        {results.length > 0 && (
          <Command.Group heading={<GroupLabel>Issues · “{q}”</GroupLabel>}>
            {results.map((i) => (
              <Item key={i.id} value={`issue-${i.key}-${i.title}`} onSelect={() => (setOpen(false), openIssue(i.id))}>
                <span className="flex items-center gap-2">
                  <StatusDot status={i.status} />
                  <span className="font-mono text-[11px] text-ink-faint">{i.key}</span>
                  <span className="truncate">{i.title}</span>
                </span>
              </Item>
            ))}
          </Command.Group>
        )}

        {(workspaces.data?.items.length ?? 0) > 1 && (
          <Command.Group heading={<GroupLabel>Workspaces</GroupLabel>}>
            {workspaces.data!.items.map((ws) => (
              <Item key={ws.id} onSelect={() => go(`/w/${ws.id}/board`)}>
                {ws.name}
              </Item>
            ))}
          </Command.Group>
        )}

        {members.data && members.data.items.length > 0 && pathWsId && (
          <Command.Group heading={<GroupLabel>Assigned to</GroupLabel>}>
            {members.data.items.map((m) =>
              m.user ? (
                <Item
                  key={m.id}
                  onSelect={() => go(`/w/${pathWsId}/board?assignee=${m.user!.id}`)}
                >
                  @{m.user.username}
                </Item>
              ) : null
            )}
          </Command.Group>
        )}
      </Command.List>
      <div className="border-t border-line px-3 py-1.5 text-[10px] text-ink-faint">
        ↑↓ navigate · ↵ select · esc close
      </div>
    </Command.Dialog>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{children}</div>
}

function Item({
  children,
  onSelect,
  value
}: {
  children: React.ReactNode
  onSelect: () => void
  value?: string
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink-muted transition-colors data-[selected=true]:bg-hoverbg data-[selected=true]:text-ink"
    >
      {children}
    </Command.Item>
  )
}
