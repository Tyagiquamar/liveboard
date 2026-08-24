import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { asyncHandler } from '../util/http'
import { Comment, type CommentDoc } from '../models/comment'
import { Issue, type IssueDoc } from '../models/issue'
import { Member } from '../models/member'
import { User } from '../models/user'
import { requireAuth } from '../middlewares/auth'
import { loadCommentAccess, loadIssueAccess } from '../middlewares/workspace'
import { appendEvent } from '../services/activity'
import { idempotent } from '../services/idempotency'
import { decodeCursor, encodeCursor } from '../util/cursor'

const router = Router()

function commentJson(doc: mongoose.Document<unknown, unknown, CommentDoc>) {
  return JSON.parse(JSON.stringify(doc)) as Record<string, unknown>
}

router.get(
  '/issues/:issueId/comments',
  requireAuth,
  loadIssueAccess,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(30),
        cursor: z.string().max(512).optional()
      })
      .parse(req.query)
    const filter: Record<string, unknown> = { issueId: req.params.issueId }
    const c = decodeCursor<{ i?: string }>(q.cursor)
    if (c?.i && mongoose.isValidObjectId(c.i)) {
      filter._id = { $lt: new mongoose.Types.ObjectId(c.i) }
    }
    const docs = await Comment.find(filter)
      .sort({ _id: -1 })
      .limit(q.limit + 1)
      .exec()
    const hasMore = docs.length > q.limit
    const page = hasMore ? docs.slice(0, q.limit) : docs
    const last = page[page.length - 1]
    res.json({
      items: page.map(commentJson),
      nextCursor: hasMore && last ? encodeCursor({ i: String(last._id) }) : null
    })
  })
)

const CreateCommentSchema = z.object({
  body: z.string().min(1).max(4000),
  mentionIds: z.array(z.string().max(64)).max(20).optional(),
  clientRequestId: z.string().min(8).max(80).optional()
})

router.post(
  '/issues/:issueId/comments',
  requireAuth,
  loadIssueAccess,
  asyncHandler(async (req, res) => {
    const body = CreateCommentSchema.parse(req.body)
    const actor = req.authUser!
    const issue = res.locals.issue as mongoose.HydratedDocument<IssueDoc>

    const members = await Member.find({ workspaceId: req.workspaceId })
      .populate('userId')
      .exec()
    const usernameToUser = new Map<string, { id: string; name: string; username: string }>()
    for (const m of members) {
      const u = m.userId as unknown as { _id: unknown; name: string; username: string } | null
      if (u) {
        usernameToUser.set(u.username.toLowerCase(), {
          id: String(u._id),
          name: u.name,
          username: u.username
        })
      }
    }

    const mentioned = new Map<string, string>()
    if (body.mentionIds) {
      for (const id of body.mentionIds) {
        const entry = [...usernameToUser.values()].find((u) => u.id === id)
        if (entry) mentioned.set(entry.id, entry.username)
      }
    }
    for (const match of body.body.matchAll(/@([a-z0-9_]{2,24})/gi)) {
      const entry = usernameToUser.get(match[1].toLowerCase())
      if (entry) mentioned.set(entry.id, entry.username)
    }
    const mentionIds = [...mentioned.keys()]

    const { result } = await idempotent(body.clientRequestId ?? null, async () => {
      const comment = await Comment.create({
        issueId: issue._id,
        workspaceId: req.workspaceId,
        authorId: actor._id as mongoose.Types.ObjectId,
        body: body.body,
        mentionIds: mentionIds.map((id) => new mongoose.Types.ObjectId(id)),
        clientRequestId: body.clientRequestId
      })
      await Issue.updateOne({ _id: issue._id }, { $inc: { commentCount: 1 } }).exec()
      const json = commentJson(comment)
      await appendEvent({
        workspaceId: new mongoose.Types.ObjectId(req.workspaceId!),
        type: 'comment.created',
        actor,
        entityId: issue._id as mongoose.Types.ObjectId,
        data: { comment: json, mentionIds, issueTitle: issue.title }
      })
      return json
    })

    res.status(201).json({ comment: result })
  })
)

router.delete(
  '/comments/:commentId',
  requireAuth,
  loadCommentAccess,
  asyncHandler(async (_req, res) => {
    const comment = res.locals.comment as mongoose.HydratedDocument<CommentDoc>
    await Issue.updateOne({ _id: comment.issueId }, { $inc: { commentCount: -1 } }).exec()
    await comment.deleteOne()
    res.json({ ok: true })
  })
)

export default router
