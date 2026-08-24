import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { config } from '../config'
import { HttpError } from '../util/http'
import { User } from '../models/user'
import { colorFor } from '../util/text'

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' })
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub?: unknown }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return next(new HttpError(401, 'unauthorized'))
  const userId = verifyToken(token)
  if (!userId) return next(new HttpError(401, 'unauthorized'))
  User.findById(userId)
    .exec()
    .then((u) => {
      if (!u) return next(new HttpError(401, 'unauthorized'))
      req.userId = String(u._id)
      req.authUser = {
        _id: u._id,
        name: u.name,
        username: u.username,
        color: colorFor(u.username),
        email: u.email
      }
      next()
    })
    .catch(next)
}
