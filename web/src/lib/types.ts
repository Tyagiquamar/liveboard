export interface UserJSON {
  id: string
  email: string
  name: string
  username: string
  color: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
  createdBy: string
  createdAt: string
}

export interface Member {
  id: string
  role: string
  user: UserJSON | null
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  key: string
  createdBy: string
  createdAt: string
}

export type Status = 'backlog' | 'todo' | 'in_progress' | 'done'

export interface Issue {
  id: string
  workspaceId: string
  projectId: string
  projectKey: string
  number: number
  key: string
  title: string
  description: string
  status: Status
  priority: number
  assigneeId: string | null
  reporterId: string
  labels: string[]
  order: number
  version: number
  commentCount: number
  createdAt: string
  updatedAt: string
  pending?: boolean
}

export interface Comment {
  id: string
  issueId: string
  workspaceId: string
  authorId: string
  body: string
  mentionIds: string[]
  createdAt: string
}

export interface ActivityEvent {
  id: string
  seq: number
  workspaceId: string
  type: string
  actor: { id: string; name: string; color: string }
  entityId: string
  data: Record<string, unknown>
  ts: string
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}
