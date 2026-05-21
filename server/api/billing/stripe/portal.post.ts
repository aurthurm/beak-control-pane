import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { tenantsTable } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { getBillingProvider } from '../../../core/billing/registry'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

type Body = {
  tenantId?: string
  returnUrl?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const body = await readBody<Body>(event)
  const tenantId = body.tenantId?.trim()
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'tenantId is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1)
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Tenant not found' })
  }

  const origin = getRequestURL(event).origin
  const returnUrl = body.returnUrl?.trim() || `${origin}/customers/${encodeURIComponent(tenantId)}`

  const stripe = getBillingProvider('stripe')
  const { url } = await stripe.createBillingPortalSession({
    tenantId,
    returnUrl,
  })

  return { url }
})
