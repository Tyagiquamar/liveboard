'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useToasts } from '@/lib/store'
import { cn } from '@/lib/utils'

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-xl',
              t.kind === 'error' && 'border-danger/40 bg-[#2a1416] text-danger',
              t.kind === 'success' && 'border-ok/40 bg-[#12211a] text-ok',
              t.kind === 'info' && 'border-line bg-raise text-ink'
            )}
          >
            <span className="flex-1">{t.text}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-faint hover:text-ink">
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
