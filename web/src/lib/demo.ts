'use client'

// In-browser demo backend: mirrors the REST + event shapes of server/ so the
// web app runs with no API host. Activated at build time via NEXT_PUBLIC_DEMO=1.
// Data is synthetic, deterministic, and persisted to localStorage; mutations
// sync across tabs of the same browser via storage events.

import type { ActivityEvent, Comment, Issue, Member, Page, Project, Status, Workspace } from './types'
import type { ApiOpts } from './api'
import { ApiError } from './api'
import { lbs, type EventJSON } from './socket'

interface DemoUser {
  id: string
  email: string
  name: string
  username: string
  color: string
}

interface DemoState {
  issues: Issue[]
  comments: Comment[]
  events: ActivityEvent[]
  counters: Record<string, number>
  eventSeq: number
}

const STORE_KEY = 'lb_demo_v1'
const BASE_TS = new Date('2026-08-24T09:00:00Z').getTime()

const USERS: DemoUser[] = [
  { id: 'u-alice', email: 'alice@demo.dev', name: 'Alice Nguyen', username: 'alice', color: '#f97316' },
  { id: 'u-bob', email: 'bob@demo.dev', name: 'Bob Marín', username: 'bob', color: '#0ea5e9' },
  { id: 'u-carol', email: 'carol@demo.dev', name: 'Carol Diaz', username: 'carol', color: '#22c55e' },
  { id: 'u-dave', email: 'dave@demo.dev', name: 'Dave Okafor', username: 'dave', color: '#a855f7' }
]

const WS: Workspace = {
  id: 'ws-acme',
  name: 'Acme Product Team',
  slug: 'acme',
  createdBy: 'u-alice',
  createdAt: new Date(BASE_TS).toISOString()
}

const PROJECTS: Project[] = [
  { id: 'p-plat', workspaceId: 'ws-acme', name: 'Platform', key: 'PLAT', createdBy: 'u-alice', createdAt: new Date(BASE_TS).toISOString() },
  { id: 'p-web', workspaceId: 'ws-acme', name: 'Web App', key: 'WEB', createdBy: 'u-alice', createdAt: new Date(BASE_TS + 60000).toISOString() },
  { id: 'p-mob', workspaceId: 'ws-acme', name: 'Mobile', key: 'MOB', createdBy: 'u-alice', createdAt: new Date(BASE_TS + 120000).toISOString() }
]

const MEMBERS: Member[] = USERS.map((u, i) => ({
  id: `m-${u.username}`,
  role: i === 0 ? 'owner' : 'member',
  user: u
}))

const STATUS_RANK: Record<Status, number> = { backlog: 0, todo: 1, in_progress: 2, done: 3 }

type IssueSeed = [title: string, desc: string, status: Status, priority: number, assignee: string | null, labels: string[]]

const SEED_ISSUES: Array<{ projectId: string; issues: IssueSeed[] }> = [
  {
    projectId: 'p-plat',
    issues: [
      ['Realtime presence avatars flicker on reconnect', 'Presence list briefly drops the reconnecting user before repopulating. Likely a race between socket rejoin and the presence broadcast.', 'in_progress', 3, 'alice', ['realtime', 'bug']],
      ['Cursor pagination skips issues updated mid-scroll', 'Keyset cursors must include the sort field value plus id tiebreak so pages stay stable while rows change underneath.', 'done', 3, 'carol', ['backend']],
      ['Typing indicators never clear if the tab crashes', 'Server-side expiry timers already exist; verify they fire when no explicit isTyping=false arrives.', 'done', 1, 'bob', ['realtime']],
      ['Rate-limit the auth endpoints', 'Login/register currently accept unlimited attempts. Add a per-IP sliding window.', 'todo', 3, 'dave', ['security']],
      ['Fall back to refetch when event replay is truncated', 'If a client reconnects after more than 2000 missed events, the replay cap truncates — client should refetch lists instead of applying a partial batch.', 'todo', 2, 'alice', ['realtime', 'backend']],
      ['Search should match issue keys like PLAT-12', 'Detect the KEY-number pattern in queries and route straight to the unique compound index.', 'in_progress', 2, 'carol', ['search']],
      ['Conflicts during concurrent edits surface as generic errors', 'The API returns 409 with the current document; some surfaces still render "request failed". Map version_conflict to the rebase UX everywhere.', 'backlog', 2, null, ['ux', 'backend']],
      ['Audit indexes for workspace-scoped queries', 'Every hot query leads with workspaceId; confirm the planner agrees and drop unused indexes.', 'backlog', 1, null, ['backend', 'perf']],
      ['Idempotency-key TTL vs flaky mobile networks', 'Keys expire after 7 days. Retries from the offline outbox can legally arrive later than that.', 'todo', 1, 'dave', ['backend']],
      ['Presence list keeps users after they unsubscribe', 'ws.unsubscribe removed the socket from the room but left the presence registry entry until disconnect.', 'done', 2, 'alice', ['realtime', 'bug']],
      ['Soft-deleted issues still appear in search results', 'Text search forgot the deletedAt:null filter; list views were fine.', 'done', 4, 'bob', ['bug', 'backend']],
      ['Structured logs with correlation ids', 'Thread a request id through REST handlers and socket middleware for greppable production logs.', 'backlog', 0, null, ['infra']]
    ]
  },
  {
    projectId: 'p-web',
    issues: [
      ['Kanban drag feels sticky on touch devices', 'Increase the pointer-sensor activation distance and verify on iOS Safari.', 'todo', 2, 'bob', ['frontend']],
      ['Keyboard shortcuts cheat sheet', 'Press ? anywhere to open an overlay listing every binding.', 'done', 1, 'carol', ['polish']],
      ['Table view inline editing loses focus on rerender', 'Cell inputs remount when the row object identity changes; memoize the editor component.', 'in_progress', 3, 'alice', ['frontend', 'bug']],
      ['Mention autocomplete should filter workspace members', 'The @username popup must list only current workspace members.', 'done', 2, 'bob', ['mentions']],
      ['Dark theme contrast audit', 'Check muted text and badge backgrounds against WCAG AA.', 'backlog', 0, null, ['a11y', 'design']],
      ['Issue drawer deep links do not restore scroll position', '/w/:ws/i/:id renders fine but lands scrolled to top of long threads.', 'todo', 1, 'carol', ['frontend']],
      ['Command menu should rank recent actions first', '⌘K currently orders alphabetically; recency would cut two keystrokes off common flows.', 'backlog', 0, null, ['polish']],
      ['Offline outbox chip is easy to miss', 'Queued-changes indicator needs a stronger visual treatment plus a click-to-inspect popover.', 'todo', 2, 'dave', ['ux']],
      ['Skeletons flash when switching board/table views', 'React Query has the data cached; the view components just are not reading the warm cache.', 'backlog', 1, null, ['frontend', 'polish']],
      ['Activity feed timestamps lack a timezone hint', 'Relative times are fine, but hover tooltips show raw ISO strings.', 'todo', 0, 'alice', ['frontend']]
    ]
  },
  {
    projectId: 'p-mob',
    issues: [
      ['Responsive layout breaks below 360px width', 'Top bar overflows and hides the connection badge on small Android phones.', 'in_progress', 3, 'carol', ['mobile', 'bug']],
      ['Touch targets under 40px in the top bar', 'Presence stack and account menu are hard to hit; bump hit areas without growing visuals.', 'todo', 2, 'dave', ['mobile', 'a11y']],
      ['Board columns force horizontal scroll on tablets', 'Consider a two-column grid layout between 768px and 1024px.', 'backlog', 1, null, ['mobile', 'ux']],
      ['Reconnect banner overlaps the bottom nav', 'Fixed-position banner collides with mobile Safari safe areas.', 'todo', 2, 'bob', ['mobile', 'bug']],
      ['Mention notifications for background tabs', 'Use the Notification API when a mention event arrives while the tab is hidden.', 'backlog', 1, null, ['mobile', 'realtime']],
      ['viewport-fit=cover missing', 'Notch devices clip the header under the sensor housing.', 'done', 0, 'alice', ['mobile', 'polish']]
    ]
  }
]

type CommentSeed = [issueTitle: string, author: string, body: string]

const SEED_COMMENTS: CommentSeed[] = [
  ['Realtime presence avatars flicker on reconnect', 'bob', '@alice reproduced on Safari — the presence list empties for a beat, then repopulates.'],
  ['Realtime presence avatars flicker on reconnect', 'alice', 'Thanks @bob. The disconnect broadcast wins the race against the rejoin; moving the leave behind a microtask fixes it locally.'],
  ['Rate-limit the auth endpoints', 'alice', '@dave start with login/register, something like 20 requests/min per IP.'],
  ['Rate-limit the auth endpoints', 'dave', 'On it — will skip the demo login route so the recruiter flow never trips the limiter.'],
  ['Search should match issue keys like PLAT-12', 'carol', 'Parser recognizes the KEY-number pattern now; bare prefixes like "PLAT" fall back to text matching.'],
  ['Idempotency-key TTL vs flaky mobile networks', 'bob', '@dave keys expire after 7 days today — retries from the offline outbox can arrive later than that.'],
  ['Idempotency-key TTL vs flaky mobile networks', 'dave', 'Bumping to 30 days; storage cost is negligible at our write volume.'],
  ['Kanban drag feels sticky on touch devices', 'alice', '@bob raising the activation distance to 8px fixed it on my iPad — worth trying before bigger surgery.'],
  ['Table view inline editing loses focus on rerender', 'carol', 'The input remounts whenever the row object identity changes. @alice can you take it from here?'],
  ['Mention autocomplete should filter workspace members', 'bob', 'Shipped — autocomplete sources from the workspace roster only now.'],
  ['Activity feed timestamps lack a timezone hint', 'dave', '@alice add a title tooltip with the full localized timestamp on hover.'],
  ['Responsive layout breaks below 360px width', 'carol', 'Pixel 4a at 360x800 clips the presence stack. Collapse it behind a +N chip below 400px.']
]

function userByName(username: string): DemoUser {
  return USERS.find((u) => u.username === username) ?? USERS[0]
}

function seedState(): DemoState {
  const state: DemoState = { issues: [], comments: [], events: [], counters: {}, eventSeq: 0 }
  const actor = userByName('alice')

  const push = (type: EventJSON['type'], actorUser: DemoUser, entityId: string, data: Record<string, unknown>): void => {
    state.eventSeq += 1
    state.events.push({
      id: `e-${state.eventSeq}`,
      seq: state.eventSeq,
      workspaceId: WS.id,
      type,
      actor: { id: actorUser.id, name: actorUser.name, color: actorUser.color },
      entityId,
      data,
      ts: new Date(BASE_TS + state.eventSeq * 7 * 60000).toISOString()
    })
  }

  for (const project of PROJECTS) push('project.created', actor, project.id, { project })

  const byTitle = new Map<string, Issue>()
  for (const group of SEED_ISSUES) {
    const project = PROJECTS.find((p) => p.id === group.projectId)!
    const columnCursor: Partial<Record<Status, number>> = {}
    for (const [title, description, status, priority, assignee, labels] of group.issues) {
      const idx = (columnCursor[status] ?? 0) + 1
      columnCursor[status] = idx
      state.counters[project.id] = (state.counters[project.id] ?? 0) + 1
      const number = state.counters[project.id]
      const createdAt = new Date(BASE_TS + 3600000 + state.issues.length * 900000).toISOString()
      const issue: Issue = {
        id: `i-${project.key.toLowerCase()}-${number}`,
        workspaceId: WS.id,
        projectId: project.id,
        projectKey: project.key,
        number,
        key: `${project.key}-${number}`,
        title,
        description,
        status,
        priority,
        assigneeId: assignee ? userByName(assignee).id : null,
        reporterId: actor.id,
        labels,
        order: -idx * 1024,
        version: 1,
        commentCount: 0,
        createdAt,
        updatedAt: createdAt
      }
      state.issues.push(issue)
      byTitle.set(title, issue)
      push('issue.created', actor, issue.id, { issue })
    }
  }

  for (const [issueTitle, authorName, body] of SEED_COMMENTS) {
    const issue = byTitle.get(issueTitle)
    if (!issue) continue
    const author = userByName(authorName)
    const mentionIds = [...body.matchAll(/@([a-z0-9_]{2,24})/gi)]
      .map((m) => USERS.find((u) => u.username === m[1])?.id)
      .filter((id): id is string => !!id)
    const comment: Comment = {
      id: `c-${state.events.length + 1}-${author.username}`,
      issueId: issue.id,
      workspaceId: WS.id,
      authorId: author.id,
      body,
      mentionIds,
      createdAt: new Date(BASE_TS + 7200000 + state.comments.length * 1500000).toISOString()
    }
    state.comments.push(comment)
    issue.commentCount += 1
    push('comment.created', author, issue.id, { comment, mentionIds, issueTitle })
  }

  return state
}

function load(): DemoState {
  if (typeof window === 'undefined') return seedState()
  const raw = window.localStorage.getItem(STORE_KEY)
  if (raw) {
    try {
      return JSON.parse(raw) as DemoState
    } catch {
      /* corrupted — reseed */
    }
  }
  const fresh = seedState()
  window.localStorage.setItem(STORE_KEY, JSON.stringify(fresh))
  return fresh
}

let current: DemoState | null = null

function state(): DemoState {
  if (!current) current = load()
  return current
}

function save(): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORE_KEY, JSON.stringify(state()))
}

const injectedEvents = new Set<string>()

if (typeof window !== 'undefined') {
  injectedEvents.clear()
  for (const e of load().events) injectedEvents.add(e.id)
  window.addEventListener('storage', (ev) => {
    if (ev.key !== STORE_KEY || !ev.newValue) return
    try {
      current = JSON.parse(ev.newValue) as DemoState
    } catch {
      return
    }
    for (const e of current.events) {
      if (!injectedEvents.has(e.id)) {
        injectedEvents.add(e.id)
        lbs.injectEvent(e as EventJSON)
      }
    }
  })
}

function emit(type: EventJSON['type'], actorUser: DemoUser, entityId: string, data: Record<string, unknown>): void {
  const s = state()
  s.eventSeq += 1
  const event: ActivityEvent = {
    id: `e-${s.eventSeq}`,
    seq: s.eventSeq,
    workspaceId: WS.id,
    type,
    actor: { id: actorUser.id, name: actorUser.name, color: actorUser.color },
    entityId,
    data,
    ts: new Date().toISOString()
  }
  s.events.push(event)
  save()
  injectedEvents.add(event.id)
  lbs.injectEvent(event as EventJSON)
}

function actorFromToken(): DemoUser {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('lb_token') : null
  const name = token?.startsWith('demo.') ? token.slice(5) : 'alice'
  return USERS.find((u) => u.username === name) ?? USERS[0]
}

export function demoUserFor(token: string | null): DemoUser | null {
  if (!token?.startsWith('demo.')) return null
  const name = token.slice(5)
  return USERS.find((u) => u.username === name) ?? null
}

function b64(obj: unknown): string {
  return typeof window === 'undefined' ? Buffer.from(JSON.stringify(obj)).toString('base64') : window.btoa(JSON.stringify(obj))
}

function unb64<T>(s: string | undefined): T | null {
  if (!s) return null
  try {
    return JSON.parse(typeof window === 'undefined' ? Buffer.from(s, 'base64').toString() : window.atob(s)) as T
  } catch {
    return null
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function pageOf<T>(items: T[], limit: number, cursor: string | null): Page<T> {
  // ponytail: offset cursor over an in-memory snapshot — fine at demo scale
  // (<40 rows/page); the real server uses keyset cursors.
  const offset = unb64<{ o: number }>(cursor ?? undefined)?.o ?? 0
  const slice = items.slice(offset, offset + limit)
  const next = offset + limit
  return { items: slice, nextCursor: next < items.length ? b64({ o: next }) : null }
}

function sortIssues(items: Issue[], sort: string, dir: 1 | -1): Issue[] {
  const sorted = [...items]
  const cmpId = (a: Issue, b: Issue): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  switch (sort) {
    case 'created':
      sorted.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) * dir || cmpId(a, b) * dir)
      break
    case 'priority':
      sorted.sort((a, b) => (a.priority - b.priority) * dir || cmpId(a, b) * dir)
      break
    case 'title':
      sorted.sort((a, b) => a.title.localeCompare(b.title) * dir || cmpId(a, b) * dir)
      break
    case 'status':
      sorted.sort((a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * dir || (a.order - b.order) || cmpId(a, b))
      break
    default:
      sorted.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0) * dir || cmpId(a, b) * dir)
  }
  return sorted
}

function matchQuery(issue: Issue, q: string | null): boolean {
  if (!q) return true
  const keyMatch = /^([a-z]+)-(\d+)$/i.exec(q.trim())
  if (keyMatch && issue.key.toLowerCase() === `${keyMatch[1]}-${keyMatch[2]}`.toLowerCase()) return true
  const needle = q.toLowerCase()
  return issue.title.toLowerCase().includes(needle) || issue.description.toLowerCase().includes(needle)
}

export async function demoApi<T>(path: string, opts: ApiOpts = {}): Promise<T> {
  // Cross-tab safety: demo state lives in shared localStorage. Serialize the
  // read-modify-write cycle with a Web Lock so two tabs acting at once cannot
  // clobber each other's events (previously: lost updates + duplicate seq ids).
  const locks = typeof navigator !== 'undefined' ? navigator.locks : null
  if (!locks) {
    refreshFromStore()
    return handleDemoApi<T>(path, opts)
  }
  return locks.request('lb_demo_store', () => {
    refreshFromStore()
    return handleDemoApi<T>(path, opts)
  }) as Promise<T>
}

function refreshFromStore(): void {
  if (typeof window === 'undefined') return
  const raw = window.localStorage.getItem(STORE_KEY)
  if (!raw) return
  try {
    current = JSON.parse(raw) as DemoState
  } catch {
    /* keep cached copy */
  }
}

async function handleDemoApi<T>(path: string, opts: ApiOpts = {}): Promise<T> {
  await sleep(120)
  const method = opts.method ?? 'GET'
  const [rawPath, rawQuery] = path.split('?')
  const query = new URLSearchParams(rawQuery ?? '')
  const s = state()
  const body = (opts.body ?? {}) as Record<string, unknown>

  const route = `${method} ${rawPath}`
  const actor = actorFromToken()

  if (method === 'POST' && rawPath === '/auth/demo') {
    const user = body.username ? userByName(String(body.username)) : USERS[0]
    return { token: `demo.${user.username}`, user, workspaceId: WS.id } as T
  }

  if (method === 'GET' && rawPath === '/auth/me') {
    const me = demoUserFor(typeof window !== 'undefined' ? window.localStorage.getItem('lb_token') : null)
    if (!me) throw new ApiError(401, 'unauthorized')
    return { user: me } as T
  }

  if (method === 'GET' && rawPath === '/workspaces') return { items: [WS] } as T

  if (method === 'POST' && rawPath === '/workspaces') {
    const name = String(body.name ?? 'New Workspace')
    const ws: Workspace = { id: `ws-${Date.now()}`, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), createdBy: actor.id, createdAt: new Date().toISOString() }
    return { workspace: ws } as T
  }

  let m = /^\/workspaces\/([^/]+)\/projects$/.exec(rawPath)
  if (m) {
    if (method === 'GET') return { items: PROJECTS } as T
    if (method === 'POST') {
      const name = String(body.name ?? 'New Project')
      const key = name.slice(0, 4).toUpperCase()
      const project: Project = { id: `p-${Date.now()}`, workspaceId: WS.id, name, key, createdBy: actor.id, createdAt: new Date().toISOString() }
      emit('project.created', actor, project.id, { project })
      return { project } as T
    }
  }

  m = /^\/workspaces\/([^/]+)\/members$/.exec(rawPath)
  if (m && method === 'GET') return { items: MEMBERS } as T

  m = /^\/workspaces\/([^/]+)\/issues$/.exec(rawPath)
  if (m) {
    if (method === 'POST') {
      const project = PROJECTS.find((p) => p.id === body.projectId) ?? PROJECTS[0]
      const status = (body.status as Status) ?? 'todo'
      s.counters[project.id] = (s.counters[project.id] ?? 0) + 1
      const number = s.counters[project.id]
      const minOrder = Math.min(0, ...s.issues.filter((i) => i.status === status).map((i) => i.order))
      const now = new Date().toISOString()
      const issue: Issue = {
        id: `i-${project.key.toLowerCase()}-${number}-${Date.now()}`,
        workspaceId: WS.id,
        projectId: project.id,
        projectKey: project.key,
        number,
        key: `${project.key}-${number}`,
        title: String(body.title ?? 'Untitled'),
        description: String(body.description ?? ''),
        status,
        priority: Number(body.priority ?? 0),
        assigneeId: (body.assigneeId as string | null) ?? null,
        reporterId: actor.id,
        labels: (body.labels as string[]) ?? [],
        order: Number(body.order ?? minOrder - 1024),
        version: 1,
        commentCount: 0,
        createdAt: now,
        updatedAt: now
      }
      s.issues.push(issue)
      emit('issue.created', actor, issue.id, { issue })
      return { issue } as T
    }
    if (method === 'GET') {
      let items = s.issues.filter((i) => !(i as unknown as { deletedAt?: string }).deletedAt)
      const projectId = query.get('projectId')
      const status = query.get('status') as Status | null
      const assigneeId = query.get('assigneeId')
      const priority = query.get('priority')
      if (projectId) items = items.filter((i) => i.projectId === projectId)
      if (status) items = items.filter((i) => i.status === status)
      if (assigneeId) items = items.filter((i) => (assigneeId === 'none' ? i.assigneeId === null : i.assigneeId === assigneeId))
      if (priority != null && priority !== '') items = items.filter((i) => i.priority === Number(priority))
      items = items.filter((i) => matchQuery(i, query.get('q')))
      items = sortIssues(items, query.get('sort') ?? 'updated', query.get('dir') === 'asc' ? 1 : -1)
      return pageOf(items, Number(query.get('limit') ?? 50), query.get('cursor')) as T
    }
  }

  m = /^\/issues\/([^/]+)$/.exec(rawPath)
  if (m) {
    const issue = s.issues.find((i) => i.id === m![1])
    if (!issue) throw new ApiError(404, 'issue_not_found')
    if (method === 'GET') return { issue } as T
    if (method === 'DELETE') {
      ;(issue as unknown as { deletedAt: string }).deletedAt = new Date().toISOString()
      emit('issue.deleted', actor, issue.id, { issueId: issue.id })
      return { ok: true } as T
    }
    if (method === 'PATCH') {
      if (body.baseVersion != null && Number(body.baseVersion) !== issue.version) {
        throw new ApiError(409, 'version_conflict', { current: issue } as Record<string, unknown>)
      }
      const changes: Record<string, unknown> = {}
      for (const field of ['title', 'description', 'status', 'priority', 'assigneeId', 'labels', 'order'] as const) {
        if (body[field] !== undefined) {
          issue[field] = body[field] as never
          changes[field] = body[field]
        }
      }
      issue.version += 1
      issue.updatedAt = new Date().toISOString()
      changes.version = issue.version
      emit('issue.updated', actor, issue.id, { changes, issue })
      return { issue } as T
    }
  }

  m = /^\/issues\/([^/]+)\/comments$/.exec(rawPath)
  if (m) {
    const issue = s.issues.find((i) => i.id === m![1])
    if (!issue) throw new ApiError(404, 'issue_not_found')
    if (method === 'GET') {
      const items = [...s.comments].filter((c) => c.issueId === issue.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      return pageOf(items, Number(query.get('limit') ?? 30), query.get('cursor')) as T
    }
    if (method === 'POST') {
      const text = String(body.body ?? '')
      const mentionIds = [...text.matchAll(/@([a-z0-9_]{2,24})/gi)]
        .map((match) => USERS.find((u) => u.username === match[1].toLowerCase())?.id)
        .filter((id): id is string => !!id)
      const comment: Comment = {
        id: `c-${Date.now()}`,
        issueId: issue.id,
        workspaceId: WS.id,
        authorId: actor.id,
        body: text,
        mentionIds,
        createdAt: new Date().toISOString()
      }
      s.comments.push(comment)
      issue.commentCount += 1
      emit('comment.created', actor, issue.id, { comment, mentionIds, issueTitle: issue.title })
      return { comment } as T
    }
  }

  m = /^\/workspaces\/([^/]+)\/activity$/.exec(rawPath)
  if (m && method === 'GET') {
    const items = [...s.events].sort((a, b) => b.seq - a.seq)
    return pageOf(items, Number(query.get('limit') ?? 40), query.get('cursor')) as T
  }

  throw new ApiError(404, `demo_mode_has_no_handler_for_${route}`)
}
