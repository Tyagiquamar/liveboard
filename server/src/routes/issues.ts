import { Router } from 'express'
import mongoose, { type HydratedDocument } from 'mongoose'
import { z } from 'zod'
import { asyncHandler, HttpError } from '../util/http'
import { Issue, STATUSES, type IssueDoc, type IssueJSON, type Status } from '../models/issue'
import { Project } from '../models/project'
import { Counter } from '../models/counter'
import { Member } from '../models/member'
import { requireAuth } from '../middlewares/auth'
import { requireWorkspaceMember, loadIssueAccess } from '../middlewares/workspace'
import { appendEvent } from '../services/activity'
import { idempotent } from '../services/idempotency'
import { decodeCursor, encodeCursor } from '../util/cursor'
import { escapeRegex } from '../util/text'

const router = Router()

function issueJson(doc: HydratedDocument<IssueDoc>): IssueJSON {
  return JSON.parse(JSON.stringify(doc)) as IssueJSON
}

const ORDER_STEP = 1024

async function topOrder(workspaceId: string, status: Status): Promise<number> {
  const min = await Issue.findOne({ workspaceId, status, deletedAt: null })
    .sort({ order: 1 })
    .select('order')
    .exec()
  return (min?.order ?? 0) - ORDER_STEP
}

router.get(
  '/workspaces/:wsId/issues',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        projectId: z.string().max(64).optional(),
        status: z.enum(STATUSES).optional(),
        assigneeId: z.string().max(64).optional(),
        priority: z.coerce.number().int().min(0).max(4).optional(),
        q: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        cursor: z.string().max(512).optional(),
        sort: z.enum(['updated', 'created', 'priority', 'title', 'status']).default('updated'),
        dir: z.enum(['asc', 'desc']).default('desc')
      })
      .parse(req.query)

    const filter: Record<string, unknown> = {
      workspaceId: req.workspaceId,
      deletedAt: null
    }
    if (q.projectId) filter.projectId = q.projectId
    if (q.status) filter.status = q.status
    if (q.assigneeId) filter.assigneeId = q.assigneeId === 'none' ? null : q.assigneeId
    if (q.priority != null) filter.priority = q.priority
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i')
      filter.$or = [{ title: rx }, { description: rx }]
    }

    const cursorData = decodeCursor<{ i?: string }>(q.cursor)
    const dir = q.dir === 'asc' ? 1 : -1

    let sortSpec: Record<string, 1 | -1>
    switch (q.sort) {
      case 'created':
        sortSpec = { createdAt: dir, _id: dir }
        break
      case 'priority':
        sortSpec = { priority: dir, updatedAt: -1 }
        break
      case 'title':
        sortSpec = { title: dir, _id: dir }
        break
      case 'status':
        sortSpec = { statusRank: dir, order: 1 }
        break
      default:
        sortSpec = { updatedAt: dir, _id: dir }
    }

    if (cursorData?.i) {
      const cid = new mongoose.Types.ObjectId(cursorData.i)
      const primary = Object.keys(sortSpec)[0]
      if (primary === '_id') filter._id = { [dir === 1 ? '$gt' : '$lt']: cid }
      else filter._id = { [dir === 1 ? '$gt' : '$lt']: cid }
      if (!('_id' in sortSpec)) sortSpec._id = dir
    }

    const docs = await Issue.find(filter)
      .sort(sortSpec as Record<string, 1 | -1>)
      .limit(q.limit + 1)
      .exec()
    const hasMore = docs.length > q.limit
    const page = hasMore ? docs.slice(0, q.limit) : docs
    const last = page[page.length - 1]
    res.json({
      items: page.map(issueJson),
      nextCursor: hasMore && last ? encodeCursor({ i: String(last._id) }) : null
    })
  })
)

const CreateIssueSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(20000).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  assigneeId: z.string().nullable().optional(),
  labels: z.array(z.string().min(1).max(40)).max(10).optional(),
  order: z.number().finite().optional(),
  clientRequestId: z.string().min(8).max(80).optional()
})

router.post(
  '/workspaces/:wsId/issues',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const body = CreateIssueSchema.parse(req.body)
    const actor = req.authUser!
    const project = await Project.findOne({
      _id: body.projectId,
      workspaceId: req.workspaceId
    }).exec()
    if (!project) throw new HttpError(404, 'project_not_found')

    if (body.assigneeId) {
      const m = await Member.exists({
        workspaceId: req.workspaceId,
        userId: body.assigneeId
      })
      if (!m) throw new HttpError(400, 'assignee_not_member')
    }

    const status = body.status ?? 'todo'

    const { result } = await idempotent(body.clientRequestId ?? null, async () => {
      const number = await Counter.next(`num:${String(project._id)}`)
      const issue = await Issue.create({
        workspaceId: req.workspaceId,
        projectId: project._id,
        projectKey: project.key,
        number,
        key: `${project.key}-${number}`,
        title: body.title,
        description: body.description ?? '',
        status,
        statusRank: STATUSES.indexOf(status),
        priority: body.priority ?? 0,
        assigneeId: body.assigneeId ? new mongoose.Types.ObjectId(body.assigneeId) : null,
        reporterId: actor._id as mongoose.Types.ObjectId,
        labels: body.labels ?? [],
        order: body.order ?? (await topOrder(req.workspaceId!, status)),
        clientRequestId: body.clientRequestId
      })
      const json = issueJson(issue)
      await appendEvent({
        workspaceId: new mongoose.Types.ObjectId(req.workspaceId!),
        type: 'issue.created',
        actor,
        entityId: issue._id as mongoose.Types.ObjectId,
        data: { issue: json }
      })
      return json
    })

    res.status(201).json({ issue: result })
  })
)

router.get(
  '/issues/:issueId',
  requireAuth,
  loadIssueAccess,
  asyncHandler(async (req, res) => {
    res.json({ issue: issueJson(res.locals.issue as HydratedDocument<IssueDoc>) })
  })
)

const UpdateIssueSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(20000).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  assigneeId: z.string().nullable().optional(),
  labels: z.array(z.string().min(1).max(40)).max(10).optional(),
  order: z.number().finite().optional(),
  baseVersion: z.number().int().min(0).optional(),
  clientRequestId: z.string().min(8).max(80).optional()
})

router.patch(
  '/issues/:issueId',
  requireAuth,
  loadIssueAccess,
  asyncHandler(async (req, res) => {
    const body = UpdateIssueSchema.parse(req.body)
    const actor = req.authUser!
    const issue = res.locals.issue as HydratedDocument<IssueDoc>

    if (body.baseVersion != null && body.baseVersion !== issue.version) {
      res.status(409).json({
        error: 'version_conflict',
        current: issueJson(issue)
      })
      return
    }

    if (body.assigneeId) {
      const m = await Member.exists({ workspaceId: req.workspaceId, userId: body.assigneeId })
      if (!m) throw new HttpError(400, 'assignee_not_member')
    }

    const { result } = await idempotent(body.clientRequestId ?? null, async () => {
      const changes: Record<string, unknown> = {}
      if (body.title !== undefined) {
        issue.title = body.title
        changes.title = body.title
      }
      if (body.description !== undefined) {
        issue.description = body.description
        changes.description = body.description
      }
      if (body.status !== undefined) {
        issue.status = body.status
        issue.statusRank = STATUSES.indexOf(body.status)
        changes.status = body.status
      }
      if (body.priority !== undefined) {
        issue.priority = body.priority
        changes.priority = body.priority
      }
      if (body.assigneeId !== undefined) {
        issue.assigneeId = body.assigneeId ? new mongoose.Types.ObjectId(body.assigneeId) : null
        changes.assigneeId = body.assigneeId
      }
      if (body.labels !== undefined) {
        issue.labels = body.labels
        changes.labels = body.labels
      }
      if (body.order !== undefined) {
        issue.order = body.order
        changes.order = body.order
      }
      if ('status' in changes && !('order' in changes)) {
        changes.order = issue.order
      }
      issue.version += 1
      changes.version = issue.version
      await issue.save()
      const json = issueJson(issue)
      await appendEvent({
        workspaceId: new mongoose.Types.ObjectId(req.workspaceId!),
        type: 'issue.updated',
        actor,
        entityId: issue._id as mongoose.Types.ObjectId,
        data: { changes, issue: json }
      })
      return json
    })

    res.json({ issue: result })
  })
)

router.delete(
  '/issues/:issueId',
  requireAuth,
  loadIssueAccess,
  asyncHandler(async (req, res) => {
    const actor = req.authUser!
    const issue = res.locals.issue as HydratedDocument<IssueDoc>
    issue.deletedAt = new Date()
    await issue.save()
    await appendEvent({
      workspaceId: new mongoose.Types.ObjectId(req.workspaceId!),
      type: 'issue.deleted',
      actor,
      entityId: issue._id as mongoose.Types.ObjectId,
      data: { issueId: String(issue._id) }
    })
    res.json({ ok: true })
  })
)

export default router
