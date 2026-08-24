'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUi } from '@/lib/store'
import { IssueDetail } from '@/components/issue-detail'

export default function IssuePage() {
  const { wsId, issueId } = useParams<{ wsId: string; issueId: string }>()
  const router = useRouter()
  const openIssue = useUi((s) => s.openIssue)

  useEffect(() => {
    openIssue(issueId)
    return () => useUi.getState().closeIssue()
  }, [issueId, openIssue])

  return (
    <div className="flex h-full flex-col">
      <button onClick={() => router.push(`/w/${wsId}/board`)} className="btn-ghost m-3 w-fit text-xs">
        ← Back to board
      </button>
      <div className="min-h-0 flex-1">
        <IssueDetail wsId={wsId} issueId={issueId} />
      </div>
    </div>
  )
}
