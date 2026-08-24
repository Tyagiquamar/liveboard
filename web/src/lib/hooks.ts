'use client'

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query'
import { api, ApiError, flushOutbox } from './api'
import { internal } from './events'
import { clearDirty, markDirty, useSession, useToasts } from './store'
import { newRequestId } from './utils'
import type { ActivityEvent, Comment, Issue, Member, Page, Project, Status, Workspace } from './types'

export interface IssueFilters {
  projectId?: string
  status?: Status
  assigneeId?: string
  priority?: number | ''
  q?: string
}

function qs(filters: object): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters as Record<string, unknown>)) {
    if (v === undefined || v === null || v === '') continue
    params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `&${s}` : ''
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<Page<Workspace>>('/workspaces'),
    enabled: typeof window !== 'undefined' && !!localStorage.getItem('lb_token')
  })
}

export function useMembers(wsId: string) {
  return useQuery({
    queryKey: ['members', wsId],
    queryFn: () => api<{ items: Member[] }>(`/workspaces/${wsId}/members`),
    enabled: !!wsId
  })
}

export function useProjects(wsId: string) {
  return useQuery({
    queryKey: ['projects', wsId],
    queryFn: () => api<{ items: Project[] }>(`/workspaces/${wsId}/projects`),
    enabled: !!wsId
  })
}

export function useAllIssues(wsId: string, filters: IssueFilters) {
  return useQuery({
    queryKey: ['issues', wsId, filters],
    queryFn: async (): Promise<Issue[]> => {
      const all: Issue[] = []
      let cursor: string | null = null
      for (;;) {
        const page: Page<Issue> = await api<Page<Issue>>(
          `/workspaces/${wsId}/issues?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${qs(filters)}`
        )
        all.push(...page.items)
        if (!page.nextCursor || page.items.length === 0) break
        cursor = page.nextCursor
      }
      return all
    },
    enabled: !!wsId
  })
}

export function useIssuesInfinite(wsId: string, filters: IssueFilters) {
  return useInfiniteQuery({
    queryKey: ['issues-inf', wsId, filters],
    queryFn: ({ pageParam }) =>
      api<Page<Issue>>(
        `/workspaces/${wsId}/issues?limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}${qs(filters)}`
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!wsId
  })
}

export function useActivity(wsId: string) {
  return useInfiniteQuery({
    queryKey: ['activity', wsId],
    queryFn: ({ pageParam }) =>
      api<Page<ActivityEvent>>(
        `/workspaces/${wsId}/activity?limit=40${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!wsId
  })
}

export function useIssue(issueId: string | null) {
  return useQuery({
    queryKey: ['issue', issueId],
    queryFn: () => api<{ issue: Issue }>(`/issues/${issueId}`).then((r) => r.issue),
    enabled: !!issueId
  })
}

export function useComments(issueId: string | null) {
  return useInfiniteQuery({
    queryKey: ['comments', issueId],
    queryFn: ({ pageParam }) =>
      api<Page<Comment>>(`/issues/${issueId}/comments?limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!issueId
  })
}

interface SnapshotEntry {
  key: readonly unknown[]
  data: unknown
}

function snapshotIssueQueries(qc: QueryClient, wsId: string): SnapshotEntry[] {
  const snaps: SnapshotEntry[] = []
  for (const q of qc.getQueryCache().findAll({ queryKey: ['issues', wsId] })) {
    snaps.push({ key: q.queryKey, data: qc.getQueryData(q.queryKey) })
  }
  return snaps
}

function restoreSnapshots(qc: QueryClient, snaps: SnapshotEntry[]): void {
  for (const s of snaps) {
    qc.setQueryData(s.key, s.data)
  }
}

export function offlineToast(): void {
  useToasts.getState().push('info', 'You are offline — change saved to outbox and will retry')
}

function isOfflineErr(e: unknown): boolean {
  return e instanceof ApiError && e.isOffline
}

export interface CreateIssueInput {
  projectId: string
  title: string
  description?: string
  status?: Status
  priority?: number
  assigneeId?: string | null
  labels?: string[]
}

export function useCreateIssue(wsId: string) {
  const qc = useQueryClient()
  return useMutation<Issue, Error, CreateIssueInput & { clientRequestId?: string }, CreateCtx>({
    mutationFn: async (input) => {
      const key = input.clientRequestId ?? newRequestId()
      const res = await api<{ issue: Issue }>(`/workspaces/${wsId}/issues`, {
        method: 'POST',
        body: { ...input, clientRequestId: key },
        key,
        queueOnFail: { label: 'Create issue' }
      })
      return res.issue
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['issues', wsId] })
      const snaps = snapshotIssueQueries(qc, wsId)
      const tempId = `tmp-${newRequestId()}`
      const me = useSession.getState().me
      const temp: Issue = {
        id: tempId,
        workspaceId: wsId,
        projectId: input.projectId,
        projectKey: '',
        number: 0,
        key: '',
        title: input.title,
        description: input.description ?? '',
        status: input.status ?? 'todo',
        priority: input.priority ?? 0,
        assigneeId: input.assigneeId ?? null,
        reporterId: me?.id ?? '',
        labels: input.labels ?? [],
        order: -999999 - Math.random(),
        version: 1,
        commentCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pending: true
      }
      internal.insertIssueEverywhere(qc, wsId, temp)
      return { snaps, tempId }
    },
    onSuccess: (issue, _vars, ctx) => {
      if (ctx?.tempId) internal.removeIssueEverywhere(qc, wsId, ctx.tempId)
      internal.upsertIssueEverywhere(qc, wsId, issue)
    },
    onError: (e, _vars, ctx) => {
      if (isOfflineErr(e)) {
        offlineToast()
        return
      }
      if (ctx) restoreSnapshots(qc, ctx.snaps)
      useToasts.getState().push('error', e.message)
    }
  })
}

interface UpdateCtx {
  snaps: SnapshotEntry[]
  id: string
}

interface CreateCtx {
  snaps: SnapshotEntry[]
  tempId: string
}

interface DeleteCtx {
  snaps: SnapshotEntry[]
}

export interface UpdateIssueVars {
  id: string
  patch: Partial<Issue>
  baseVersion?: number
  conflictGuard?: boolean
}

export function useUpdateIssue(wsId: string) {
  const qc = useQueryClient()
  return useMutation<Issue, Error, UpdateIssueVars, UpdateCtx>({
    mutationFn: async ({ id, patch, baseVersion }) => {
      const key = newRequestId()
      const res = await api<{ issue: Issue }>(`/issues/${id}`, {
        method: 'PATCH',
        body: { ...patch, ...(baseVersion != null ? { baseVersion } : {}), clientRequestId: key },
        key,
        queueOnFail: { label: 'Edit issue' }
      })
      return res.issue
    },
    onMutate: async ({ id, patch }) => {
      markDirty(id)
      await qc.cancelQueries({ queryKey: ['issues', wsId] })
      const snaps = snapshotIssueQueries(qc, wsId)
      internal.patchIssueEverywhere(qc, wsId, id, patch)
      return { snaps, id }
    },
    onSuccess: (issue) => {
      clearDirty(issue.id)
      internal.upsertIssueEverywhere(qc, wsId, issue)
    },
    onError: (e, vars, ctx) => {
      if (isOfflineErr(e)) {
        offlineToast()
        return
      }
      if (ctx) restoreSnapshots(qc, ctx.snaps)
      if (e instanceof ApiError && e.status === 409) {
        const current = e.data.current as Issue | undefined
        if (current) {
          internal.upsertIssueEverywhere(qc, wsId, current)
          useToasts.getState().push('info', 'This issue was updated by someone else — showing latest version')
        }
      } else {
        void vars
        useToasts.getState().push('error', e.message)
      }
    }
  })
}

export function useDeleteIssue(wsId: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }, DeleteCtx>({
    mutationFn: async ({ id }) => {
      await api(`/issues/${id}`, { method: 'DELETE', queueOnFail: { label: 'Delete issue' } })
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ['issues', wsId] })
      const snaps = snapshotIssueQueries(qc, wsId)
      internal.removeIssueEverywhere(qc, wsId, id)
      return { snaps }
    },
    onError: (e, _v, ctx) => {
      if (isOfflineErr(e)) {
        offlineToast()
        return
      }
      if (ctx) restoreSnapshots(qc, ctx.snaps)
      useToasts.getState().push('error', e.message)
    }
  })
}

export function useAddComment(issueId: string) {
  const qc = useQueryClient()
  return useMutation<Comment, Error, { body: string; mentionIds: string[] }, { snaps?: SnapshotEntry[] }>({
    mutationFn: async (vars) => {
      const key = newRequestId()
      const res = await api<{ comment: Comment }>(`/issues/${issueId}/comments`, {
        method: 'POST',
        body: { ...vars, clientRequestId: key },
        key,
        queueOnFail: { label: 'Post comment' }
      })
      return res.comment
    },
    onSuccess: (comment) => {
      internal.prependComment(qc, comment)
    },
    onError: (e) => {
      if (isOfflineErr(e)) offlineToast()
      else useToasts.getState().push('error', e.message)
    }
  })
}

export function useAddMember(wsId: string) {
  const qc = useQueryClient()
  return useMutation<Member, Error, { username: string }>({
    mutationFn: async (body) => {
      const res = await api<{ member: Member }>(`/workspaces/${wsId}/members`, { method: 'POST', body })
      return res.member
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['members', wsId] })
      useToasts.getState().push('success', 'Member added')
    },
    onError: (e) => {
      useToasts.getState().push(
        'error',
        e instanceof ApiError && e.status === 409 ? 'Already a member' : e.message
      )
    }
  })
}

export function useCreateProject(wsId: string) {
  const qc = useQueryClient()
  return useMutation<Project, Error, { name: string }>({
    mutationFn: async (body) => {
      const res = await api<{ project: Project }>(`/workspaces/${wsId}/projects`, { method: 'POST', body })
      return res.project
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', wsId] })
      useToasts.getState().push('success', 'Project created')
    },
    onError: (e) => useToasts.getState().push('error', e.message)
  })
}

export function useCreateWorkspace() {
  const qc = useQueryClient()
  return useMutation<Workspace, Error, { name: string }>({
    mutationFn: async (body) => {
      const res = await api<{ workspace: Workspace }>('/workspaces', { method: 'POST', body })
      return res.workspace
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workspaces'] })
      useToasts.getState().push('success', 'Workspace created')
    },
    onError: (e) => useToasts.getState().push('error', e.message)
  })
}
