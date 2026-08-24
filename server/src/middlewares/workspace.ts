import type { NextFunction, Request, Response } from 'express'
import mongoose from 'mongoose'
import { Member } from '../models/member'
import { Issue } from '../models/issue'
import { Comment } from '../models/comment'
import { HttpError } from '../util/http'

function isValidId(id: string | undefined): id is string {
  return !!id && mongoose.isValidObjectId(id)
}

export async function requireWorkspaceMember(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const wsId = req.params.wsId
    if (!isValidId(wsId)) throw new HttpError(404, 'not_found')
    const m = await Member.findOne({ workspaceId: wsId, userId: req.userId }).exec()
    if (!m) throw new HttpError(403, 'forbidden')
    req.workspaceId = String(m.workspaceId)
    req.role = m.role
    next()
  } catch (e) {
    next(e)
  }
}

export async function loadIssueAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const issueId = req.params.issueId
    if (!isValidId(issueId)) throw new HttpError(404, 'not_found')
    const issue = await Issue.findById(issueId).exec()
    if (!issue || issue.deletedAt) throw new HttpError(404, 'not_found')
    const m = await Member.findOne({ workspaceId: issue.workspaceId, userId: req.userId }).exec()
    if (!m) throw new HttpError(404, 'not_found')
    req.workspaceId = String(issue.workspaceId)
    res.locals.issue = issue
    res.locals.memberRole = m.role
    next()
  } catch (e) {
    next(e)
  }
}

export async function loadCommentAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const commentId = req.params.commentId
    if (!isValidId(commentId)) throw new HttpError(404, 'not_found')
    const comment = await Comment.findById(commentId).exec()
    if (!comment) throw new HttpError(404, 'not_found')
    const m = await Member.findOne({ workspaceId: comment.workspaceId, userId: req.userId }).exec()
    if (!m) throw new HttpError(404, 'not_found')
    if (String(comment.authorId) !== req.userId) throw new HttpError(403, 'forbidden')
    res.locals.comment = comment
    next()
  } catch (e) {
    next(e)
  }
}
