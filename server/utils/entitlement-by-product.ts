import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import {
  entitlementsTable,
  featuresTable,
  planFeaturesTable,
  planLimitsTable,
  plansTable,
  subscriptionsTable,
} from '../db/schema'
import { buildEntitlementStoragePayload } from './entitlement-recompute'

export type RecomputeResult = {
  entitlementId: string
  subscriberId: string
  productId: string
  computedAt: string
  payload: ReturnType<typeof buildEntitlementStoragePayload>
}

/**
 * Finds subscription + plan for subscriber/product and upserts entitlements row.
 */
export async function recomputeEntitlementForSubscriberProduct(
  db: LibSQLDatabase<any>,
  subscriberId: string,
  productId: string,
  options?: { createIfMissing?: boolean },
): Promise<RecomputeResult | null> {
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.subscriberId, subscriberId))

  let subscriptionRow: (typeof subs)[0] | null = null
  let planRow: typeof plansTable.$inferSelect | null = null

  for (const sub of subs) {
    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, sub.planId)).limit(1)
    if (plan?.productId === productId) {
      subscriptionRow = sub
      planRow = plan
      break
    }
  }

  if (!subscriptionRow || !planRow) {
    return null
  }

  const featureLinks = await db
    .select({
      featureKey: featuresTable.featureKey,
      enabled: planFeaturesTable.enabled,
    })
    .from(planFeaturesTable)
    .innerJoin(featuresTable, eq(planFeaturesTable.featureId, featuresTable.id))
    .where(eq(planFeaturesTable.planId, planRow.id))

  const limitRows = await db.select().from(planLimitsTable).where(eq(planLimitsTable.planId, planRow.id))

  const payload = buildEntitlementStoragePayload({
    subscription: subscriptionRow,
    plan: planRow,
    featureLinks,
    limitRows: limitRows.map((r) => ({
      limitKey: r.limitKey,
      limitValue: r.limitValue,
      limitUnit: r.limitUnit,
      enforcement: r.enforcement,
      notes: r.notes,
    })),
  })

  const computedAt = new Date().toISOString()

  const existing = await db
    .select()
    .from(entitlementsTable)
    .where(and(eq(entitlementsTable.subscriberId, subscriberId), eq(entitlementsTable.productId, productId)))
    .limit(1)

  let entitlementId: string
  if (existing[0]) {
    entitlementId = existing[0].id
    await db
      .update(entitlementsTable)
      .set({
        payloadJson: JSON.stringify(payload),
        computedAt,
      })
      .where(eq(entitlementsTable.id, entitlementId))
  } else {
    if (options?.createIfMissing === false) {
      return null
    }
    entitlementId = `ent_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    await db.insert(entitlementsTable).values({
      id: entitlementId,
      subscriberId,
      productId,
      payloadJson: JSON.stringify(payload),
      computedAt,
    })
  }

  return {
    entitlementId,
    subscriberId,
    productId,
    computedAt,
    payload,
  }
}
