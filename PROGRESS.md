# LiveBoard — Build Log

Real-time collaborative project workspace (lightweight Linear × Notion collaboration).
Stack: Next.js · React · TypeScript · Node.js · Socket.IO · MongoDB · Redis pub/sub (optional) · Docker.

This file is the running progress document. It is updated as work happens — phases get checked off
and timestamped entries are appended to the build log at the bottom.

---

## Status board

- [x] Phase 1 — Scaffold repo, tooling, progress doc
- [x] Phase 2 — Server foundation: models, auth, REST APIs (workspaces, projects, issues, comments, activity w/ server-side pagination, search)
- [x] Phase 3 — Realtime gateway: WebSocket authorization, workspace-isolated rooms, presence, typing, viewers, event replay on reconnect
- [x] Phase 4 — Server verified (`tsc` clean, seed script)
- [x] Phase 5 — Web foundation: app shell, auth pages, API client w/ idempotency keys + offline outbox, socket client w/ dedupe + catch-up replay, event→cache pipeline
- [x] Phase 6 — Views: Kanban (drag/drop), table view, issue drawer (comments, @mentions, typing, viewers), live activity feed
- [x] Phase 7 — Command menu (⌘K), keyboard shortcuts, reconnect/offline UI, polish/a11y/mobile
- [x] Phase 8 — Two-client consistency test proving shared server state + full suite green
- [x] Phase 9 — Docker Compose, README, final verification

## Engineering decisions

| Concern | Strategy |
| --- | --- |
| Optimistic mutations | Client patches React-Query cache immediately; every mutation carries `clientRequestId`; rollback on failure; server ack/event is authoritative. |
| Duplicate-event protection | Every persisted event has a globally unique `id`; clients keep a seen-set LRU and drop duplicates. Server mutations are idempotent via `clientRequestId` → stored result replayed on retry. |
| Conflict strategy | Metadata/status/order writes = last-write-wins (version bumped per write). Title/description edits send `baseVersion` → `409` with current doc if stale; client rebases. |
| Reconnect handling | Client persists last seen `seq` per workspace; on socket reconnect it re-subscribes with `sinceSeq` and the server replays missed events in order before going live. Failed HTTP mutations sit in a persistent outbox and flush (idempotently) when connectivity returns. |
| WS authorization | JWT verified in Socket.IO handshake middleware; every room join re-checks workspace membership. REST routes check membership on every request. |
| Workspace isolation | All events fan out only inside `ws:<workspaceId>` rooms; non-members cannot subscribe (ack error) nor read/write via REST (403/404). |
| Pagination | Cursor-based (`_id` / `seq` opaque cursors) for issues list+search, comments, and activity feed. |
| Activity schema | `{ id, seq (monotonic per workspace), type, actor, entityId, data, ts }` appended atomically via counter collection; doubles as the realtime event log + catch-up replay source. |

## Keyboard shortcuts

`⌘K` command menu · `/` search/filter · `c` new issue · `b` board · `t` table · `g then b/t/a` go-to chord · `Esc` close

---

## Build log

- **2026-08-24 17:19** — Environment verified: node v24.15.0, npm 11.12.1, docker 29.7.2. Starting scaffold.
- **2026-08-24 17:26** — Repo scaffolded (`liveboard/` with `server/` + `web/`). Progress doc created.
- **2026-08-24 17:40** — Server foundation complete: JWT auth (register/login/demo/me), workspaces+members, projects, issues (cursor pagination, search/filter/sort, LWW updates w/ optional `baseVersion` optimistic-concurrency → 409+current doc, soft delete), comments (@mention resolution server-side against workspace members), activity feed (per-workspace monotonic `seq`, cursor pagination). Idempotent mutations via `clientRequestId` → stored-result replay.
- **2026-08-24 17:47** — Realtime gateway live: Socket.IO handshake JWT middleware, membership-checked room joins (`ws:<workspaceId>`), presence registry (multi-tab safe), typing indicators w/ auto-expiry timers, issue viewer lists, and catch-up replay — reconnecting clients pass `sinceSeq` and receive missed events as an ordered `event.batch` before the ack, capped at 2000 (beyond cap client falls back to refetch). Optional Redis adapter wired behind `REDIS_URL`.
- **2026-08-24 17:52** — `tsc --noEmit` passes clean. Writing the two-client consistency proof next.
- **2026-08-24 18:20** — Test harness: `mongodb-memory-server` binary download stalls on this network → tests prefer `TEST_MONGO_URI` (dockerized mongo:7 on :28017) and fall back to in-memory Mongo elsewhere; DB dropped per run for repeatability.
- **2026-08-24 19:14** — ✅ **Consistency suite green (3/3)**:
  1. *Convergence*: two clients (Alice REST+WS, Bob REST+WS) subscribe with `sinceSeq=0`; interleaved writes from both (5 issue creates, concurrent status move + comment w/ @mention). Both clients receive **identical, strictly-increasing, duplicate-free event streams** (byte-equal JSON), and each client's locally-reduced state equals the authoritative server state fetched via REST (`title/status/order/version/assigneeId`).
  2. *Idempotency + conflicts*: retried create with same `clientRequestId` returns the same issue (no duplicate); stale `baseVersion` PATCH → `409` carrying current doc.
  3. *Isolation & auth*: non-member gets `403` on REST, `{ok:false,error:'forbidden'}` ack on subscribe; unauthenticated WS handshake rejected.
  Bug found & fixed along the way: activity events were persisted but never pushed to the pub/sub bus — `appendEvent` now publishes to the room bus after append.
- Next: web foundation (Phase 5).
- **2026-08-24 19:55** — Web foundation complete: React Query + zustand stores, API client with `x-client-request-id` idempotency headers and a persistent offline **outbox** (failed mutations queue, flush on reconnect/online event), Socket.IO singleton with seen-id LRU dedupe + per-workspace `seq` watermarks (reconnect → `ws.subscribe {sinceSeq}` → ordered catch-up replay), event→cache pipeline applying server events into every matching query with dirty-edit guards.
- **2026-08-24 20:40** — Views shipped: Kanban board (dnd-kit drag/drop across columns with midpoint ordering + keyboard/touch fallbacks), table view (inline status/priority/assignee editing, cursor-paged “Load more”), issue drawer & deep-link page (guarded title/description editing via `baseVersion`→409 rebase UX, labels, assignee, status/priority, live viewers chips, comments w/ @mention autocomplete + typing indicators, per-issue history tab), live activity feed. Command menu (⌘K: actions/navigation/workspace switching/debounced issue search), shortcuts (`c` `/` `b` `t` `g·b/t/a` `?`), connection badge + reconnecting/offline banner, queued-changes chip.
- **2026-08-24 21:05** — Offline UX refined: mutations that fail offline keep their optimistic state and land in the outbox instead of rolling back; outbox replays idempotently (`clientRequestId` preserved) when connectivity returns.
- **2026-08-24 21:30** — End-to-end smoke test against the real server: `/api/health`, demo login, workspace listing, issues pagination (cursor present), activity endpoint — all OK. Fixed stale-process port clash during testing.
- **2026-08-24 21:45** — Final verification:
  - Server `tsc --noEmit`: clean
  - Consistency suite: **3/3 passing, three consecutive runs**
  - Web `tsc --noEmit`: clean
  - Web production build (`next build`): succeeds, all 8 routes compile
  - Infra: `docker-compose.yml` (mongo + redis + server + web with healthchecks), Dockerfiles for both apps, README with quickstart/architecture/test instructions
- **Build complete.** LiveBoard is runnable via `docker compose up --build`, or locally per README. The two-client consistency proof lives at `server/test/consistency.test.ts`.
