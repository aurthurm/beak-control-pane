import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { entitlementsTable, plansTable, subscriptionsTable, usageRecordsTable } from '../db/schema'
import { insertAuditLog } from './audit-log'
import { notifyUsageAuditWebhook } from './audit-webhook'
import { recomputeEntitlementForSubscriberProduct } from './entitlement-by-product'
import { parseEntitlementLimitMap } from './entitlement-limits'
import { isSubscriptionBillingActive } from './products'
import { getLimitFromEntitlementPayload } from './entitlement-limits'

export type UsageRecalculateResult = {
  updated: number
  alerts: number
  byStatus: { normal: number; warning: number; exceeded: number }
}

function computeUsageRecordStatus(
  value: number,
  limitValue: number,
  warningPct: number,
): 'normal' | 'warning' | 'exceeded' {
  if (limitValue > 0 && value >= limitValue) {
    return 'exceeded'
  }
  if (limitValue > 0 && value / limitValue >= warningPct / 100) {
    return 'warning'
  }
  return 'normal'
}

function statusSeverity(s: string): number {
  const x = s.toLowerCase()
  if (x === 'exceeded' || x === 'critical' || x === 'over_limit') {
    return 2
  }
  if (x === 'warning') {
    return 1
  }
  return 0
}

/**
 * Recompute status for all usage rows; sync limit_value from entitlements when possible; emit audit alerts on threshold crossings.
 */
export async function recalculateAllUsageRecords(
  db: LibSQLDatabase<any>,
): Promise<UsageRecalculateResult> {
  const rows = await db.select().from(usageRecordsTable)
  const entRows = await db.select().from(entitlementsTable)
  const subs = await db.select().from(subscriptionsTable)
  const plans = await db.select({ id: plansTable.id, productId: plansTable.productId }).from(plansTable)

  const planProductById = new Map(plans.map((plan) => [plan.id, plan.productId]))
  const activeProductsByTenant = new Map<string, Set<string>>()
  for (const sub of subs) {
    if (!isSubscriptionBillingActive(sub.status)) {
      continue
    }
    const productId = planProductById.get(sub.planId)
    if (!productId) {
      continue
    }
    const key = sub.subscriberId
    const set = activeProductsByTenant.get(key) ?? new Set<string>()
    set.add(productId)
    activeProductsByTenant.set(key, set)
  }

  const entByTenantProduct = new Map<string, (typeof entRows)[0]>()
  const entitlementProductsByTenantMetric = new Map<string, Set<string>>()
  const rebuildEntitlementIndexes = (entries: typeof entRows) => {
    entByTenantProduct.clear()
    entitlementProductsByTenantMetric.clear()

    for (const e of entries) {
      const key = `${e.subscriberId}\t${e.productId}`
      entByTenantProduct.set(key, e)
      const limits = parseEntitlementLimitMap(e.payloadJson)
      for (const metric of Object.keys(limits)) {
        const metricKey = `${e.subscriberId}\t${metric}`
        const set = entitlementProductsByTenantMetric.get(metricKey) ?? new Set<string>()
        set.add(e.productId)
        entitlementProductsByTenantMetric.set(metricKey, set)
      }
    }
  }

  rebuildEntitlementIndexes(entRows)

  const missingEntitlementPairs = new Set<string>()
  for (const [subscriberId, products] of activeProductsByTenant.entries()) {
    for (const productId of products) {
      const key = `${subscriberId}\t${productId}`
      if (!entByTenantProduct.has(key)) {
        missingEntitlementPairs.add(key)
      }
    }
  }

  if (missingEntitlementPairs.size > 0) {
    for (const key of missingEntitlementPairs) {
      const [subscriberId, productId] = key.split('\t')
      if (subscriberId && productId) {
        await recomputeEntitlementForSubscriberProduct(db, subscriberId, productId)
      }
    }

    const refreshedEntRows = await db.select().from(entitlementsTable)
    rebuildEntitlementIndexes(refreshedEntRows)
  }

  let updated = 0
  let alerts = 0
  const byStatus = { normal: 0, warning: 0, exceeded: 0 }

  for (const row of rows) {
    const existingProductId = row.productId?.trim() || null
    let productId = existingProductId
    if (!productId) {
      const metricKey = `${row.subscriberId}\t${row.metric}`
      const entitlementMatches = entitlementProductsByTenantMetric.get(metricKey)
      if (entitlementMatches?.size === 1) {
        productId = [...entitlementMatches][0] ?? null
      } else if (!entitlementMatches?.size) {
        const activeProducts = activeProductsByTenant.get(row.subscriberId)
        if (activeProducts?.size === 1) {
          productId = [...activeProducts][0] ?? null
        }
      }
    }

    const ent = productId ? entByTenantProduct.get(`${row.subscriberId}\t${productId}`) : undefined
    let limitValue = row.limitValue
    if (ent?.payloadJson) {
      const fromEnt = getLimitFromEntitlementPayload(ent.payloadJson, row.metric)
      if (fromEnt != null) {
        limitValue = fromEnt
      }
    }

    const warningPct = row.warningThresholdPercent ?? 80
    const nextStatus = computeUsageRecordStatus(row.value, limitValue, warningPct)
    const prevStatus = (row.status || 'normal').toLowerCase()
    const productChanged = (row.productId?.trim() || null) !== productId

    if (nextStatus === 'normal') {
      byStatus.normal++
    } else if (nextStatus === 'warning') {
      byStatus.warning++
    } else {
      byStatus.exceeded++
    }

    const statusChanged = prevStatus !== nextStatus
    const limitChanged = row.limitValue !== limitValue
    if (statusChanged || limitChanged || productChanged) {
      await db
        .update(usageRecordsTable)
        .set({
          productId,
          limitValue,
          status: nextStatus,
          recordedAt: new Date().toISOString(),
        })
        .where(eq(usageRecordsTable.id, row.id))
      updated++
    }

    if (statusSeverity(nextStatus) > statusSeverity(prevStatus)) {
      alerts++
      const action = nextStatus === 'exceeded' ? 'usage.limit_exceeded' : 'usage.warning_threshold'
      const details = {
        metric: row.metric,
        value: row.value,
        limitValue,
        previousStatus: prevStatus,
        nextStatus,
        productId,
      }
      await insertAuditLog(db, {
        subscriberId: row.subscriberId,
        actor: 'usage.pipeline',
        action,
        resourceType: 'usage_record',
        resourceId: row.id,
        details,
      })
      notifyUsageAuditWebhook({
        action,
        subscriberId: row.subscriberId,
        resourceId: row.id,
        details,
      })
    }
  }

  return { updated, alerts, byStatus }
}
