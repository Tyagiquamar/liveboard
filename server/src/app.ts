import express from 'express'
import cors from 'cors'
import { config } from './config'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import workspaceRoutes from './routes/workspaces'
import projectRoutes from './routes/projects'
import issueRoutes from './routes/issues'
import commentRoutes from './routes/comments'
import { errorHandler } from './util/http'

export function createApp(): express.Express {
  const app = express()
  console.log('[cors] allowed origins:', config.corsOrigins.join(', '))
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: false
    })
  )
  app.use(express.json({ limit: '1mb' }))
  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.use('/api/auth', authRoutes)
  app.use('/api', userRoutes)
  app.use('/api/workspaces', workspaceRoutes)
  app.use('/api', projectRoutes)
  app.use('/api', issueRoutes)
  app.use('/api', commentRoutes)
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }))
  app.use(errorHandler)
  return app
}
