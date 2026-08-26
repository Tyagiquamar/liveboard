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

interface SortPair {
  field: string
  dir: 1 | -1
  cast: 'date' | 'number' | 'string' | 'id'
}

function sortPairsFor(sort: string, dir: 1 | -1): SortPair[] {
  switch (sort) {
    case 'created':
      return [
        { field: 'createdAt', dir, cast: 'date' },
        { field: '_id', dir, cast: 'id' }
      ]
    case 'priority':
      return [
        { field: 'priority', dir, cast: 'number' },
        { field: '_id', dir, cast: 'id' }
      ]
    case 'title':
      return [
        { field: 'title', dir, cast: 'string' },
        { field: '_id', dir, cast: 'id' }
      ]
    case 'status':
      return [
        { field: 'statusRank', dir, cast: 'number' },
        { field: 'order', dir: 1, cast: 'number' },
        { field: '_id', dir: 1, cast: 'id' }
      ]
    default:
      return [
        { field: 'updatedAt', dir, cast: 'date' },
        { field: '_id', dir, cast: 'id' }
      ]
  }
}

function sortSpecFor(pairs: SortPair[]): Record<string, 1 | -1> {
  return Object.fromEntries(pairs.map((p) => [p.field, p.dir]))
}

function encodeKeysetCursor(pairs: SortPair[], doc: HydratedDocument<IssueDoc>): string {
  const values = pairs.map((p) => {
    const v = (doc as unknown as Record<string, unknown>)[p.field]
    if (v == null) return null
    if (p.cast === 'date') return v instanceof Date ? v.toISOString() : String(v)
    if (p.cast === 'id') return String(v)
    return v as string | number
  })
  return encodeCursor({ k: values })
}

// Keyset predicate: (a1,...,an) strictly after the cursor tuple, i.e.
// OR over k of (equal on fields < k AND field_k strictly before/after by dir).
function keysetFilter(pairs: SortPair[], raw: unknown[]): Record<string, unknown> | null {
  if (!Array.isArray(raw) || raw.length !== pairs.length) return null
  const vals: Array<string | number | Date | mongoose.Types.ObjectId | null> = raw.map((v, i) => {
    const p = pairs[i]
    if (v == null) return null
    switch (p.cast) {
      case 'date': {
        const d = new Date(String(v))
        return Number.isNaN(d.getTime()) ? null : d
      }
      case 'number': {
        const n = Number(v)
        return Number.isFinite(n) ? n : null
      }
      case 'id':
        return mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null
      default:
        return String(v)
    }
  })
  if (vals.some((v) => v == null)) return null

  const or: Array<Record<string, unknown>> = []
  for (let k = 0; k < pairs.length; k++) {
    const clause: Record<string, unknown> = {}
    for (let j = 0; j < k; j++) clause[pairs[j].field] = vals[j]
    clause[pairs[k].field] = { [pairs[k].dir === 1 ? '$gt' : '$lt']: vals[k] }
    or.push(clause)
  }
  return or.length === 1 ? or[0] : { $or: or }
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

    const cursorData = decodeCursor<{ k?: unknown[] }>(q.cursor)
    const dir: 1 | -1 = q.dir === 'asc' ? 1 : -1
    const pairs = sortPairsFor(q.sort, dir)

    if (cursorData?.k) {
      // search already occupies $or; keep both predicates via $and
      const kf = keysetFilter(pairs, cursorData.k)
      if (kf) {
        if (filter.$or) {
          filter.$and = [{ $or: filter.$or as unknown[] }, kf]
          delete filter.$or
        } else {
          Object.assign(filter, kf)
        }
      }
    }

    const docs = await Issue.find(filter)
      .sort(sortSpecFor(pairs))
      .limit(q.limit + 1)
      .exec()
    const hasMore = docs.length > q.limit
    const page = hasMore ? docs.slice(0, q.limit) : docs
    const last = page[page.length - 1]
    res.json({
      items: page.map(issueJson),
      nextCursor:
        hasMore && last ? encodeKeysetCursor(pairs, last as HydratedDocument<IssueDoc>) : null
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
