import mongoose from 'mongoose'
import { User, hashPassword } from '../models/user'
import { Workspace } from '../models/workspace'
import { Member } from '../models/member'
import { Project } from '../models/project'
import { Issue, STATUSES, type Status } from '../models/issue'
import { Counter } from '../models/counter'

export const DEMO_USERNAMES = ['alice', 'bob', 'carol'] as const

const DEMO_PROFILES = [
  { username: 'alice', name: 'Alice Chen', email: 'alice@demo.dev' },
  { username: 'bob', name: 'Bob Marley', email: 'bob@demo.dev' },
  { username: 'carol', name: 'Carol Diaz', email: 'carol@demo.dev' }
]

const SAMPLE_ISSUES: Array<{
  title: string
  description: string
  status: Status
  priority: number
  assignee: string | null
  labels: string[]
}> = [
  {
    title: 'Realtime presence avatars flicker on reconnect',
    description: 'Presence list briefly drops the reconnecting user. Investigate debounce window.',
    status: 'in_progress',
    priority: 3,
    assignee: 'alice',
    labels: ['realtime', 'bug']
  },
  {
    title: 'Kanban drag feels sticky on touch devices',
    description: 'Increase activation distance for pointer sensor; test on iOS Safari.',
    status: 'todo',
    priority: 2,
    assignee: 'bob',
    labels: ['frontend']
  },
  {
    title: 'Add keyboard shortcuts cheat sheet',
    description: 'Press ? to open a shortcut overlay listing all bindings.',
    status: 'backlog',
    priority: 1,
    assignee: null,
    labels: ['polish']
  },
  {
    title: 'Search should match issue keys like PLAT-12',
    description: '',
    status: 'todo',
    priority: 2,
    assignee: 'carol',
    labels: ['search']
  },
  {
    title: 'Activity feed pagination cursor',
    description: 'Cursor by seq instead of offset so replays never skip events.',
    status: 'done',
    priority: 3,
    assignee: 'alice',
    labels: ['backend']
  },
  {
    title: 'Mention autocomplete should filter workspace members',
    description: '@username popup lists only current workspace members.',
    status: 'done',
    priority: 2,
    assignee: 'bob',
    labels: ['mentions']
  },
  {
    title: 'Dark theme contrast audit',
    description: 'Check muted text against WCAG AA.',
    status: 'backlog',
    priority: 0,
    assignee: null,
    labels: ['a11y', 'design']
  },
  {
    title: 'WebSocket auth rejects expired JWT with clear error',
    description: 'Client should route to login on unauthorized close code.',
    status: 'done',
    priority: 1,
    assignee: 'alice',
    labels: ['security']
  }
]

export async function ensureSeedData(): Promise<{ workspaceId: string }> {
  const users = new Map<string, { _id: mongoose.Types.ObjectId; username: string }>()
  for (const profile of DEMO_PROFILES) {
    let u = await User.findOne({ username: profile.username }).exec()
    if (!u) {
      u = await User.create({
        email: profile.email,
        name: profile.name,
        username: profile.username,
        passwordHash: await hashPassword('demo1234')
      })
    }
    users.set(profile.username, { _id: u._id as mongoose.Types.ObjectId, username: u.username })
  }

  const alice = users.get('alice')!

  let ws = await Workspace.findOne({ slug: 'acme' }).exec()
  if (!ws) {
    ws = await Workspace.create({
      name: 'Acme Inc',
      slug: 'acme',
      createdBy: alice._id as mongoose.Types.ObjectId
    })
  }

  for (const username of DEMO_USERNAMES) {
    const u = users.get(username)!
    await Member.updateOne(
      { workspaceId: ws._id, userId: u._id },
      { $setOnInsert: { role: username === 'alice' ? 'owner' : 'member' } },
      { upsert: true }
    ).exec()
  }

  let project = await Project.findOne({ workspaceId: ws._id, key: 'PLAT' }).exec()
  if (!project) {
    project = await Project.create({
      workspaceId: ws._id,
      name: 'Platform',
      key: 'PLAT',
      createdBy: alice._id as mongoose.Types.ObjectId
    })
  }

  const issueCount = await Issue.countDocuments({ projectId: project._id }).exec()
  if (issueCount === 0) {
    const columnCursor = new Map<Status, number>()
    for (const sample of SAMPLE_ISSUES) {
      const idx = columnCursor.get(sample.status) ?? 0
      columnCursor.set(sample.status, idx + 1)
      const number = await Counter.next(`num:${String(project._id)}`)
      const assignee = sample.assignee ? users.get(sample.assignee)! : null
      await Issue.create({
        workspaceId: ws._id,
        projectId: project._id,
        projectKey: 'PLAT',
        number,
        key: `PLAT-${number}`,
        title: sample.title,
        description: sample.description,
        status: sample.status,
        statusRank: STATUSES.indexOf(sample.status),
        priority: sample.priority,
        assigneeId: assignee ? assignee._id : null,
        reporterId: alice._id as mongoose.Types.ObjectId,
        labels: sample.labels,
        order: -(idx + 1) * 1024,
        version: 1
      })
    }
  }

  return { workspaceId: String(ws._id) }
}
