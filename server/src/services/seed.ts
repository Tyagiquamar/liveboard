import mongoose from 'mongoose'
import { User, hashPassword } from '../models/user'
import { Workspace } from '../models/workspace'
import { Member } from '../models/member'
import { Project } from '../models/project'
import { Issue, STATUSES, type Status } from '../models/issue'
import { Counter } from '../models/counter'
import { Comment } from '../models/comment'
import { appendEvent } from './activity'
import { colorFor } from '../util/text'

export const DEMO_USERNAMES = ['alice', 'bob', 'carol', 'dave'] as const

const DEMO_PROFILES = [
  { username: 'alice', name: 'Alice Nguyen', email: 'alice@demo.dev' },
  { username: 'bob', name: 'Bob Marín', email: 'bob@demo.dev' },
  { username: 'carol', name: 'Carol Diaz', email: 'carol@demo.dev' },
  { username: 'dave', name: 'Dave Okafor', email: 'dave@demo.dev' }
]

interface SampleIssue {
  title: string
  description: string
  status: Status
  priority: number
  assignee: string | null
  labels: string[]
}

const SAMPLE_PROJECTS: Array<{ key: string; name: string; issues: SampleIssue[] }> = [
  {
    key: 'PLAT',
    name: 'Platform',
    issues: [
      {
        title: 'Realtime presence avatars flicker on reconnect',
        description: 'Presence list briefly drops the reconnecting user before repopulating. Likely a race between socket rejoin and the presence broadcast.',
        status: 'in_progress',
        priority: 3,
        assignee: 'alice',
        labels: ['realtime', 'bug']
      },
      {
        title: 'Cursor pagination skips issues updated mid-scroll',
        description: 'Keyset cursors must include the sort field value plus id tiebreak so pages stay stable while rows change underneath.',
        status: 'done',
        priority: 3,
        assignee: 'carol',
        labels: ['backend']
      },
      {
        title: 'Typing indicators never clear if the tab crashes',
        description: 'Server-side expiry timers already exist; verify they fire when no explicit isTyping=false arrives.',
        status: 'done',
        priority: 1,
        assignee: 'bob',
        labels: ['realtime']
      },
      {
        title: 'Rate-limit the auth endpoints',
        description: 'Login/register currently accept unlimited attempts. Add a per-IP sliding window.',
        status: 'todo',
        priority: 3,
        assignee: 'dave',
        labels: ['security']
      },
      {
        title: 'Fall back to refetch when event replay is truncated',
        description: 'If a client reconnects after more than 2000 missed events, the replay cap truncates — client should refetch lists instead of applying a partial batch.',
        status: 'todo',
        priority: 2,
        assignee: 'alice',
        labels: ['realtime', 'backend']
      },
      {
        title: 'Search should match issue keys like PLAT-12',
        description: 'Detect the KEY-number pattern in queries and route straight to the unique compound index.',
        status: 'in_progress',
        priority: 2,
        assignee: 'carol',
        labels: ['search']
      },
      {
        title: 'Conflicts during concurrent edits surface as generic errors',
        description: 'The API returns 409 with the current document; some surfaces still render "request failed". Map version_conflict to the rebase UX everywhere.',
        status: 'backlog',
        priority: 2,
        assignee: null,
        labels: ['ux', 'backend']
      },
      {
        title: 'Audit indexes for workspace-scoped queries',
        description: 'Every hot query leads with workspaceId; confirm the planner agrees and drop unused indexes.',
        status: 'backlog',
        priority: 1,
        assignee: null,
        labels: ['backend', 'perf']
      },
      {
        title: 'Idempotency-key TTL vs flaky mobile networks',
        description: 'Keys expire after 7 days. Retries from the offline outbox can legally arrive later than that.',
        status: 'todo',
        priority: 1,
        assignee: 'dave',
        labels: ['backend']
      },
      {
        title: 'Presence list keeps users after they unsubscribe',
        description: 'ws.unsubscribe removed the socket from the room but left the presence registry entry until disconnect.',
        status: 'done',
        priority: 2,
        assignee: 'alice',
        labels: ['realtime', 'bug']
      },
      {
        title: 'Soft-deleted issues still appear in search results',
        description: 'Text search forgot the deletedAt:null filter; list views were fine.',
        status: 'done',
        priority: 4,
        assignee: 'bob',
        labels: ['bug', 'backend']
      },
      {
        title: 'Structured logs with correlation ids',
        description: 'Thread a request id through REST handlers and socket middleware for greppable production logs.',
        status: 'backlog',
        priority: 0,
        assignee: null,
        labels: ['infra']
      }
    ]
  },
  {
    key: 'WEB',
    name: 'Web App',
    issues: [
      {
        title: 'Kanban drag feels sticky on touch devices',
        description: 'Increase the pointer-sensor activation distance and verify on iOS Safari.',
        status: 'todo',
        priority: 2,
        assignee: 'bob',
        labels: ['frontend']
      },
      {
        title: 'Keyboard shortcuts cheat sheet',
        description: 'Press ? anywhere to open an overlay listing every binding.',
        status: 'done',
        priority: 1,
        assignee: 'carol',
        labels: ['polish']
      },
      {
        title: 'Table view inline editing loses focus on rerender',
        description: 'Cell inputs remount when the row object identity changes; memoize the editor component.',
        status: 'in_progress',
        priority: 3,
        assignee: 'alice',
        labels: ['frontend', 'bug']
      },
      {
        title: 'Mention autocomplete should filter workspace members',
        description: 'The @username popup must list only current workspace members.',
        status: 'done',
        priority: 2,
        assignee: 'bob',
        labels: ['mentions']
      },
      {
        title: 'Dark theme contrast audit',
        description: 'Check muted text and badge backgrounds against WCAG AA.',
        status: 'backlog',
        priority: 0,
        assignee: null,
        labels: ['a11y', 'design']
      },
      {
        title: 'Issue drawer deep links do not restore scroll position',
        description: '/w/:ws/i/:id renders fine but lands scrolled to top of long threads.',
        status: 'todo',
        priority: 1,
        assignee: 'carol',
        labels: ['frontend']
      },
      {
        title: 'Command menu should rank recent actions first',
        description: '⌘K currently orders alphabetically; recency would cut two keystrokes off common flows.',
        status: 'backlog',
        priority: 0,
        assignee: null,
        labels: ['polish']
      },
      {
        title: 'Offline outbox chip is easy to miss',
        description: 'Queued-changes indicator needs a stronger visual treatment plus a click-to-inspect popover.',
        status: 'todo',
        priority: 2,
        assignee: 'dave',
        labels: ['ux']
      },
      {
        title: 'Skeletons flash when switching board/table views',
        description: 'React Query has the data cached; the view components just are not reading the warm cache.',
        status: 'backlog',
        priority: 1,
        assignee: null,
        labels: ['frontend', 'polish']
      },
      {
        title: 'Activity feed timestamps lack a timezone hint',
        description: 'Relative times are fine, but hover tooltips show raw ISO strings.',
        status: 'todo',
        priority: 0,
        assignee: 'alice',
        labels: ['frontend']
      }
    ]
  },
  {
    key: 'MOB',
    name: 'Mobile',
    issues: [
      {
        title: 'Responsive layout breaks below 360px width',
        description: 'Top bar overflows and hides the connection badge on small Android phones.',
        status: 'in_progress',
        priority: 3,
        assignee: 'carol',
        labels: ['mobile', 'bug']
      },
      {
        title: 'Touch targets under 40px in the top bar',
        description: 'Presence stack and account menu are hard to hit; bump hit areas without growing visuals.',
        status: 'todo',
        priority: 2,
        assignee: 'dave',
        labels: ['mobile', 'a11y']
      },
      {
        title: 'Board columns force horizontal scroll on tablets',
        description: 'Consider a two-column grid layout between 768px and 1024px.',
        status: 'backlog',
        priority: 1,
        assignee: null,
        labels: ['mobile', 'ux']
      },
      {
        title: 'Reconnect banner overlaps the bottom nav',
        description: 'Fixed-position banner collides with mobile Safari safe areas.',
        status: 'todo',
        priority: 2,
        assignee: 'bob',
        labels: ['mobile', 'bug']
      },
      {
        title: 'Mention notifications for background tabs',
        description: 'Use the Notification API when a mention event arrives while the tab is hidden.',
        status: 'backlog',
        priority: 1,
        assignee: null,
        labels: ['mobile', 'realtime']
      },
      {
        title: 'viewport-fit=cover missing',
        description: 'Notch devices clip the header under the sensor housing.',
        status: 'done',
        priority: 0,
        assignee: 'alice',
        labels: ['mobile', 'polish']
      }
    ]
  }
]

const SAMPLE_COMMENTS: Array<{
  issueTitle: string
  author: string
  body: string
}> = [
  {
    issueTitle: 'Realtime presence avatars flicker on reconnect',
    author: 'bob',
    body: '@alice reproduced on Safari — the presence list empties for a beat, then repopulates.'
  },
  {
    issueTitle: 'Realtime presence avatars flicker on reconnect',
    author: 'alice',
    body: 'Thanks @bob. The disconnect broadcast wins the race against the rejoin; moving the leave behind a microtask fixes it locally.'
  },
  {
    issueTitle: 'Rate-limit the auth endpoints',
    author: 'alice',
    body: '@dave start with login/register, something like 20 requests/min per IP.'
  },
  {
    issueTitle: 'Rate-limit the auth endpoints',
    author: 'dave',
    body: 'On it — will skip the demo login route so the recruiter flow never trips the limiter.'
  },
  {
    issueTitle: 'Search should match issue keys like PLAT-12',
    author: 'carol',
    body: 'Parser recognizes the KEY-number pattern now; bare prefixes like "PLAT" fall back to text matching.'
  },
  {
    issueTitle: 'Idempotency-key TTL vs flaky mobile networks',
    author: 'bob',
    body: '@dave keys expire after 7 days today — retries from the offline outbox can arrive later than that.'
  },
  {
    issueTitle: 'Idempotency-key TTL vs flaky mobile networks',
    author: 'dave',
    body: 'Bumping to 30 days; storage cost is negligible at our write volume.'
  },
  {
    issueTitle: 'Kanban drag feels sticky on touch devices',
    author: 'alice',
    body: '@bob raising the activation distance to 8px fixed it on my iPad — worth trying before bigger surgery.'
  },
  {
    issueTitle: 'Table view inline editing loses focus on rerender',
    author: 'carol',
    body: 'The input remounts whenever the row object identity changes. @alice can you take it from here?'
  },
  {
    issueTitle: 'Mention autocomplete should filter workspace members',
    author: 'bob',
    body: 'Shipped — autocomplete sources from the workspace roster only now.'
  },
  {
    issueTitle: 'Activity feed timestamps lack a timezone hint',
    author: 'dave',
    body: '@alice add a title tooltip with the full localized timestamp on hover.'
  },
  {
    issueTitle: 'Responsive layout breaks below 360px width',
    author: 'carol',
    body: 'Pixel 4a at 360x800 clips the presence stack. Collapse it behind a +N chip below 400px.'
  }
]

export async function ensureSeedData(): Promise<{ workspaceId: string }> {
  const users = new Map<string, { _id: mongoose.Types.ObjectId; username: string; name: string; color: string }>()
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
    users.set(profile.username, {
      _id: u._id as mongoose.Types.ObjectId,
      username: u.username,
      name: u.name,
      color: colorFor(u.username)
    })
  }

  const alice = users.get('alice')!

  let ws = await Workspace.findOne({ slug: 'acme' }).exec()
  if (!ws) {
    ws = await Workspace.create({
      name: 'Acme Product Team',
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

  const projects = new Map<string, mongoose.Document>()
  for (const sampleProject of SAMPLE_PROJECTS) {
    let project = await Project.findOne({ workspaceId: ws._id, key: sampleProject.key }).exec()
    if (!project) {
      project = await Project.create({
        workspaceId: ws._id,
        name: sampleProject.name,
        key: sampleProject.key,
        createdBy: alice._id as mongoose.Types.ObjectId
      })
      await appendEvent({
        workspaceId: ws._id as mongoose.Types.ObjectId,
        type: 'project.created',
        actor: alice,
        entityId: project._id as mongoose.Types.ObjectId,
        data: { project: project.toJSON() }
      })
    }
    projects.set(sampleProject.key, project)
  }

  for (const sampleProject of SAMPLE_PROJECTS) {
    const project = projects.get(sampleProject.key)!
    const projectId = project._id as mongoose.Types.ObjectId
    const issueCount = await Issue.countDocuments({ projectId }).exec()

    if (issueCount === 0) {
      const issueByTitle = new Map<string, mongoose.Document>()
      const columnCursor = new Map<Status, number>()
      for (const sample of sampleProject.issues) {
        const idx = columnCursor.get(sample.status) ?? 0
        columnCursor.set(sample.status, idx + 1)
        const number = await Counter.next(`num:${String(projectId)}`)
        const assignee = sample.assignee ? users.get(sample.assignee)! : null
        const issue = await Issue.create({
          workspaceId: ws._id,
          projectId,
          projectKey: sampleProject.key,
          number,
          key: `${sampleProject.key}-${number}`,
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
        issueByTitle.set(sample.title, issue)
        await appendEvent({
          workspaceId: ws._id as mongoose.Types.ObjectId,
          type: 'issue.created',
          actor: alice,
          entityId: issue._id as mongoose.Types.ObjectId,
          data: { issue: JSON.parse(JSON.stringify(issue)) }
        })
      }

      for (const sampleComment of SAMPLE_COMMENTS) {
        const issue = issueByTitle.get(sampleComment.issueTitle)
        const author = users.get(sampleComment.author)
        if (!issue || !author) continue
        const mentionedIds: string[] = []
        for (const match of sampleComment.body.matchAll(/@([a-z0-9_]{2,24})/gi)) {
          const target = users.get(match[1])
          if (target && !mentionedIds.includes(String(target._id))) {
            mentionedIds.push(String(target._id))
          }
        }
        const comment = await Comment.create({
          issueId: issue._id,
          workspaceId: ws._id,
          authorId: author._id,
          body: sampleComment.body,
          mentionIds: mentionedIds.map((id) => new mongoose.Types.ObjectId(id))
        })
        await Issue.updateOne({ _id: issue._id }, { $inc: { commentCount: 1 } }).exec()
        await appendEvent({
          workspaceId: ws._id as mongoose.Types.ObjectId,
          type: 'comment.created',
          actor: author,
          entityId: issue._id as mongoose.Types.ObjectId,
          data: {
            comment: JSON.parse(JSON.stringify(comment)),
            mentionIds: mentionedIds,
            issueTitle: String(issue.get('title'))
          }
        })
      }
    }
  }

  return { workspaceId: String(ws._id) }
}
