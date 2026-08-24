'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useSession, type Me } from '@/lib/store'

type Mode = 'login' | 'register'

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">L</span>
          <div>
            <div className="text-lg font-semibold tracking-tight">LiveBoard</div>
            <div className="text-xs text-ink-muted">Real-time collaborative workspace</div>
          </div>
        </div>

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
            <Field label="Password">
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

          <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-ink-faint">
            <span className="h-px flex-1 bg-line" /> or try the demo <span className="h-px flex-1 bg-line" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['alice', 'bob', 'carol'] as const).map((u) => (
              <button key={u} disabled={busy} onClick={() => void enter('/auth/demo', { username: u })} className="btn-ghost capitalize">
                {u}
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-faint">
            Demo seeds “Acme Inc”. Open two browsers as different users to watch live collaboration.
          </p>
        </div>
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
