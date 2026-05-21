import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { activationsTable, licensesTable } from '../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import { requireIngestSecretOrStaffApi } from '../utils/ingest-auth'

export default defineEventHandler(async (event) => {
  await requireIngestSecretOrStaffApi(event)

  const query = getQuery(event)
  const licenseId = typeof query.licenseId === 'string' ? query.licenseId.trim() : ''
  const tenantId = typeof query.tenantId === 'string' ? query.tenantId.trim() : ''

  if (!licenseId && !tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'licenseId or tenantId query parameter is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  if (licenseId) {
    const rows = await db.select().from(activationsTable).where(eq(activationsTable.licenseId, licenseId))
    return { activations: rows }
  }

  const licRows = await db.select({ id: licensesTable.id }).from(licensesTable).where(eq(licensesTable.tenantId, tenantId))
  const ids = licRows.map((r) => r.id)
  if (!ids.length) {
    return { activations: [] }
  }

  const rows = await db.select().from(activationsTable).where(inArray(activationsTable.licenseId, ids))
  return { activations: rows }
})
