import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { ingestNormalizedBillingEvent } from '../../../core/billing/ingest'
import { parseStripeWebhookEvent } from '../../../core/billing/providers/stripe'

export default defineEventHandler(async (event) => {
  const { rawPayload, normalized } = await parseStripeWebhookEvent(event)

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  for (const n of normalized) {
    await ingestNormalizedBillingEvent(db, n, rawPayload)
  }

  return { received: true }
})
