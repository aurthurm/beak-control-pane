import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { plansTable, subscribersTable } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { getBillingProvider } from '../../../core/billing/registry'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

type Body = {
  subscriberId?: string
  planId?: string
  successUrl?: string
  cancelUrl?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const body = await readBody<Body>(event)
  const subscriberId = body.subscriberId?.trim()
  const planId = body.planId?.trim()
  if (!subscriberId || !planId) {
    throw createError({ statusCode: 400, statusMessage: 'subscriberId and planId are required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [subscriber] = await db.select().from(subscribersTable).where(eq(subscribersTable.id, subscriberId)).limit(1)
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, planId)).limit(1)
  if (!subscriber || !plan) {
    throw createError({ statusCode: 404, statusMessage: 'Tenant or plan not found' })
  }

  const origin = getRequestURL(event).origin
  const successUrl = body.successUrl?.trim() || `${origin}/subscribers/${encodeURIComponent(subscriberId)}?checkout=success`
  const cancelUrl = body.cancelUrl?.trim() || `${origin}/subscribers/${encodeURIComponent(subscriberId)}?checkout=cancel`

  const stripe = getBillingProvider('stripe')
  const { url, sessionId } = await stripe.createCheckoutSession({
    subscriberId,
    planId,
    successUrl,
    cancelUrl,
  })

  return { url, sessionId }
})
