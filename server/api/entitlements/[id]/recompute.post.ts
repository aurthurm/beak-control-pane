import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import {
  auditLogsTable,
  entitlementsTable,
  featuresTable,
  planFeaturesTable,
  planLimitsTable,
  plansTable,
  subscriptionsTable,
} from '../../../db/schema'
import { buildEntitlementStoragePayload } from '../../../utils/entitlement-recompute'
import { reissueLicensesForTenantProduct } from '../../../core/licensing/reissue'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Entitlement id required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [entitlement] = await db.select().from(entitlementsTable).where(eq(entitlementsTable.id, id)).limit(1)
  if (!entitlement) {
    throw createError({ statusCode: 404, statusMessage: 'Entitlement not found' })
  }

  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, entitlement.tenantId))

  let subscriptionRow: (typeof subs)[0] | null = null
  let planRow: typeof plansTable.$inferSelect | null = null

  for (const sub of subs) {
    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, sub.planId)).limit(1)
    if (plan?.productId === entitlement.productId) {
      subscriptionRow = sub
      planRow = plan
      break
    }
  }

  if (!subscriptionRow || !planRow) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No subscription for this tenant and product; cannot recompute from catalog',
    })
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
  await db
    .update(entitlementsTable)
    .set({
      payloadJson: JSON.stringify(payload),
      computedAt,
    })
    .where(eq(entitlementsTable.id, id))

  await reissueLicensesForTenantProduct(db, entitlement.tenantId, entitlement.productId, 'entitlement.recompute')

  const auditId = `aud_${randomBytes(6).toString('hex')}`
  await db.insert(auditLogsTable).values({
    id: auditId,
    tenantId: entitlement.tenantId,
    actor: 'console',
    action: 'entitlement.recomputed',
    resourceType: 'entitlement',
    resourceId: entitlement.id,
    resourceName: `${entitlement.tenantId} · ${entitlement.productId}`,
    source: 'api',
    result: 'success',
    detailsJson: JSON.stringify({
      reason: 'manual_recompute',
      planId: planRow.id,
      subscriptionId: subscriptionRow.id,
      computedAt,
    }),
    createdAt: computedAt,
  })

  return {
    ok: true,
    id: entitlement.id,
    computedAt,
    payload,
  }
})
