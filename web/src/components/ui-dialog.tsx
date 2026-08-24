'use client'

import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close

export function DialogContent({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <RadixDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-panel p-5 shadow-2xl focus:outline-none max-h-[90vh] overflow-y-auto',
          className
        )}
      >
        {children}
        <RadixDialog.Close asChild>
          <button
            aria-label="Close"
            className="absolute right-3 top-3 rounded-md p-1 text-ink-faint transition-colors hover:bg-hoverbg hover:text-ink"
          >
            <X size={15} />
          </button>
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4">{children}</div>
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <RadixDialog.Title className="text-base font-semibold tracking-tight">{children}</RadixDialog.Title>
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <RadixDialog.Description className="mt-1 text-xs text-ink-muted">{children}</RadixDialog.Description>
}
