import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { plansTable, tenantsTable } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { getBillingProvider } from '../../../core/billing/registry'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

type Body = {
  tenantId?: string
  planId?: string
  successUrl?: string
  cancelUrl?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const body = await readBody<Body>(event)
  const tenantId = body.tenantId?.trim()
  const planId = body.planId?.trim()
  if (!tenantId || !planId) {
    throw createError({ statusCode: 400, statusMessage: 'tenantId and planId are required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1)
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, planId)).limit(1)
  if (!tenant || !plan) {
    throw createError({ statusCode: 404, statusMessage: 'Tenant or plan not found' })
  }

  const origin = getRequestURL(event).origin
  const successUrl = body.successUrl?.trim() || `${origin}/customers/${encodeURIComponent(tenantId)}?checkout=success`
  const cancelUrl = body.cancelUrl?.trim() || `${origin}/customers/${encodeURIComponent(tenantId)}?checkout=cancel`

  const stripe = getBillingProvider('stripe')
  const { url, sessionId } = await stripe.createCheckoutSession({
    tenantId,
    planId,
    successUrl,
    cancelUrl,
  })

  return { url, sessionId }
})
