'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUi } from './store'

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
}

export function useHotkeys(wsId: string | null): void {
  const router = useRouter()

  useEffect(() => {
    let chordG = 0

    const onKey = (e: KeyboardEvent): void => {
      const ui = useUi.getState()
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        ui.setCommandOpen(!ui.commandOpen)
        return
      }
      if (e.key === '?' && !isEditable(e.target)) {
        e.preventDefault()
        ui.setShortcutsOpen(true)
        return
      }
      if (isEditable(e.target) || ui.commandOpen) return

      if (chordG && Date.now() - chordG < 900) {
        chordG = 0
        if (!wsId) return
        if (e.key === 'b') {
          e.preventDefault()
          router.push(`/w/${wsId}/board`)
          return
        }
        if (e.key === 't') {
          e.preventDefault()
          router.push(`/w/${wsId}/table`)
          return
        }
        if (e.key === 'a') {
          e.preventDefault()
          router.push(`/w/${wsId}/activity`)
          return
        }
      }

      switch (e.key) {
        case '/': {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('lb:focus-search'))
          break
        }
        case 'c': {
          e.preventDefault()
          ui.openNewIssue({})
          break
        }
        case 'g': {
          chordG = Date.now()
          break
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, wsId])
}
