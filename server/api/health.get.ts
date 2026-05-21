import { getDatabaseClient, bootstrapDatabase } from '../db/bootstrap'

export default defineEventHandler(async () => {
  const client = getDatabaseClient()
  await bootstrapDatabase(client)

  return {
    status: 'ok',
    database: 'sqlite',
    mode: 'local',
    timestamp: new Date().toISOString(),
  }
})
