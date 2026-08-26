# Deploying LiveBoard

LiveBoard is a split deploy: the **API + Socket.IO server** needs a long-running host (Railway / Render / Fly.io / any VPS — serverless platforms do not keep WebSocket connections alive), **MongoDB** can be any managed instance (Atlas free tier works), and the **web** frontend deploys to Vercel.

> Why this doc exists: the Railway trial on the owner account expired, so the backend is currently not hosted. The Vercel deployment runs in demo mode (`NEXT_PUBLIC_DEMO=1`, in-browser mock). To restore the full multi-user experience, provision the three pieces below — no code changes required, everything is verified locally end-to-end.

## 1. MongoDB

- Create a free cluster (e.g. [MongoDB Atlas M0](https://www.mongodb.com/cloud/atlas)) or point at any MongoDB 6+.
- Note the connection string: `mongodb+srv://<user>:<password>@<host>/liveboard`.

## 2. API + Socket.IO (`server/`)

Any long-running host. The repo ships `server/Dockerfile` (Node 20, installs deps, runs `npx tsx src/main.ts`).

Environment variables:

| Var | Example | Notes |
| --- | --- | --- |
| `MONGO_URI` | `mongodb+srv://…` | from step 1 |
| `JWT_SECRET` | long random string | `openssl rand -hex 32` |
| `CLIENT_ORIGIN` | `https://<your-vercel-domain>` | CORS allow-list (comma-separate for preview domains) |
| `PORT` | `4000` | some hosts inject their own — respect it |
| `REDIS_URL` | *(optional)* | enables the Socket.IO Redis adapter for multi-instance fanout |

After deploy, verify: `GET https://<api-host>/api/health` → `{"ok":true}`.

Seed the demo tenant once (from a machine with access, or the host's shell):

```bash
cd server
MONGO_URI=<your-uri> npx tsx src/seed.ts
```

### Railway (example)

```bash
cd server
railway init            # requires an active plan/trial
railway up              # uses the Dockerfile
railway variables set MONGO_URI=… JWT_SECRET=… CLIENT_ORIGIN=https://<vercel-domain> PORT=4000
```

### Render / Fly / VPS

Use the same Dockerfile; publish the port; set the same env vars.

## 3. Web (`web/`) on Vercel

The frontend is already on Vercel in demo mode. To point it at the real backend:

1. Vercel project **liveboard** → Settings → Environment Variables:
   - `NEXT_PUBLIC_API_URL` = `https://<api-host>/api`
   - `NEXT_PUBLIC_WS_URL` = `https://<api-host>`
   - **Remove** `NEXT_PUBLIC_DEMO` (this disables the in-browser mock).
2. Redeploy (Deployments → Redeploy, or `npx vercel --prod` from `web/`).

`NEXT_PUBLIC_*` values are baked into the client bundle at build time — a redeploy is required after changing them.

## 4. Verify the full stack

```bash
# two-browser realtime check against production
cd web
WEB_URL=https://<your-vercel-domain> node scripts/two-window.mjs
```

Expected: 7/7 checks pass (login/board load, cross-client presence, live drag sync, persistence across reload, reconnect resync after an offline gap, live comment sync, mobile viewport).

## Cost notes

- Atlas M0 + Vercel Hobby are free; the only paid piece is the API host once a trial ends (Railway/Render entry tiers are ~$5/mo). A $4–6/mo VPS running `docker compose up` from the repo root also serves the whole stack.
