import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import {
  entitlementsTable,
  licensesTable,
  plansTable,
  productsTable,
  subscriptionsTable,
  tenantsTable,
  usageRecordsTable,
} from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { parseEntitlementLimitMap } from '../../utils/entitlement-limits'
import { recomputeEntitlementForTenantProduct } from '../../utils/entitlement-by-product'
import { requireIngestSecretOrStaffApi } from '../../utils/ingest-auth'
import { bumpMetric } from '../../utils/metrics-store'
import { isSubscriptionBillingActive } from '../../utils/products'
import { tryStripeUsageRecord } from '../../utils/stripe-usage-sync'
import { recalculateAllUsageRecords } from '../../utils/usage-recalculate'

type Body = {
  tenantId?: string
  /** When set, usage is scoped to this product; must match the license's product when licenseKey is used. */
  productId?: string | null
  /** Backward-compatible alias for product limit keys. */
  limitKey?: string
  metric?: string
  value?: number
  /** Absolute set (default) or add to existing value */
  mode?: 'set' | 'increment'
  period?: string
  periodKey?: string
  source?: string
  /** Resolve tenant/product from an online license key */
  licenseKey?: string
  /** After ingest, run full usage recalculation (default true) */
  recalculate?: boolean
}

function monthKeyNow() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function resolveUsageProductId(
  db: LibSQLDatabase<any>,
  tenantId: string,
  metric: string,
): Promise<string | null> {
  const entitlementRows = await db
    .select({ productId: entitlementsTable.productId, payloadJson: entitlementsTable.payloadJson })
    .from(entitlementsTable)
    .where(eq(entitlementsTable.tenantId, tenantId))

  const entitlementMatches = [...new Set(
    entitlementRows
      .filter((row) => Object.prototype.hasOwnProperty.call(parseEntitlementLimitMap(row.payloadJson), metric))
      .map((row) => row.productId),
  )]

  if (entitlementMatches.length === 1) {
    return entitlementMatches[0]!
  }

  if (entitlementMatches.length > 1) {
    throw createError({
      statusCode: 400,
      statusMessage: `Multiple products define the limit key ${metric}; send productId explicitly`,
    })
  }

  const activeSubscriptions = await db
    .select({ status: subscriptionsTable.status, productId: plansTable.productId })
    .from(subscriptionsTable)
    .innerJoin(plansTable, eq(subscriptionsTable.planId, plansTable.id))
    .where(eq(subscriptionsTable.tenantId, tenantId))

  const activeProducts = [...new Set(activeSubscriptions.filter((row) => isSubscriptionBillingActive(row.status)).map((row) => row.productId))]

  if (activeProducts.length === 1) {
    return activeProducts[0]!
  }

  if (activeProducts.length > 1) {
    throw createError({
      statusCode: 400,
      statusMessage: `Multiple active products found for tenant ${tenantId}; send productId explicitly`,
    })
  }

  return null
}

export default defineEventHandler(async (event) => {
  await requireIngestSecretOrStaffApi(event)
  bumpMetric('usage_report_total')

  const body = await readBody<Body>(event)
  const metric = body.limitKey?.trim() || body.metric?.trim()
  if (!metric) {
    throw createError({ statusCode: 400, statusMessage: 'limitKey (or metric) is required' })
  }

  if (typeof body.value !== 'number' || !Number.isFinite(body.value)) {
    throw createError({ statusCode: 400, statusMessage: 'value must be a finite number' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  let tenantId = body.tenantId?.trim() ?? ''
  let productId = body.productId?.trim() || null

  const licenseKey = body.licenseKey?.trim()
  if (licenseKey) {
    const [lic] = await db.select().from(licensesTable).where(eq(licensesTable.licenseKey, licenseKey))
    if (!lic) {
      throw createError({ statusCode: 404, statusMessage: 'License not found for licenseKey' })
    }
    if (tenantId && tenantId !== lic.tenantId) {
      throw createError({ statusCode: 400, statusMessage: 'tenantId does not match license' })
    }
    tenantId = lic.tenantId
    if (productId && productId !== lic.productId) {
      throw createError({ statusCode: 400, statusMessage: 'productId does not match license' })
    }
    productId = lic.productId
  }

  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'tenantId (or licenseKey) is required' })
  }
  if (!productId) {
    productId = await resolveUsageProductId(db, tenantId, metric)
  }
  if (!productId) {
    throw createError({ statusCode: 400, statusMessage: 'productId (or licenseKey) is required' })
  }

  const [tenant] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, tenantId))
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Tenant not found' })
  }

  const [p] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, productId))
  if (!p) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown productId' })
  }

  const periodKey = (body.periodKey?.trim() || monthKeyNow()).trim()
  const period = (body.period?.trim() || `Period ${periodKey}`).trim()
  const mode = body.mode === 'increment' ? 'increment' : 'set'
  const source = body.source?.trim() || 'api'

  let entitlement = (
    await db
      .select()
      .from(entitlementsTable)
      .where(and(eq(entitlementsTable.tenantId, tenantId), eq(entitlementsTable.productId, productId)))
      .limit(1)
  )[0]

  if (!entitlement) {
    await recomputeEntitlementForTenantProduct(db, tenantId, productId)
    entitlement = (
      await db
        .select()
        .from(entitlementsTable)
        .where(and(eq(entitlementsTable.tenantId, tenantId), eq(entitlementsTable.productId, productId)))
        .limit(1)
    )[0]
  }

  if (!entitlement) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No entitlement limits found for this tenant and product',
    })
  }

  if (!Object.prototype.hasOwnProperty.call(parseEntitlementLimitMap(entitlement.payloadJson), metric)) {
    await recomputeEntitlementForTenantProduct(db, tenantId, productId)
    entitlement = (
      await db
        .select()
        .from(entitlementsTable)
        .where(and(eq(entitlementsTable.tenantId, tenantId), eq(entitlementsTable.productId, productId)))
        .limit(1)
    )[0]
  }

  const refreshedLimitMap = entitlement ? parseEntitlementLimitMap(entitlement.payloadJson) : {}
  if (!Object.prototype.hasOwnProperty.call(refreshedLimitMap, metric)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unknown limit key for this product: ${metric}`,
    })
  }
  const limitValue = refreshedLimitMap[metric] ?? 0

  const candidates = await db
    .select()
    .from(usageRecordsTable)
    .where(
      and(
        eq(usageRecordsTable.tenantId, tenantId),
        eq(usageRecordsTable.metric, metric),
        eq(usageRecordsTable.periodKey, periodKey),
      ),
    )

  const productKey = productId || null
  const existing = candidates.find((r) => (r.productId?.trim() || null) === productKey)

  const now = new Date().toISOString()
  let nextValue = Math.max(0, Math.floor(body.value))
  if (existing) {
    if (mode === 'increment') {
      nextValue = existing.value + Math.floor(body.value)
    }
    let lim = existing.limitValue
    if (limitValue > 0) {
      lim = limitValue
    }
    await db
      .update(usageRecordsTable)
      .set({
        value: nextValue,
        limitValue: lim,
        period,
        recordedAt: now,
        source,
        productId: productKey,
      })
      .where(eq(usageRecordsTable.id, existing.id))
  } else {
    const id = `ur_${randomUUID().replace(/-/g, '').slice(0, 12)}`
    await db.insert(usageRecordsTable).values({
      id,
      tenantId,
      productId: productKey,
      metric,
      value: nextValue,
      limitValue,
      period,
      periodKey,
      status: 'normal',
      recordedAt: now,
      warningThresholdPercent: 80,
      enforcement: 'hard',
      source,
    })
  }

  const doRecalc = body.recalculate !== false
  const recalc = doRecalc ? await recalculateAllUsageRecords(db) : null

  void tryStripeUsageRecord(db, {
    tenantId,
    quantity: nextValue,
    idempotencyKey: `usage:${tenantId}:${metric}:${periodKey}:${nextValue}`,
  }).catch(() => {
    /* optional billing bridge */
  })

  return {
    ok: true,
    tenantId,
    productId: productKey,
    metric,
    limitKey: metric,
    periodKey,
    appliedValue: nextValue,
    mode,
    recalculated: doRecalc,
    recalculate: recalc,
  }
})
