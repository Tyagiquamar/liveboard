import type http from 'http'
import { Server, type Socket } from 'socket.io'
import { verifyToken } from '../middlewares/auth'
import { Member } from '../models/member'
import { User } from '../models/user'
import { ActivityEvent } from '../models/event'
import { config } from '../config'
import { setPublisher } from './bus'
import { colorFor } from '../util/text'

const REPLAY_CAP = 2000

interface PresenceUser {
  id: string
  name: string
  username: string
  color: string
}

interface SocketData {
  user: PresenceUser
  rooms: Set<string>
  viewing: { workspaceId: string; issueId: string } | null
}

type IoSocket = Socket & { data: SocketData }

class Presence {
  private byWs = new Map<string, Map<string, { user: PresenceUser; sids: Set<string> }>>()
  private bySid = new Map<string, { user: PresenceUser; wsIds: Set<string> }>()

  join(wsId: string, sid: string, user: PresenceUser): boolean {
    let users = this.byWs.get(wsId)
    if (!users) {
      users = new Map()
      this.byWs.set(wsId, users)
    }
    let entry = users.get(user.id)
    if (!entry) {
      entry = { user, sids: new Set() }
      users.set(user.id, entry)
    }
    const isNewUser = entry.sids.size === 0
    entry.sids.add(sid)
    let sidEntry = this.bySid.get(sid)
    if (!sidEntry) {
      sidEntry = { user, wsIds: new Set() }
      this.bySid.set(sid, sidEntry)
    }
    sidEntry.wsIds.add(wsId)
    return isNewUser
  }

  leave(wsId: string, sid: string): boolean {
    const sidEntry = this.bySid.get(sid)
    if (!sidEntry || !sidEntry.wsIds.has(wsId)) return false
    sidEntry.wsIds.delete(wsId)
    const users = this.byWs.get(wsId)
    const entry = users?.get(sidEntry.user.id)
    if (!users || !entry) return false
    entry.sids.delete(sid)
    if (entry.sids.size === 0) users.delete(sidEntry.user.id)
    if (users.size === 0) this.byWs.delete(wsId)
    return entry.sids.size === 0
  }

  leaveAll(sid: string): { user: PresenceUser; wsIds: string[] } | null {
    const entry = this.bySid.get(sid)
    if (!entry) return null
    this.bySid.delete(sid)
    const changed: string[] = []
    for (const wsId of entry.wsIds) {
      const users = this.byWs.get(wsId)
      if (!users) continue
      const e = users.get(entry.user.id)
      if (!e) continue
      e.sids.delete(sid)
      if (e.sids.size === 0) {
        users.delete(entry.user.id)
        changed.push(wsId)
      }
      if (users.size === 0) this.byWs.delete(wsId)
    }
    return { user: entry.user, wsIds: changed }
  }

  list(wsId: string): PresenceUser[] {
    const users = this.byWs.get(wsId)
    if (!users) return []
    return [...users.values()].map((e) => e.user)
  }
}

class Viewers {
  private byKey = new Map<string, Map<string, { count: number; user: PresenceUser }>>()
  private bySid = new Map<string, Map<string, { workspaceId: string; issueId: string }>>()

  add(workspaceId: string, issueId: string, sid: string, user: PresenceUser): boolean {
    const key = `${workspaceId}:${issueId}`
    let users = this.byKey.get(key)
    if (!users) {
      users = new Map()
      this.byKey.set(key, users)
    }
    let entry = users.get(user.id)
    if (!entry) {
      entry = { count: 0, user }
      users.set(user.id, entry)
    }
    entry.count++
    let sidMap = this.bySid.get(sid)
    if (!sidMap) {
      sidMap = new Map()
      this.bySid.set(sid, sidMap)
    }
    sidMap.set(issueId, { workspaceId, issueId })
    return true
  }

  remove(workspaceId: string, issueId: string, sid: string, userId: string): boolean {
    const key = `${workspaceId}:${issueId}`
    const users = this.byKey.get(key)
    if (!users) return false
    const entry = users.get(userId)
    if (!entry) return false
    entry.count--
    if (entry.count <= 0) users.delete(userId)
    if (users.size === 0) this.byKey.delete(key)
    return true
  }

  removeAllForSocket(sid: string, userId: string): Array<{ workspaceId: string; issueId: string }> {
    const sidMap = this.bySid.get(sid)
    if (!sidMap) return []
    this.bySid.delete(sid)
    const out: Array<{ workspaceId: string; issueId: string }> = []
    for (const { workspaceId, issueId } of sidMap.values()) {
      if (this.remove(workspaceId, issueId, sid, userId)) out.push({ workspaceId, issueId })
    }
    return out
  }

  list(workspaceId: string, issueId: string): PresenceUser[] {
    const users = this.byKey.get(`${workspaceId}:${issueId}`)
    if (!users) return []
    return [...users.values()].map((e) => e.user)
  }
}

export class RealtimeHub {
  io: Server
  presence = new Presence()
  viewers = new Viewers()
  private typingTimers = new Map<string, NodeJS.Timeout>()

  constructor(server: http.Server) {
    this.io = new Server(server, {
      cors: { origin: [config.clientOrigin, 'http://localhost:3000'], methods: ['GET', 'POST'] }
    })

    setPublisher((room, event, data) => {
      this.io.to(room).emit(event, data as object)
    })

    this.io.use(async (socket, next) => {
      try {
        const token =
          typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : ''
        const userId = verifyToken(token)
        if (!userId) return next(new Error('unauthorized'))
        const u = await User.findById(userId).exec()
        if (!u) return next(new Error('unauthorized'))
        socket.data = {
          user: {
            id: String(u._id),
            name: u.name,
            username: u.username,
            color: colorFor(u.username)
          },
          rooms: new Set(),
          viewing: null
        }
        next()
      } catch (e) {
        next(e as Error)
      }
    })

    this.io.on('connection', (socket) => this.onConnection(socket as IoSocket))
  }

  private broadcastPresence(room: string, workspaceId: string): void {
    this.io.to(room).emit('presence', { workspaceId, users: this.presence.list(workspaceId) })
  }

  private broadcastViewers(workspaceId: string, issueId: string): void {
    this.io.to(`ws:${workspaceId}`).emit('viewers', {
      workspaceId,
      issueId,
      viewers: this.viewers.list(workspaceId, issueId)
    })
  }

  private onConnection(socket: IoSocket): void {
    socket.on(
      'ws.subscribe',
      async (
        payload: { workspaceId?: string; sinceSeq?: number } | undefined,
        ack?: (res: unknown) => void
      ) => {
        try {
          const workspaceId = payload?.workspaceId ?? ''
          const sinceSeq = typeof payload?.sinceSeq === 'number' ? payload.sinceSeq : null
          if (!/^[a-f\d]{24}$/i.test(workspaceId)) {
            ack?.({ ok: false, error: 'bad_request' })
            return
          }
          const member = await Member.exists({ workspaceId, userId: socket.data.user.id })
          if (!member) {
            ack?.({ ok: false, error: 'forbidden' })
            return
          }
          await socket.join(`ws:${workspaceId}`)
          socket.data.rooms.add(workspaceId)
          this.presence.join(workspaceId, socket.id, socket.data.user)

          const latest = await ActivityEvent.findOne({ workspaceId })
            .sort({ seq: -1 })
            .select('seq')
            .exec()
          const lastSeq = latest?.seq ?? 0

          let replayed: unknown[] = []
          let truncated = false
          if (sinceSeq != null && sinceSeq < lastSeq) {
            replayed = (
              await ActivityEvent.find({ workspaceId, seq: { $gt: sinceSeq } })
                .sort({ seq: 1 })
                .limit(REPLAY_CAP + 1)
                .exec()
            ).map((d) => JSON.parse(JSON.stringify(d)))
            if (replayed.length > REPLAY_CAP) {
              truncated = true
              replayed = []
            }
          }

          for (let i = 0; i < replayed.length; i += 100) {
            socket.emit('event.batch', replayed.slice(i, i + 100))
          }
          if (replayed.length > 0 || truncated) {
            socket.emit('sync.done', { workspaceId, lastSeq })
          }
          this.broadcastPresence(`ws:${workspaceId}`, workspaceId)
          ack?.({ ok: true, lastSeq, presence: this.presence.list(workspaceId), truncated })
        } catch {
          ack?.({ ok: false, error: 'server_error' })
        }
      }
    )

    socket.on('ws.unsubscribe', (payload: { workspaceId?: string } | undefined) => {
      const workspaceId = payload?.workspaceId ?? ''
      socket.data.rooms.delete(workspaceId)
      void socket.leave(`ws:${workspaceId}`)
      if (/^[a-f\d]{24}$/i.test(workspaceId) && this.presence.leave(workspaceId, socket.id)) {
        this.broadcastPresence(`ws:${workspaceId}`, workspaceId)
      }
    })

    socket.on(
      'typing',
      (payload: { workspaceId?: string; issueId?: string; isTyping?: boolean } | undefined) => {
        const { workspaceId, issueId, isTyping } = payload ?? {}
        if (!workspaceId || !issueId || !socket.data.rooms.has(workspaceId)) return
        const key = `${workspaceId}:${issueId}:${socket.data.user.id}`
        const prev = this.typingTimers.get(key)
        if (isTyping) {
          if (prev) clearTimeout(prev)
          this.typingTimers.set(
            key,
            setTimeout(() => {
              this.typingTimers.delete(key)
              this.io.to(`ws:${workspaceId}`).emit('typing', {
                workspaceId,
                issueId,
                user: { id: socket.data.user.id, name: socket.data.user.name },
                isTyping: false
              })
            }, 3500)
          )
          socket.to(`ws:${workspaceId}`).emit('typing', {
            workspaceId,
            issueId,
            user: { id: socket.data.user.id, name: socket.data.user.name },
            isTyping: true
          })
        } else {
          if (prev) {
            clearTimeout(prev)
            this.typingTimers.delete(key)
          }
          socket.to(`ws:${workspaceId}`).emit('typing', {
            workspaceId,
            issueId,
            user: { id: socket.data.user.id, name: socket.data.user.name },
            isTyping: false
          })
        }
      }
    )

    socket.on(
      'issue.view',
      (payload: { workspaceId?: string; issueId?: string } | undefined) => {
        const { workspaceId, issueId } = payload ?? {}
        if (!workspaceId || !issueId || !socket.data.rooms.has(workspaceId)) return
        if (socket.data.viewing) {
          const old = socket.data.viewing
          if (old.issueId !== issueId) {
            this.viewers.remove(old.workspaceId, old.issueId, socket.id, socket.data.user.id)
            this.broadcastViewers(old.workspaceId, old.issueId)
          }
        }
        socket.data.viewing = { workspaceId, issueId }
        this.viewers.add(workspaceId, issueId, socket.id, socket.data.user)
        this.broadcastViewers(workspaceId, issueId)
      }
    )

    socket.on('issue.blur', () => {
      const v = socket.data.viewing
      if (!v) return
      socket.data.viewing = null
      if (this.viewers.remove(v.workspaceId, v.issueId, socket.id, socket.data.user.id)) {
        this.broadcastViewers(v.workspaceId, v.issueId)
      }
    })

    socket.on('disconnect', () => {
      const leftViewers = this.viewers.removeAllForSocket(socket.id, socket.data.user.id)
      for (const v of leftViewers) this.broadcastViewers(v.workspaceId, v.issueId)
      const left = this.presence.leaveAll(socket.id)
      if (left) {
        for (const wsId of left.wsIds) this.broadcastPresence(`ws:${wsId}`, wsId)
      }
    })
  }
}

export async function attachRealtime(server: http.Server): Promise<RealtimeHub> {
  const hub = new RealtimeHub(server)
  if (config.redisUrl) {
    const [{ createAdapter }, { default: Redis }] = await Promise.all([
      import('@socket.io/redis-adapter'),
      import('ioredis')
    ])
    const pub = new Redis(config.redisUrl)
    const sub = pub.duplicate()
    hub.io.adapter(createAdapter(pub, sub))
  }
  return hub
}
