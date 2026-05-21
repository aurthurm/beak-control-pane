import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { enterpriseContractsTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [existing] = await db.select().from(enterpriseContractsTable).where(eq(enterpriseContractsTable.id, id))
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Contract not found' })
  }

  await db.delete(enterpriseContractsTable).where(eq(enterpriseContractsTable.id, id))

  return { ok: true, id }
})
