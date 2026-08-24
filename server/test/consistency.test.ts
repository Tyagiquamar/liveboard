import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import request from 'supertest'
import { io as ioClient, type Socket } from 'socket.io-client'
import mongoose from 'mongoose'
import type { MongoMemoryServer } from 'mongodb-memory-server'

import { createApp } from '../src/app'
import { attachRealtime, type RealtimeHub } from '../src/realtime/io'
import { connectDb, disconnectDb } from '../src/db'

interface EventJSON {
  id: string
  seq: number
  workspaceId: string
  type: string
  entityId: string
  data: Record<string, unknown>
  ts: string
  actor: { id: string; name: string; color: string }
}

class Recorder {
  events: EventJSON[] = []
  seenIds = new Set<string>()
  private label: string

  constructor(label: string) {
    this.label = label
  }

  attach(socket: Socket): void {
    socket.onAny((ev, ...args) => {
      if (process.env.LB_DEBUG) console.log(`[${this.label}] <- ${ev}`, JSON.stringify(args).slice(0, 200))
    })
    socket.on('event', (e: EventJSON) => this.push(e))
    socket.on('event.batch', (batch: EventJSON[]) => batch.forEach((e) => this.push(e)))
  }

  private push(e: EventJSON): void {
    if (process.env.LB_DEBUG) console.log(`[${this.label}] event ${e.seq} ${e.type}`)
    if (this.seenIds.has(e.id)) return
    this.seenIds.add(e.id)
    this.events.push(e)
  }

  async waitFor(predicate: (events: EventJSON[]) => boolean, timeoutMs = 10000): Promise<void> {
    const start = Date.now()
    for (;;) {
      if (predicate(this.events)) {
        const n = this.events.length
        await new Promise((r) => setTimeout(r, 400))
        if (this.events.length === n) return
      }
      if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for events')
      await new Promise((r) => setTimeout(r, 40))
    }
  }
}

function subscribe(socket: Socket, workspaceId: string, sinceSeq?: number): Promise<{
  ok: boolean
  error?: string
  lastSeq?: number
  presence?: unknown[]
}> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('subscribe timeout')), 8000)
    socket.emit('ws.subscribe', { workspaceId, sinceSeq }, (res: { ok: boolean; error?: string; lastSeq?: number; presence?: unknown[] }) => {
      clearTimeout(t)
      resolve(res)
    })
  })
}

function connectClient(url: string, token?: string): Socket {
  return ioClient(url, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000
  })
}

async function register(
  app: ReturnType<typeof createApp>,
  body: { email: string; name: string; username: string; password: string }
): Promise<string> {
  const res = await request(app).post('/api/auth/register').send(body)
  expect(res.status).toBe(201)
  return res.body.token as string
}

let mongod: MongoMemoryServer | null = null
let app: ReturnType<typeof createApp>
let server: http.Server
let hub: RealtimeHub | null = null
let url: string

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  let uri = process.env.TEST_MONGO_URI || process.env.MONGO_URI || ''
  if (process.env.MONGO_URI) delete process.env.MONGO_URI
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    mongod = await MongoMemoryServer.create()
    uri = mongod.getUri('liveboard-test')
  }
  await connectDb(uri)
  await mongoose.connection.dropDatabase()
  app = createApp()
  server = http.createServer(app)
  hub = await attachRealtime(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}, 300000)

afterAll(async () => {
  if (mongod) await mongod.stop()
  else await disconnectDb()
  if (hub) {
    await new Promise<void>((resolve) => hub!.io.close(() => resolve()))
  } else {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

describe('two clients on one workspace converge to identical server state', () => {
  it('delivers the same ordered, duplicate-free event stream and matching final state to both clients', async () => {
    const tokenA = await register(app, {
      email: 'alice@test.dev',
      name: 'Alice',
      username: 'alice',
      password: 'secret123'
    })
    const tokenB = await register(app, {
      email: 'bob@test.dev',
      name: 'Bob',
      username: 'bob',
      password: 'secret123'
    })

    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Consistency WS' })
    expect(wsRes.status).toBe(201)
    const workspaceId = wsRes.body.workspace.id as string

    const invite = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ username: 'bob' })
    expect(invite.status).toBe(201)

    const projectsRes = await request(app)
      .get(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(projectsRes.status).toBe(200)
    const projectId = projectsRes.body.items[0].id as string

    const sockA = connectClient(url, tokenA)
    const sockB = connectClient(url, tokenB)
    const recA = new Recorder('A')
    const recB = new Recorder('B')

    const connected = Promise.all([
      new Promise<void>((r) => sockA.on('connect', r)),
      new Promise<void>((r) => sockB.on('connect', r))
    ])
    await connected
    recA.attach(sockA)
    recB.attach(sockB)

    const ackA = await subscribe(sockA, workspaceId, 0)
    const ackB = await subscribe(sockB, workspaceId, 0)
    expect(ackA.ok).toBe(true)
    expect(ackB.ok).toBe(true)

    const post = (token: string, path: string, body: Record<string, unknown>) =>
      request(app).post(path).set('Authorization', `Bearer ${token}`).send(body)

    const patch = (token: string, path: string, body: Record<string, unknown>) =>
      request(app).patch(path).set('Authorization', `Bearer ${token}`).send(body)

    const createdIssues: string[] = []

    for (const title of ['Issue T1', 'Issue T2', 'Issue T3']) {
      const r = await post(tokenA, `/api/workspaces/${workspaceId}/issues`, {
        projectId,
        title
      })
      expect(r.status).toBe(201)
      createdIssues.push(r.body.issue.id as string)
    }

    const [b1, b2] = await Promise.all([
      post(tokenB, `/api/workspaces/${workspaceId}/issues`, { projectId, title: 'Issue B1' }),
      post(tokenB, `/api/workspaces/${workspaceId}/issues`, { projectId, title: 'Issue B2' })
    ])
    expect(b1.status).toBe(201)
    expect(b2.status).toBe(201)
    createdIssues.push(b1.body.issue.id, b2.body.issue.id)

    const [move, comment] = await Promise.all([
      patch(tokenB, `/api/issues/${createdIssues[0]}`, {
        status: 'done',
        order: -2048,
        clientRequestId: 'move-t1-to-done-0001'
      }),
      post(tokenA, `/api/issues/${createdIssues[1]}/comments`, {
        body: 'hey @bob can you review this?',
        clientRequestId: 'comment-on-t2-000001'
      })
    ])
    expect(move.status).toBe(200)
    expect(comment.status).toBe(201)

    await Promise.all([
      recA.waitFor((evs) => evs.some((e) => e.type === 'issue.updated') && evs.some((e) => e.type === 'comment.created') && evs.length >= 9),
      recB.waitFor((evs) => evs.some((e) => e.type === 'issue.updated') && evs.some((e) => e.type === 'comment.created') && evs.length >= 9)
    ])

    const evA = recA.events.slice(0, 9)
    const evB = recB.events.slice(0, 9)

    expect(evA.map((e) => e.seq)).toEqual(evB.map((e) => e.seq))
    for (let i = 1; i < evA.length; i++) {
      expect(evA[i].seq).toBeGreaterThan(evA[i - 1].seq)
    }
    expect(new Set(evA.map((e) => e.id)).size).toBe(evA.length)
    expect(new Set(evB.map((e) => e.id)).size).toBe(evB.length)

    expect(JSON.parse(JSON.stringify(evA))).toEqual(JSON.parse(JSON.stringify(evB)))

    const types = evA.map((e) => e.type).sort()
    expect(types).toEqual([
      'comment.created',
      'issue.created',
      'issue.created',
      'issue.created',
      'issue.created',
      'issue.created',
      'issue.updated',
      'member.added',
      'project.created'
    ])

    const reduce = (events: EventJSON[]): Map<string, Record<string, unknown>> => {
      const issues = new Map<string, Record<string, unknown>>()
      for (const e of events) {
        if (e.type === 'issue.created') {
          issues.set(e.entityId, { ...(e.data.issue as Record<string, unknown>) })
        } else if (e.type === 'issue.updated') {
          Object.assign(issues.get(e.entityId)!, e.data.issue as Record<string, unknown>)
        }
      }
      return issues
    }

    const stateA = reduce(evA)
    const stateB = reduce(evB)
    expect(Object.fromEntries(stateA)).toEqual(Object.fromEntries(stateB))

    const listRes = await request(app)
      .get(`/api/workspaces/${workspaceId}/issues?limit=200`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(listRes.status).toBe(200)
    const serverIssues = new Map<string, Record<string, unknown>>(
      (listRes.body.items as Array<Record<string, unknown>>).map((i) => [i.id as string, i])
    )

    for (const [id, reduced] of stateA) {
      const serverDoc = serverIssues.get(id)!
      expect(serverDoc).toBeDefined()
      expect(serverDoc.title).toBe(reduced.title)
      expect(serverDoc.status).toBe(reduced.status)
      expect(serverDoc.order).toBe(reduced.order)
      expect(serverDoc.version).toBe(reduced.version)
      expect(String(serverDoc.assigneeId ?? null)).toBe(String(reduced.assigneeId ?? null))
    }

    const moved = serverIssues.get(createdIssues[0])!
    expect(moved.status).toBe('done')
    expect(moved.order).toBe(-2048)

    const dup = await post(tokenB, `/api/workspaces/${workspaceId}/issues`, {
      projectId,
      title: 'Deduped issue',
      clientRequestId: 'same-request-id-1234567890'
    })
    expect(dup.status).toBe(201)
    const dupRetry = await post(tokenB, `/api/workspaces/${workspaceId}/issues`, {
      projectId,
      title: 'Deduped issue',
      clientRequestId: 'same-request-id-1234567890'
    })
    expect(dupRetry.status).toBe(201)
    expect(dupRetry.body.issue.id).toBe(dup.body.issue.id)

    const stale = await patch(tokenA, `/api/issues/${createdIssues[2]}`, {
      title: 'Stale write',
      baseVersion: 999999
    })
    expect(stale.status).toBe(409)
    expect(stale.body.error).toBe('version_conflict')
    expect(stale.body.current).toBeDefined()
    expect(stale.body.current.version).toBeGreaterThan(0)

    sockA.close()
    sockB.close()
  }, 60000)

  it('rejects non-members from REST reads and websocket subscription (workspace isolation)', async () => {
    const tokenEve = await register(app, {
      email: 'eve@test.dev',
      name: 'Eve',
      username: 'eve',
      password: 'secret123'
    })

    const wsList = await request(app).get('/api/workspaces').set('Authorization', `Bearer ${tokenEve}`)
    expect(wsList.status).toBe(200)
    expect(wsList.body.items).toHaveLength(0)

    const anyWs = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${tokenEve}`)
      .send({ name: 'Eve WS' })
    expect(anyWs.status).toBe(201)

    const tokenAlicePriv = await register(app, {
      email: 'alice2@test.dev',
      name: 'Alice2',
      username: 'alice2',
      password: 'secret123'
    })
    const privRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${tokenAlicePriv}`)
      .send({ name: 'Alice Private' })
    const aliceWsId = privRes.body.workspace.id as string

    const forbidden = await request(app)
      .get(`/api/workspaces/${aliceWsId}/issues`)
      .set('Authorization', `Bearer ${tokenEve}`)
    expect(forbidden.status).toBe(403)

    const eveWsId = anyWs.body.workspace.id as string
    const own = await request(app)
      .get(`/api/workspaces/${eveWsId}/issues`)
      .set('Authorization', `Bearer ${tokenEve}`)
    expect(own.status).toBe(200)

    const sock = connectClient(url, tokenEve)
    await new Promise<void>((r) => sock.on('connect', r))
    const ack = await subscribe(sock, aliceWsId)
    expect(ack.ok).toBe(false)
    expect(ack.error).toBe('forbidden')
    sock.close()
  })

  it('refuses unauthenticated websocket handshakes', async () => {
    const sock = connectClient(url)
    const err = await new Promise<Error>((resolve) => {
      sock.on('connect_error', (e: Error) => resolve(e))
    })
    expect(err.message).toBe('unauthorized')
    sock.close()
  })
})
