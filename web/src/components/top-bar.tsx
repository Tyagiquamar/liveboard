'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Search, LogOut, Wifi, WifiOff, RefreshCw, Circle } from 'lucide-react'
import { useWorkspaces, useMembers } from '@/lib/hooks'
import { useConn, useOutbox, useRealtime, useSession, useUi } from '@/lib/store'
import { flushOutbox } from '@/lib/api'
import { Avatar } from './avatar'

export function TopBar({ wsId }: { wsId: string }) {
  const router = useRouter()
  const me = useSession((s) => s.me)
  const setAuth = useSession((s) => s.setAuth)
  const workspaces = useWorkspaces()
  const members = useMembers(wsId)
  const presence = useRealtime((s) => s.presence[wsId])
  const conn = useConn((s) => s.status)
  const outboxCount = useOutbox((s) => s.items.length)
  const setCommand = useUi((s) => s.setCommandOpen)

  const current = workspaces.data?.items.find((w) => w.id === wsId)

  const onlineOthers = (presence ?? []).filter(
    (p) => p.id !== me?.id || true
  )

  function logout() {
    setAuth(null, null)
    router.replace('/login')
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <Link href="/w" className="flex items-center gap-2 rounded-md px-1 py-0.5" aria-label="All workspaces">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-white">L</span>
      </Link>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-hoverbg">
            <span className="truncate">{current?.name ?? 'Workspace'}</span>
            <ChevronDown size={13} className="shrink-0 text-ink-faint" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content sideOffset={6} align="start" className="menu">
            {workspaces.data?.items.map((ws) => (
              <DropdownMenu.Item key={ws.id} asChild>
                <Link href={`/w/${ws.id}/board`} className="menu-item">
                  {ws.name}
                  {ws.id === wsId && <span className="ml-auto text-accent">•</span>}
                </Link>
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item asChild>
              <Link href="/w" className="menu-item text-ink-muted">
                All workspaces…
              </Link>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <button
        onClick={() => setCommandOpenWithSearch(setCommand)}
        className="ml-2 hidden min-w-52 items-center gap-2 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink-faint transition-colors hover:border-accent/50 sm:flex"
        aria-label="Search issues"
      >
        <Search size={13} />
        <span className="flex-1 text-left">Search issues…</span>
        <kbd className="rounded border border-line bg-panel px-1 font-mono text-[10px]">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          onClick={() => void flushOutbox()}
          title={`${outboxCount} change(s) waiting to sync`}
          aria-label={`Pending changes: ${outboxCount}`}
          className={`hidden rounded-md border px-2 py-0.5 text-xs transition-opacity sm:block ${
            outboxCount > 0 ? 'border-warn/40 bg-warn/10 text-warn' : 'border-transparent text-transparent'
          }`}
        >
          {outboxCount} queued
        </button>

        <ConnBadge status={conn} />

        <div className="flex -space-x-1.5" aria-label={`${onlineOthers.length} online`}>
          {(presence ?? []).slice(0, 5).map((u) => (
            <Avatar key={u.id} name={u.name} color={u.color} ring size={22} />
          ))}
          {(presence ?? []).length > 5 && (
            <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-hoverbg text-[10px] font-semibold text-ink-muted ring-2 ring-panel">
              +{(presence ?? []).length - 5}
            </span>
          )}
          {!presence && (
            <>
              {(members.data?.items ?? []).slice(0, 4).map((m) =>
                m.user ? <Avatar key={m.id} name={m.user.name} color={m.user.color} ring size={22} className="opacity-50" /> : null
              )}
            </>
          )}
        </div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button aria-label="Account menu" className="rounded-full focus-visible:outline-accent">
              <Avatar name={me?.name ?? '?'} size={26} color={me?.color} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="menu">
              <div className="border-b border-line px-3 py-2 text-xs text-ink-faint">@{me?.username}</div>
              <DropdownMenu.Item onSelect={logout} className="menu-item">
                <LogOut size={13} /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}

function ConnBadge({ status }: { status: string }) {
  if (status === 'online')
    return (
      <span className="hidden items-center gap-1.5 text-xs text-ok md:flex" role="status" title="Live connection active">
        <Circle size={8} fill="currentColor" strokeWidth={0} />
        Live
      </span>
    )
  return (
    <span
      role="status"
      title={`Connection: ${status}`}
      className={`hidden items-center gap-1.5 text-xs md:flex ${status === 'offline' || status === 'error' ? 'text-danger' : 'text-warn'}`}
    >
      {status === 'connecting' ? (
        <RefreshCw size={12} className="animate-spin" />
      ) : status === 'offline' ? (
        <WifiOff size={12} />
      ) : (
        <Wifi size={12} />
      )}
      {status}
    </span>
  )
}

function setCommandOpenWithSearch(fn: (b: boolean, preset?: string) => void) {
  fn(true, '')
}

void useState
