import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { asyncHandler } from '../util/http'
import { Project } from '../models/project'
import { requireAuth } from '../middlewares/auth'
import { requireWorkspaceMember } from '../middlewares/workspace'
import { appendEvent } from '../services/activity'
import { projectKeyFrom } from '../util/text'

const router = Router()

router.get(
  '/workspaces/:wsId/projects',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const projects = await Project.find({ workspaceId: req.workspaceId })
      .sort({ createdAt: 1 })
      .exec()
    res.json({ items: projects.map((p) => p.toJSON()) })
  })
)

const CreateProjectSchema = z.object({ name: z.string().min(1).max(60) })

router.post(
  '/workspaces/:wsId/projects',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const body = CreateProjectSchema.parse(req.body)
    const actor = req.authUser!
    const base = projectKeyFrom(body.name)
    let key = base
    for (let n = 2; ; n++) {
      const clash = await Project.exists({ workspaceId: req.workspaceId, key })
      if (!clash) break
      key = `${base}${n}`
    }
    const project = await Project.create({
      workspaceId: req.workspaceId,
      name: body.name,
      key,
      createdBy: actor._id as mongoose.Types.ObjectId
    })
    await appendEvent({
      workspaceId: new mongoose.Types.ObjectId(req.workspaceId!),
      type: 'project.created',
      actor,
      entityId: project._id as mongoose.Types.ObjectId,
      data: { project: project.toJSON() }
    })
    res.status(201).json({ project: project.toJSON() })
  })
)

export default router
