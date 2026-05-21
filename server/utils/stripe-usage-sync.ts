import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { subscriptionsTable } from '../db/schema'

/**
 * Optional: push a metered usage delta to Stripe when subscription `provider_metadata_json`
 * contains `stripe_usage_subscription_item_id` (Subscription Item id for a metered price).
 *
 * Set `BCP_STRIPE_USAGE_SYNC=true` to enable; requires `STRIPE_SECRET_KEY`.
 */
export async function tryStripeUsageRecord(
  db: LibSQLDatabase<Record<string, never>>,
  input: { tenantId: string; quantity: number; timestamp?: number; idempotencyKey?: string },
): Promise<{ ok: boolean; reason: string }> {
  if (process.env.BCP_STRIPE_USAGE_SYNC !== 'true') {
    return { ok: false, reason: 'disabled' }
  }
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    return { ok: false, reason: 'no_stripe_key' }
  }

  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, input.tenantId))

  let itemId: string | null = null
  for (const s of subs) {
    if (s.provider !== 'stripe') continue
    try {
      const meta = JSON.parse(s.providerMetadataJson || '{}') as { stripe_usage_subscription_item_id?: string }
      if (meta.stripe_usage_subscription_item_id?.trim()) {
        itemId = meta.stripe_usage_subscription_item_id.trim()
        break
      }
    } catch {
      /* ignore */
    }
  }

  if (!itemId) {
    return { ok: false, reason: 'no_subscription_item_metadata' }
  }

  const stripe = new Stripe(key)
  await stripe.subscriptionItems.createUsageRecord(
    itemId,
    {
      quantity: Math.max(0, Math.floor(input.quantity)),
      timestamp: input.timestamp ?? Math.floor(Date.now() / 1000),
      action: 'set',
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  )

  return { ok: true, reason: 'recorded' }
}
