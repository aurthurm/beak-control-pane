import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { enterpriseContractsTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const query = getQuery(event)
  const tenantId = typeof query.tenantId === 'string' ? query.tenantId.trim() : ''
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'tenantId query is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const rows = await db
    .select()
    .from(enterpriseContractsTable)
    .where(eq(enterpriseContractsTable.tenantId, tenantId))

  return { contracts: rows }
})
