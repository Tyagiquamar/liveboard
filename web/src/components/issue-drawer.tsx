'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useUi } from '@/lib/store'
import { IssueDetail } from './issue-detail'

export function IssueDrawer({ wsId }: { wsId: string }) {
  const activeIssueId = useUi((s) => s.activeIssueId)
  const closeIssue = useUi((s) => s.closeIssue)

  useEffect(() => {
    if (!activeIssueId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeIssue()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeIssueId, closeIssue])

  return (
    <AnimatePresence>
      {activeIssueId && (
        <motion.aside
          key="drawer"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          role="dialog"
          aria-modal="false"
          aria-label="Issue detail"
          className="fixed inset-y-0 right-0 z-[45] flex w-full flex-col border-l border-line bg-panel shadow-2xl sm:w-[540px]"
        >
          <button
            onClick={closeIssue}
            aria-label="Close issue"
            className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-hoverbg hover:text-ink"
          >
            <X size={16} />
          </button>
          <IssueDetail wsId={wsId} issueId={activeIssueId} />
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
