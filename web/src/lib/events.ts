'use client'

import type { QueryClient } from '@tanstack/react-query'
import { lbs, type EventJSON } from './socket'
import { isDirty, useSession, useToasts, useUi } from './store'
import type { ActivityEvent, Comment, Issue, Page } from './types'

type IssuesCacheEntry = Issue[] | { pages: Array<Page<Issue>> }

function mapIssuesData(data: IssuesCacheEntry | undefined, fn: (i: Issue) => Issue | null): IssuesCacheEntry | undefined {
  if (!data) return data
  if (Array.isArray(data)) {
    const out: Issue[] = []
    for (const i of data) {
      const r = fn(i)
      if (r === null) continue
      out.push(r ?? i)
    }
    return out
  }
  return {
    pages: data.pages.map((p) => ({
      items: p.items.flatMap((i) => {
        const r = fn(i)
        return r === null ? [] : [r]
      }),
      nextCursor: p.nextCursor
    }))
  }
}

function upsertIssueEverywhere(qc: QueryClient, wsId: string, issue: Issue): void {
  qc.setQueriesData<IssuesCacheEntry>({ queryKey: ['issues', wsId] }, (data) =>
    mapIssuesData(data, (i) => (i.id === issue.id ? { ...i, ...issue, pending: false } : i))
  )
  const existing = qc.getQueryData<Issue>(['issue', issue.id])
  qc.setQueryData<Issue>(['issue', issue.id], { ...(existing ?? {}), ...issue })
}

function patchIssueEverywhere(
  qc: QueryClient,
  wsId: string,
  issueId: string,
  patch: Partial<Issue>
): void {
  qc.setQueriesData<IssuesCacheEntry>({ queryKey: ['issues', wsId] }, (data) =>
    mapIssuesData(data, (i) => (i.id === issueId ? { ...i, ...patch } : i))
  )
  const single = qc.getQueryData<Issue>(['issue', issueId])
  if (single) qc.setQueryData<Issue>(['issue', issueId], { ...single, ...patch })
}

function removeIssueEverywhere(qc: QueryClient, wsId: string, issueId: string): void {
  qc.setQueriesData<IssuesCacheEntry>({ queryKey: ['issues', wsId] }, (data) =>
    mapIssuesData(data, (i) => (i.id === issueId ? null : i))
  )
  qc.removeQueries({ queryKey: ['issue', issueId] })
}

function prependActivity(qc: QueryClient, ev: EventJSON): void {
  qc.setQueryData<Page<ActivityEvent>>(['activity', ev.workspaceId], (page) => {
    const item = ev as unknown as ActivityEvent
    if (!page) return { items: [item], nextCursor: null }
    if (page.items.some((e) => e.id === ev.id)) return page
    return { ...page, items: [item, ...page.items].slice(0, 200) }
  })
}

function prependComment(qc: QueryClient, c: Comment): void {
  qc.setQueryData<{ pages: Array<Page<Comment>> }>(['comments', c.issueId], (data) => {
    if (!data) return data
    const pages = [...data.pages]
    if (!pages.length) return data
    if (pages.some((p) => p.items.some((x) => x.id === c.id))) return data
    const first = { ...pages[0], items: [c, ...pages[0].items] }
    pages[0] = first
    return { ...data, pages }
  })
}

function bumpCommentCount(qc: QueryClient, wsId: string, issueId: string): void {
  qc.setQueriesData<IssuesCacheEntry>({ queryKey: ['issues', wsId] }, (data) =>
    mapIssuesData(data, (i) => (i.id === issueId ? { ...i, commentCount: (i.commentCount ?? 0) + 1 } : i))
  )
}

function insertIssueEverywhere(qc: QueryClient, wsId: string, issue: Issue): void {
  qc.setQueriesData<IssuesCacheEntry>({ queryKey: ['issues', wsId] }, (data) => {
    if (!data) return data
    if (Array.isArray(data)) {
      const without = data.filter((i) => i.id !== issue.id)
      const idx = without.findIndex((i) => i.status === issue.status && i.order < issue.order)
      if (idx === -1) return [...without, issue]
      return [...without.slice(0, idx), issue, ...without.slice(idx)]
    }
    return {
      pages: data.pages.map((p) => ({
        ...p,
        items: [issue, ...p.items.filter((i) => i.id !== issue.id)]
      }))
    }
  })
}

export function attachEventListener(qc: QueryClient): () => void {
  return lbs.onEvents((ev: EventJSON) => {
    prependActivity(qc, ev)

    switch (ev.type) {
      case 'issue.created':
      case 'issue.updated': {
        const issue = ev.data.issue as Issue | undefined
        if (!issue) break
        if (isDirty(issue.id)) break
        upsertIssueEverywhere(qc, ev.workspaceId, { ...issue, workspaceId: ev.workspaceId })
        break
      }
      case 'issue.deleted': {
        removeIssueEverywhere(qc, ev.workspaceId, ev.entityId)
        const ui = useUi.getState()
        if (ui.activeIssueId === ev.entityId) ui.closeIssue()
        break
      }
      case 'comment.created': {
        const comment = ev.data.comment as Comment | undefined
        if (!comment) break
        prependComment(qc, comment)
        bumpCommentCount(qc, ev.workspaceId, ev.entityId)
        const mentionIds = (ev.data.mentionIds as string[] | undefined) ?? []
        const me = useSession.getState().me
        if (me && mentionIds.includes(me.id)) {
          useToasts.getState().push(
            'info',
            `${ev.actor.name} mentioned you in ${(ev.data.issueTitle as string) ?? 'an issue'}`
          )
        }
        break
      }
      case 'project.created':
        qc.invalidateQueries({ queryKey: ['projects', ev.workspaceId] })
        break
      case 'member.added':
        qc.invalidateQueries({ queryKey: ['members', ev.workspaceId] })
        break
    }
  })
}

export const internal = {
  upsertIssueEverywhere,
  patchIssueEverywhere,
  removeIssueEverywhere,
  insertIssueEverywhere,
  prependComment,
  mapIssuesData
}
