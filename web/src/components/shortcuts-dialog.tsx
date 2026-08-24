'use client'

import { useSession, useUi } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui-dialog'

const SHORTCUTS: Array<[string, string]> = [
  ['⌘K / Ctrl K', 'Open command menu'],
  ['/', 'Focus search & filters'],
  ['c', 'New issue'],
  ['b', 'Go to board view'],
  ['t', 'Go to table view'],
  ['g then b / t / a', 'Board · Table · Activity'],
  ['Esc', 'Close dialogs and drawer'],
  ['?', 'This cheat sheet']
]

export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen)
  const setOpen = useUi((s) => s.setShortcutsOpen)
  const me = useSession((s) => s.me)
  if (!me) return null
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {SHORTCUTS.map(([keys, desc]) => (
            <li key={keys} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-ink-muted">{desc}</span>
              <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">{keys}</kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
