import 'dotenv/config'

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/liveboard',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  redisUrl: process.env.REDIS_URL || '',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000'
}
