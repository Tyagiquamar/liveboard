import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Me {
  id: string
  name: string
  username: string
  color?: string
  email?: string
}

interface SessionState {
  token: string | null
  me: Me | null
  hydrated: boolean
  setAuth: (token: string | null, me: Me | null) => void
  markHydrated: () => void
}

export const useSession = create<SessionState>((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('lb_token') : null,
  me: null,
  hydrated: false,
  setAuth: (token, me) => {
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('lb_token', token)
      else localStorage.removeItem('lb_token')
    }
    set({ token, me })
  },
  markHydrated: () => set({ hydrated: true })
}))

export type ConnStatus = 'connecting' | 'online' | 'offline' | 'error'

interface ConnState {
  status: ConnStatus
  setStatus: (s: ConnStatus) => void
}

export const useConn = create<ConnState>((set) => ({
  status: 'connecting',
  setStatus: (status) => set({ status })
}))

export interface PresenceUser {
  id: string
  name: string
  username: string
  color: string
}

interface TypingEntry {
  name: string
  at: number
}

interface RealtimeState {
  presence: Record<string, PresenceUser[]>
  typing: Record<string, Record<string, TypingEntry>>
  viewers: Record<string, Array<PresenceUser>>
  applyPresence: (wsId: string, users: PresenceUser[]) => void
  applyTyping: (wsId: string, issueId: string, user: { id: string; name: string }, isTyping: boolean) => void
  applyViewers: (issueId: string, viewers: PresenceUser[]) => void
  clearWorkspace: (wsId: string) => void
}

const TYPING_TTL = 5000

function pruneTyping(map: Record<string, Record<string, TypingEntry>>): Record<string, Record<string, TypingEntry>> {
  const now = Date.now()
  let changed = false
  for (const key of Object.keys(map)) {
    for (const uid of Object.keys(map[key])) {
      if (now - map[key][uid].at > TYPING_TTL) {
        delete map[key][uid]
        changed = true
      }
    }
    if (!Object.keys(map[key]).length) delete map[key]
  }
  return changed ? { ...map } : map
}

setInterval(() => {
  useRealtime.setState((s) => ({ typing: pruneTyping(s.typing) }))
}, 2000)

export const useRealtime = create<RealtimeState>((set) => ({
  presence: {},
  typing: {},
  viewers: {},
  applyPresence: (wsId, users) =>
    set((s) => ({ presence: { ...s.presence, [wsId]: users } })),
  applyTyping: (wsId, issueId, user, isTyping) =>
    set((s) => {
      const key = `${wsId}:${issueId}`
      const entry = s.typing[key] ?? {}
      const next = { ...entry }
      if (isTyping) next[user.id] = { name: user.name, at: Date.now() }
      else delete next[user.id]
      return { typing: { ...s.typing, [key]: next } }
    }),
  applyViewers: (issueId, viewers) =>
    set((s) => ({ viewers: { ...s.viewers, [issueId]: viewers } })),
  clearWorkspace: (wsId) =>
    set((s) => {
      const presence = { ...s.presence }
      delete presence[wsId]
      const typing = { ...s.typing }
      for (const key of Object.keys(typing)) {
        if (key.startsWith(`${wsId}:`)) delete typing[key]
      }
      return { presence, typing }
    })
}))

interface UiState {
  commandOpen: boolean
  commandPresetQuery: string
  newIssue: { defaultStatus?: string; projectId?: string } | null
  activeIssueId: string | null
  inviteOpen: boolean
  createProjectOpen: boolean
  createWorkspaceOpen: boolean
  shortcutsOpen: boolean
  setCommandOpen: (b: boolean, preset?: string) => void
  openNewIssue: (o?: { defaultStatus?: string; projectId?: string }) => void
  closeNewIssue: () => void
  openIssue: (id: string) => void
  closeIssue: () => void
  setInviteOpen: (b: boolean) => void
  setCreateProjectOpen: (b: boolean) => void
  setCreateWorkspaceOpen: (b: boolean) => void
  setShortcutsOpen: (b: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  commandOpen: false,
  commandPresetQuery: '',
  newIssue: null,
  activeIssueId: null,
  inviteOpen: false,
  createProjectOpen: false,
  createWorkspaceOpen: false,
  shortcutsOpen: false,
  setCommandOpen: (commandOpen, commandPresetQuery = '') => set({ commandOpen, commandPresetQuery }),
  openNewIssue: (newIssue = {}) => set({ newIssue }),
  closeNewIssue: () => set({ newIssue: null }),
  openIssue: (activeIssueId) => set({ activeIssueId }),
  closeIssue: () => set({ activeIssueId: null }),
  setInviteOpen: (inviteOpen) => set({ inviteOpen }),
  setCreateProjectOpen: (createProjectOpen) => set({ createProjectOpen }),
  setCreateWorkspaceOpen: (createWorkspaceOpen) => set({ createWorkspaceOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen })
}))

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  text: string
}

let toastSeq = 1

interface ToastState {
  toasts: Toast[]
  push: (kind: Toast['kind'], text: string) => void
  dismiss: (id: number) => void
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, text }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export interface OutboxItem {
  key: string
  method: string
  path: string
  body: unknown
  label: string
  ts: number
}

interface OutboxState {
  items: OutboxItem[]
  enqueue: (item: Omit<OutboxItem, 'ts'>) => void
  remove: (key: string) => void
}

export const useOutbox = create<OutboxState>()(
  persist(
    (set) => ({
      items: [],
      enqueue: (item) =>
        set((s) => ({ items: [...s.items.filter((i) => i.key !== item.key), { ...item, ts: Date.now() }] })),
      remove: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) }))
    }),
    { name: 'lb_outbox_v1' }
  )
)

const dirtyUntil = new Map<string, number>()

export function markDirty(issueId: string, ms = 1400): void {
  dirtyUntil.set(issueId, Date.now() + ms)
}

export function isDirty(issueId: string): boolean {
  const until = dirtyUntil.get(issueId)
  return !!until && Date.now() < until
}

export function clearDirty(issueId: string): void {
  dirtyUntil.delete(issueId)
}
