import 'dotenv/config'

const rawClientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3000'
const clientOrigins = rawClientOrigin
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/liveboard',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  redisUrl: process.env.REDIS_URL || '',
  clientOrigin: clientOrigins[0],
  corsOrigins: Array.from(new Set([...clientOrigins, 'http://localhost:3000']))
}
