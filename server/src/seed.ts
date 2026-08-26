import { connectDb, disconnectDb } from './db'
import { ensureSeedData } from './services/seed'

async function main(): Promise<void> {
  await connectDb()
  const { workspaceId } = await ensureSeedData()
  console.log(`seed complete — demo workspace ${workspaceId} (login as alice / bob / carol / dave)`)
  await disconnectDb()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
