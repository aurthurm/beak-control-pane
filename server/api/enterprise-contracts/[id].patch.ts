import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { enterpriseContractsTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

type Body = {
  name?: string
  status?: string
  startsAt?: string
  endsAt?: string
  msaReference?: string
  accountOwner?: string
  entitlementOverridesJson?: string
  notes?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  const body = await readBody<Body>(event)
  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [existing] = await db.select().from(enterpriseContractsTable).where(eq(enterpriseContractsTable.id, id))
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Contract not found' })
  }

  const patch: Partial<typeof enterpriseContractsTable.$inferInsert> = {}

  if (body.name !== undefined) {
    const v = body.name.trim()
    if (!v) {
      throw createError({ statusCode: 400, statusMessage: 'name must not be empty' })
    }
    patch.name = v
  }
  if (body.status !== undefined) patch.status = body.status.trim()
  if (body.startsAt !== undefined) patch.startsAt = body.startsAt.trim()
  if (body.endsAt !== undefined) patch.endsAt = body.endsAt.trim()
  if (body.msaReference !== undefined) patch.msaReference = body.msaReference.trim()
  if (body.accountOwner !== undefined) patch.accountOwner = body.accountOwner.trim()
  if (body.entitlementOverridesJson !== undefined) patch.entitlementOverridesJson = body.entitlementOverridesJson.trim()
  if (body.notes !== undefined) patch.notes = body.notes.trim()

  if (Object.keys(patch).length === 0) {
    return { ok: true, id }
  }

  patch.updatedAt = new Date().toISOString()

  await db.update(enterpriseContractsTable).set(patch).where(eq(enterpriseContractsTable.id, id))

  return { ok: true, id }
})
