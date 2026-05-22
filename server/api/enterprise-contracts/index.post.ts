import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { enterpriseContractsTable, subscribersTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

type Body = {
  subscriberId?: string
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
  const subscriberId = body.subscriberId?.trim()
  const name = body.name?.trim()
  if (!subscriberId || !name) {
    throw createError({ statusCode: 400, statusMessage: 'subscriberId and name are required' })
  }

  const startsAt = body.startsAt?.trim()
  const endsAt = body.endsAt?.trim()
  if (!startsAt || !endsAt) {
    throw createError({ statusCode: 400, statusMessage: 'startsAt and endsAt are required (ISO strings)' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [t] = await db.select({ id: subscribersTable.id }).from(subscribersTable).where(eq(subscribersTable.id, subscriberId))
  if (!t) {
    throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })
  }

  const now = new Date().toISOString()
  const id = `ec_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const status = body.status?.trim() || 'draft'

  await db.insert(enterpriseContractsTable).values({
    id,
    subscriberId,
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
