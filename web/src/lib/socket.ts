'use client'

import { io, type Socket } from 'socket.io-client'
import { useConn, useRealtime } from './store'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000'

export interface EventJSON {
  id: string
  seq: number
  workspaceId: string
  type: string
  actor: { id: string; name: string; color: string }
  entityId: string
  data: Record<string, unknown>
  ts: string
}

interface PresenceUser {
  id: string
  name: string
  username: string
  color: string
}

type EventHandler = (e: EventJSON) => void

class LiveSocket {
  private socket: Socket | null = null
  private seenIds = new Set<string>()
  private seenQueue: string[] = []
  private lastSeq: Record<string, number> = {}
  private subscribed = new Set<string>()
  private handlers = new Set<EventHandler>()
  private truncateHandlers = new Set<(wsId: string) => void>()
  private lastTypingSent = 0

  connect(token: string): void {
    if (this.socket) return
    useConn.getState().setStatus('connecting')
    const socket = io(WS_URL, {
      auth: { token },
      reconnectionDelayMax: 8000,
      timeout: 10000
    })
    this.socket = socket

    socket.on('connect', () => {
      this.seenIds.clear()
      this.seenQueue = []
      useConn.getState().setStatus('online')
      for (const wsId of this.subscribed) this.sendSubscribe(wsId)
    })

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return
      useConn.getState().setStatus(navigator.onLine ? 'connecting' : 'offline')
    })

    socket.io.on('reconnect_attempt', () => {
      useConn.getState().setStatus('connecting')
    })

    socket.on('connect_error', (err: Error) => {
      if (err.message === 'unauthorized') {
        localStorage.removeItem('lb_token')
        window.location.href = '/login'
        return
      }
      useConn.getState().setStatus('error')
    })

    socket.on('event', (e: EventJSON) => this.onEvent(e))
    socket.on('event.batch', (batch: EventJSON[]) => batch.forEach((e) => this.onEvent(e)))

    socket.on('presence', ({ workspaceId, users }: { workspaceId: string; users: PresenceUser[] }) => {
      useRealtime.getState().applyPresence(workspaceId, users)
    })

    socket.on(
      'typing',
      ({
        workspaceId,
        issueId,
        user,
        isTyping
      }: {
        workspaceId: string
        issueId: string
        user: { id: string; name: string }
        isTyping: boolean
      }) => {
        useRealtime.getState().applyTyping(workspaceId, issueId, user, isTyping)
      }
    )

    socket.on('viewers', ({ issueId, viewers }: { issueId: string; viewers: PresenceUser[] }) => {
      useRealtime.getState().applyViewers(issueId, viewers)
    })
  }

  private sendSubscribe(wsId: string): void {
    const sinceSeq = this.lastSeq[wsId]
    const payload: Record<string, unknown> = { workspaceId: wsId }
    if (typeof sinceSeq === 'number' && sinceSeq > 0) payload.sinceSeq = sinceSeq
    this.socket?.emit(
      'ws.subscribe',
      payload,
      (res: { ok: boolean; error?: string; truncated?: boolean }) => {
        if (!res.ok && res.error === 'forbidden') {
          this.subscribed.delete(wsId)
          return
        }
        if (res.ok && res.truncated) {
          // replay cap exceeded: partial batch would be wrong, refetch instead
          for (const h of this.truncateHandlers) h(wsId)
        }
      }
    )
  }

  subscribe(wsId: string): void {
    this.subscribed.add(wsId)
    if (this.socket?.connected) this.sendSubscribe(wsId)
  }

  unsubscribe(wsId: string): void {
    this.subscribed.delete(wsId)
    delete this.lastSeq[wsId]
    this.socket?.emit('ws.unsubscribe', { workspaceId: wsId })
  }

  onEvents(h: EventHandler): () => void {
    this.handlers.add(h)
    return () => this.handlers.delete(h)
  }

  onTruncate(h: (wsId: string) => void): () => void {
    this.truncateHandlers.add(h)
    return () => this.truncateHandlers.delete(h)
  }

  private onEvent(e: EventJSON): void {
    if (!e || !e.id) return
    if (this.seenIds.has(e.id)) return
    this.seenIds.add(e.id)
    this.seenQueue.push(e.id)
    if (this.seenQueue.length > 1500) {
      const drop = this.seenQueue.splice(0, 500)
      for (const id of drop) this.seenIds.delete(id)
    }
    const prev = this.lastSeq[e.workspaceId] ?? 0
    if (e.seq > prev) this.lastSeq[e.workspaceId] = e.seq
    for (const h of this.handlers) h(e)
  }

  emitTyping(wsId: string, issueId: string, isTyping: boolean): void {
    if (!isTyping) {
      this.socket?.emit('typing', { workspaceId: wsId, issueId, isTyping: false })
      return
    }
    const now = Date.now()
    if (now - this.lastTypingSent < 1200) return
    this.lastTypingSent = now
    this.socket?.emit('typing', { workspaceId: wsId, issueId, isTyping: true })
  }

  viewIssue(wsId: string, issueId: string): void {
    this.socket?.emit('issue.view', { workspaceId: wsId, issueId })
  }

  blurIssue(): void {
    this.socket?.emit('issue.blur')
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.socket = null
    this.subscribed.clear()
    this.lastSeq = {}
    this.handlers.clear()
  }
}

export const lbs = new LiveSocket()
