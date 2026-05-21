import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { licensesTable } from '../../../db/schema'
import { getLicenseKeyConfig } from '../../../core/licensing/keys'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'License id is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [row] = await db.select().from(licensesTable).where(eq(licensesTable.id, id)).limit(1)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'License not found' })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(row.payloadJson) as Record<string, unknown>
  } catch {
    payload = {}
  }

  const cfg = getLicenseKeyConfig()

  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="${id}.license"`)

  return {
    kid: cfg?.kid ?? 'bcp-1',
    jws: row.signature,
    payload,
  }
})
