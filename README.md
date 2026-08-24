# LiveBoard

Real-time collaborative project workspace — lightweight Linear × Notion collaboration, not a static task app.

Next.js · React · TypeScript · Node.js · Socket.IO · MongoDB · Redis pub/sub (optional) · Docker

---

## Quick start (Docker)

```bash
docker compose up --build
```

- Web: http://localhost:3000
- API + WebSocket: http://localhost:4000

Open the app in two browsers, click **alice** / **bob** on the login screen, and watch board moves, comments,
typing dots, presence avatars and activity sync live between the two clients.

## Quick start (local dev)

```bash
# 1. infrastructure
docker compose up -d mongo redis        # or point MONGO_URI at any MongoDB 6+

# 2. server
cd server && npm install && cp .env.example .env
npm run seed                            # creates Acme Inc + demo users (pw: demo1234)
npm run dev                             # http://localhost:4000

# 3. web
cd ../web && npm install
npm run dev                             # http://localhost:3000
```

## The proof: two clients → one consistent server state

```bash
docker run -d --name lb-test-mongo -p 28017:27017 mongo:7   # or export TEST_MONGO_URI
cd server
TEST_MONGO_URI=mongodb://127.0.0.1:28017/liveboard-test npm test
```

`server/test/consistency.test.ts` boots the real HTTP+Socket.IO server against a fresh DB and asserts:

1. **Identical event streams** — two authenticated socket clients subscribe to the same workspace; after
   interleaved writes from both users (issue creates, a concurrent status move and a comment), both clients
   have received byte-identical JSON events with the same strictly-increasing per-workspace `seq`, zero
   duplicates.
2. **Convergence** — reducing each client's own event stream into local issue state produces exactly the same
   documents the server returns over REST (`title/status/order/version/assigneeId`). No client is allowed to
   drift; there is no local-only state.
3. **Idempotent mutations** — replaying the same `clientRequestId` returns the original result instead of
   creating a duplicate.
4. **Conflict strategy** — a stale `baseVersion` write gets `409` plus the current document.
5. **Isolation & auth** — non-members are rejected by REST (`403`) and by the WS subscription ack; unauthenticated
   WS handshakes fail.

## Architecture

```
web/            Next.js 14 App Router SPA-style dashboard
  lib/api       fetch wrapper: bearer auth, x-client-request-id idempotency keys,
                offline detection → persistent outbox (zustand persist)
  lib/socket    Socket.IO singleton: JWT handshake, seen-id LRU dedupe, per-workspace
                lastSeq watermark, auto re-subscribe + catch-up replay on reconnect
  lib/events    server events → React Query cache pipeline (upserts, comment counts,
                activity prepend, mention toasts), dirty-edit guards
  components    Kanban (dnd-kit), table view, issue drawer, comments w/ @mentions,
                command menu (cmdk), presence/typing/viewers UI
server/
  routes        REST: auth, workspaces/members/activity, projects,
                issues (cursor pagination, search/filter/sort), comments
  services      activity log (atomic per-ws sequence via counter collection),
                idempotency store, seed data
  realtime      Socket.IO gateway: membership-checked rooms (`ws:<id>`),
                presence, typing timers, issue viewers, ordered replay
```

### Event contract

Every persisted mutation appends an activity event:

```jsonc
{
  "id": "66f…",            // unique event id (clients dedupe on this)
  "seq": 12,               // strictly increasing per workspace (replay cursor)
  "workspaceId": "…",
  "type": "issue.updated",
  "actor": { "id": "…", "name": "Alice", "color": "#f97316" },
  "entityId": "…",         // issue/comment/project/member id
  "data": { … },           // type-specific payload incl. full fresh entity doc
  "ts": "2026-08-24T…"
}
```

Events fan out only inside `ws:<workspaceId>` rooms. Reconnecting clients send their last `seq`
(`ws.subscribe { sinceSeq }`) and receive everything they missed as an ordered `event.batch` before going live;
beyond a 2000-event cap the client falls back to refetching lists.

### Engineering decisions

| Concern | Strategy |
| --- | --- |
| Optimistic mutations | React Query cache patched instantly; every write carries `clientRequestId`; rollback on hard errors; offline writes keep optimistic state and flush later. |
| Duplicate protection | Client-side seen-set LRU on event ids; server-side idempotency keys return stored results for retried writes. |
| Conflict strategy | Metadata/status/order = last-write-wins (version bumps each write). Title/description edits send `baseVersion` → `409 { current }` lets the user rebase consciously. |
| Reconnect handling | Socket auto-reconnect + `sinceSeq` replay + outbox flush on reconnect; global connection banner mirrors state. |
| WS authorization | JWT verified in handshake middleware; room joins re-check workspace membership per subscription. |
| Workspace isolation | Membership checked on every REST route and every WS subscription; non-member reads/writes 403/404. |
| Pagination | Opaque cursors everywhere: issues list/search, comments, activity feed. |
| Presence/typing/viewers | In-memory registries keyed by socket id (multi-tab safe); typing auto-expires server-side; Redis adapter wired behind `REDIS_URL` for multi-instance fanout. |

## Keyboard shortcuts

`⌘K/Ctrl K` command menu · `/` focus search · `c` new issue · `b` board · `t` table · `g b/t/a` go-to chord · `?` cheat sheet · `Esc` close

## Tests

```bash
npm test          # consistency suite (see above)
npm run typecheck # tsc across server & web
```
