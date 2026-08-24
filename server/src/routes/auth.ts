import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { asyncHandler, HttpError } from '../util/http'
import { User } from '../models/user'
import { signToken, requireAuth } from '../middlewares/auth'
import { ensureSeedData, DEMO_USERNAMES } from '../services/seed'

const router = Router()

const RegisterSchema = z.object({
  email: z.string().email().max(120),
  name: z.string().min(1).max(80),
  username: z.string().regex(/^[a-z0-9_]{2,24}$/),
  password: z.string().min(6).max(128)
})

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = RegisterSchema.parse(req.body)
    const exists = await User.findOne({
      $or: [{ email: body.email.toLowerCase() }, { username: body.username.toLowerCase() }]
    }).exec()
    if (exists) throw new HttpError(409, 'email_or_username_taken')
    const { hashPassword } = await import('../models/user')
    const user = await User.create({
      email: body.email,
      name: body.name,
      username: body.username,
      passwordHash: await hashPassword(body.password)
    })
    res.status(201).json({ token: signToken(String(user._id)), user: user.toJSON() })
  })
)

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = LoginSchema.parse(req.body)
    const user = await User.findOne({ email: body.email.toLowerCase() }).exec()
    if (!user || !(await user.comparePassword(body.password))) {
      throw new HttpError(401, 'invalid_credentials')
    }
    res.json({ token: signToken(String(user._id)), user: user.toJSON() })
  })
)

const DemoSchema = z.object({ username: z.enum(['alice', 'bob', 'carol'] as const).optional() })

router.post(
  '/demo',
  asyncHandler(async (req, res) => {
    const { username } = DemoSchema.parse(req.body ?? {})
    await ensureSeedData()
    const pick = username ?? DEMO_USERNAMES[0]
    const user = await User.findOne({ username: pick }).exec()
    if (!user) throw new HttpError(500, 'seed_failed')
    const ws = await mongoose.model('Workspace').findOne({ slug: 'acme' }).exec()
    res.json({
      token: signToken(String(user._id)),
      user: user.toJSON(),
      workspaceId: ws ? String((ws as unknown as { _id: unknown })._id) : null
    })
  })
)

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: { id: req.userId, ...req.authUser } })
}))

export default router
