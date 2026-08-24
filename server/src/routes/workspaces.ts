import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { asyncHandler, HttpError } from '../util/http'
import { Workspace } from '../models/workspace'
import { Member } from '../models/member'
import { Project } from '../models/project'
import { User } from '../models/user'
import { requireAuth } from '../middlewares/auth'
import { requireWorkspaceMember } from '../middlewares/workspace'
import { appendEvent, activityPage, listEvents, parseActivityCursor } from '../services/activity'
import { slugify } from '../util/text'

const router = Router()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const memberships = await Member.find({ userId: req.userId }).exec()
    const ids = memberships.map((m) => m.workspaceId)
    const workspaces = await Workspace.find({ _id: { $in: ids } }).sort({ createdAt: 1 }).exec()
    res.json({ items: workspaces.map((w) => w.toJSON()) })
  })
)

const CreateWsSchema = z.object({ name: z.string().min(1).max(80) })

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = CreateWsSchema.parse(req.body)
    const actor = req.authUser!
    let ws: mongoose.Document | null = null
    for (let attempt = 0; attempt < 5 && !ws; attempt++) {
      const slug = attempt === 0 ? slugify(body.name) : `${slugify(body.name)}-${Math.random().toString(36).slice(2, 6)}`
      try {
        ws = await Workspace.create({ name: body.name, slug, createdBy: actor._id as mongoose.Types.ObjectId })
      } catch (e) {
        if (!(e instanceof Error && 'code' in e && (e as { code?: number }).code === 11000)) throw e
      }
    }
    if (!ws) throw new HttpError(500, 'could_not_create_workspace')
    await Member.create({
      workspaceId: ws._id,
      userId: actor._id as mongoose.Types.ObjectId,
      role: 'owner'
    })
    const project = await Project.create({
      workspaceId: ws._id,
      name: 'General',
      key: 'GEN',
      createdBy: actor._id as mongoose.Types.ObjectId
    })
    await appendEvent({
      workspaceId: ws._id as mongoose.Types.ObjectId,
      type: 'project.created',
      actor: actor,
      entityId: project._id as mongoose.Types.ObjectId,
      data: { project: project.toJSON() }
    })
    res.status(201).json({ workspace: ws.toJSON() })
  })
)

router.get(
  '/:wsId/members',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const members = await Member.find({ workspaceId: req.workspaceId })
      .populate('userId')
      .sort({ createdAt: 1 })
      .exec()
    const items = members.map((m) => {
      const u = m.userId as unknown as { toJSON(): unknown } | null
      return {
        id: String(m._id),
        role: m.role,
        user: u ? (u.toJSON() as Record<string, unknown>) : null
      }
    })
    res.json({ items })
  })
)

const AddMemberSchema = z.object({ username: z.string().min(2).max(24) })

router.post(
  '/:wsId/members',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const body = AddMemberSchema.parse(req.body)
    const actor = req.authUser!
    const target = await User.findOne({ username: body.username.toLowerCase() }).exec()
    if (!target) throw new HttpError(404, 'user_not_found')
    const existing = await Member.findOne({
      workspaceId: req.workspaceId,
      userId: target._id
    }).exec()
    if (existing) throw new HttpError(409, 'already_member')
    const member = await Member.create({
      workspaceId: req.workspaceId,
      userId: target._id,
      role: 'member'
    })
    const memberJson = {
      id: String(member._id),
      role: member.role,
      user: target.toJSON() as Record<string, unknown>
    }
    await appendEvent({
      workspaceId: new mongoose.Types.ObjectId(req.workspaceId),
      type: 'member.added',
      actor,
      entityId: member._id as mongoose.Types.ObjectId,
      data: { member: memberJson }
    })
    res.status(201).json({ member: memberJson })
  })
)

router.get(
  '/:wsId/activity',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        cursor: z.string().max(512).optional()
      })
      .parse(req.query)
    const before = parseActivityCursor(q.cursor)
    const page = await listEvents(req.workspaceId!, { limit: q.limit, before })
    res.json(activityPage(page.items, page.nextBefore))
  })
)

export default router
