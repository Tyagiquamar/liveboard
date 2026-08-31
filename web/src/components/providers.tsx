'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@radix-ui/react-tooltip'
import { attachEventListener } from '@/lib/events'
import { flushOutbox } from '@/lib/api'
import { lbs } from '@/lib/socket'
import { useConn, useSession } from '@/lib/store'
import { CommandMenu } from '@/components/command-menu'
import { NewIssueDialog } from '@/components/new-issue-dialog'
import { ShortcutsDialog } from '@/components/shortcuts-dialog'
import { Toaster } from '@/components/toaster'

function GlobalConnBanner() {
  const status = useConn((s) => s.status)
  if (status === 'online') return null
  const map = {
    connecting: { text: 'Reconnecting…', cls: 'bg-warn/15 text-warn border-warn/30' },
    waking: { text: 'Starting demo backend — free tier may take ~1 min to wake…', cls: 'bg-warn/15 text-warn border-warn/30' },
    offline: { text: "You're offline — edits are queued", cls: 'bg-danger/10 text-danger border-danger/30' },
    error: { text: 'Connection problem — retrying', cls: 'bg-danger/10 text-danger border-danger/30' }
  } as const
  const m = map[status]
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 bottom-3 z-[70] mx-auto flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-lg ${m.cls}`}
    >
      <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-current" />
      {m.text}
    </div>
  )
}

function Bootstrap() {
  const token = useSession((s) => s.token)

  useEffect(() => {
    useSession.getState().markHydrated()
    if (!token) return
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('bad')
        const data = await r.json()
        useSession.getState().setAuth(token, data.user)
      })
      .catch(() => {
        useSession.getState().setAuth(null, null)
      })
  }, [token])

  useEffect(() => {
    if (!token) return
    lbs.connect(token)
    const { queryClient } = window as unknown as { queryClient?: QueryClient }
    let detach: (() => void) | undefined
    if (queryClient) detach = attachEventListener(queryClient)
    const onOnline = () => void flushOutbox()
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      detach?.()
    }
  }, [token])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15000,
            retry: (count, err) => {
              if (err instanceof Error && err.message === 'network_unreachable') return count < 4
              return count < 2
            },
            refetchOnWindowFocus: true
          }
        }
      })
  )

  useEffect(() => {
    ;(window as unknown as { queryClient?: QueryClient }).queryClient = queryClient
  }, [queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <Bootstrap />
        {children}
        <GlobalConnBanner />
        <CommandMenu />
        <NewIssueDialog />
        <ShortcutsDialog />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
