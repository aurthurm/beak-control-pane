import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { enterpriseContractsTable, tenantsTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

type Body = {
  tenantId?: string
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

  const body = await readBody<Body>(event)
  const tenantId = body.tenantId?.trim()
  const name = body.name?.trim()
  if (!tenantId || !name) {
    throw createError({ statusCode: 400, statusMessage: 'tenantId and name are required' })
  }

  const startsAt = body.startsAt?.trim()
  const endsAt = body.endsAt?.trim()
  if (!startsAt || !endsAt) {
    throw createError({ statusCode: 400, statusMessage: 'startsAt and endsAt are required (ISO strings)' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [t] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, tenantId))
  if (!t) {
    throw createError({ statusCode: 404, statusMessage: 'Tenant not found' })
  }

  const now = new Date().toISOString()
  const id = `ec_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const status = body.status?.trim() || 'draft'

  await db.insert(enterpriseContractsTable).values({
    id,
    tenantId,
    name,
    status,
    startsAt,
    endsAt,
    msaReference: body.msaReference?.trim() ?? '',
    accountOwner: body.accountOwner?.trim() ?? '',
    entitlementOverridesJson: body.entitlementOverridesJson?.trim() || '{}',
    notes: body.notes?.trim() ?? '',
    createdAt: now,
    updatedAt: now,
  })

  return { ok: true, id }
})
