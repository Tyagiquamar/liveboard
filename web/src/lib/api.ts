'use client'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'

export class ApiError extends Error {
  status: number
  data: Record<string, unknown>

  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.data = data
  }

  get isOffline(): boolean {
    return this.status === 0
  }
}

export interface ApiOpts {
  method?: string
  body?: unknown
  key?: string
  queueOnFail?: { label: string }
}

function authHeaders(key?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = typeof window !== 'undefined' ? localStorage.getItem('lb_token') : null
  if (token) headers.Authorization = `Bearer ${token}`
  if (key) headers['x-client-request-id'] = key
  return headers
}

export async function api<T>(path: string, opts: ApiOpts = {}): Promise<T> {
  if (process.env.NEXT_PUBLIC_DEMO === '1') {
    const { demoApi } = await import('./demo')
    return demoApi<T>(path, opts)
  }
  const method = opts.method ?? 'GET'
  let res: Response
  try {
    res = await fetch(API + path, {
      method,
      headers: authHeaders(opts.key),
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    })
  } catch {
    if (opts.queueOnFail && opts.key) {
      const { useOutbox } = await import('./store')
      useOutbox.getState().enqueue({
        key: opts.key,
        method,
        path,
        body: opts.body,
        label: opts.queueOnFail.label
      })
    }
    throw new ApiError(0, 'network_unreachable', { offline: true })
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiError(res.status, (data.error as string) || res.statusText || 'request_failed', data)
  }
  return (await res.json()) as T
}

export async function flushOutbox(): Promise<number> {
  const { useOutbox } = await import('./store')
  const items = [...useOutbox.getState().items]
  let flushed = 0
  for (const item of items) {
    try {
      await api(item.path, { method: item.method, body: item.body, key: item.key })
      useOutbox.getState().remove(item.key)
      flushed++
    } catch (e) {
      if (e instanceof ApiError && e.isOffline) break
      useOutbox.getState().remove(item.key)
      flushed++
    }
  }
  return flushed
}
