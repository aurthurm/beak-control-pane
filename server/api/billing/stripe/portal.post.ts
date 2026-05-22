import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { subscribersTable } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { getBillingProvider } from '../../../core/billing/registry'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

type Body = {
  subscriberId?: string
  returnUrl?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const body = await readBody<Body>(event)
  const subscriberId = body.subscriberId?.trim()
  if (!subscriberId) {
    throw createError({ statusCode: 400, statusMessage: 'subscriberId is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [subscriber] = await db.select().from(subscribersTable).where(eq(subscribersTable.id, subscriberId)).limit(1)
  if (!subscriber) {
    throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })
  }

  const origin = getRequestURL(event).origin
  const returnUrl = body.returnUrl?.trim() || `${origin}/subscribers/${encodeURIComponent(subscriberId)}`

  const stripe = getBillingProvider('stripe')
  const { url } = await stripe.createBillingPortalSession({
    subscriberId,
    returnUrl,
  })

  return { url }
})
