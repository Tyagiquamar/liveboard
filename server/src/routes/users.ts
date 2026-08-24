import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../util/http'
import { User } from '../models/user'
import { requireAuth } from '../middlewares/auth'
import { escapeRegex } from '../util/text'

const router = Router()

router.get(
  '/users',
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = z.object({ q: z.string().max(60).default('') }).parse(req.query)
    let filter = {}
    if (q.q) filter = { username: new RegExp(`^${escapeRegex(q.q)}`, 'i') }
    const users = await User.find(filter)
      .sort({ username: 1 })
      .limit(10)
      .exec()
    res.json({ items: users.map((u) => u.toJSON()) })
  })
)

export default router
