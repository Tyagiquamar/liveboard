'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useSession, type Me } from '@/lib/store'

type Mode = 'login' | 'register'

const DEMO_USERS = [
  { username: 'alice', name: 'Alice Nguyen' },
  { username: 'bob', name: 'Bob Marín' },
  { username: 'carol', name: 'Carol Diaz' },
  { username: 'dave', name: 'Dave Okafor' }
] as const

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function enter(path: '/auth/login' | '/auth/register' | '/auth/demo', body?: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      const res = await api<{ token: string; user: Me; workspaceId?: string | null }>(path, { method: 'POST', body })
      useSession.getState().setAuth(res.token, res.user)
      if (res.workspaceId) router.replace(`/w/${res.workspaceId}/board`)
      else router.replace('/w')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">L</span>
          <div>
            <div className="text-lg font-semibold tracking-tight">LiveBoard</div>
            <div className="text-xs text-ink-muted">Real-time collaborative workspace</div>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-accent/30 bg-panel p-5 shadow-xl">
          <h1 className="text-sm font-semibold">Try the live demo</h1>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">
            Pick an identity to jump straight into the seeded <span className="text-ink-muted">Acme Product Team</span> workspace.
            Open a second browser window as another member to watch changes sync in real time.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_USERS.map((u) => (
              <button
                key={u.username}
                disabled={busy}
                onClick={() => void enter('/auth/demo', { username: u.username })}
                className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-left transition-colors hover:border-accent/60 hover:bg-raise disabled:opacity-50"
              >
                <img src={`/avatars/${u.username}.svg`} alt="" width={28} height={28} className="shrink-0 rounded-full" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{u.name}</span>
                  <span className="block text-[10px] text-ink-faint">@{u.username}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {process.env.NEXT_PUBLIC_DEMO === '1' ? (
          <p className="text-center text-[11px] leading-relaxed text-ink-faint">
            This deployment runs in demo mode — the hosted backend is not part of it.
            Clone the repo and run <code className="text-ink-muted">docker compose up</code> for the full stack.
          </p>
        ) : (
        <div className="rounded-xl border border-line bg-panel p-5 shadow-xl">
          <div className="mb-4 flex rounded-lg bg-canvas p-1" role="tablist" aria-label="Auth mode">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  mode === m ? 'bg-raise text-ink shadow' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (mode === 'login') void enter('/auth/login', { email, password })
              else void enter('/auth/register', { email, name, username, password })
            }}
          >
            {mode === 'register' && (
              <>
                <Field label="Name">
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={1} />
                </Field>
                <Field label="Username" hint="used for @mentions">
                  <input
                    className={inputCls}
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    pattern="[a-z0-9_]{2,24}"
                    title="2–24 chars: a-z 0-9 _"
                    required
                  />
                </Field>
              </>
            )}
            <Field label="Email">
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" hint="demo accounts: demo1234">
              <input
                className={inputCls}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
        )}
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-line bg-canvas px-3 py-2 text-base outline-none transition-colors placeholder:text-ink-faint focus:border-accent'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-ink-muted">
        {label}
        {hint && <span className="text-[10px] font-normal text-ink-faint">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
