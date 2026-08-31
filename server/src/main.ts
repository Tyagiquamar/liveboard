import http from 'http'
import { createApp } from './app'
import { attachRealtime } from './realtime/io'
import { connectDb } from './db'
import { config } from './config'

async function bootstrap(): Promise<void> {
  await connectDb()
  const app = createApp()
  const server = http.createServer(app)
  await attachRealtime(server)
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`liveboard api+ws listening on 0.0.0.0:${config.port}`)
  })

  const shutdown = (): void => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

bootstrap().catch((e) => {
  console.error(e)
  process.exit(1)
})
