'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useHotkeys } from '@/lib/useHotkeys'
import { lbs } from '@/lib/socket'
import { useSession } from '@/lib/store'
import { TopBar } from '@/components/top-bar'
import { Sidebar } from '@/components/sidebar'
import { IssueDrawer } from '@/components/issue-drawer'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ wsId: string }>()
  const wsId = params.wsId
  const router = useRouter()
  const token = useSession((s) => s.token)

  useEffect(() => {
    if (!token && !localStorage.getItem('lb_token')) router.replace('/login')
  }, [token, router])

  useEffect(() => {
    if (!wsId) return
    lbs.subscribe(wsId)
    return () => lbs.unsubscribe(wsId)
  }, [wsId])

  useHotkeys(wsId)

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar wsId={wsId} />
      <div className="flex min-h-0 flex-1">
        <Sidebar wsId={wsId} />
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <IssueDrawer wsId={wsId} />
    </div>
  )
}
