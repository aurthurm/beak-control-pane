import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import {
  activationsTable,
  auditLogsTable,
  billingEventsTable,
  entitlementsTable,
  featuresTable,
  licensesTable,
  planAddonsTable,
  planFeaturesTable,
  planLimitsTable,
  plansTable,
  productsTable,
  runtimeFeatureFlagsTable,
  subscriptionsTable,
  subscribersTable,
  usageRecordsTable,
} from '../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import { drizzle } from 'drizzle-orm/libsql'
import { buildPlanDerived, enrichEntitlementRow, type LicenseSnapshot, type SubscriptionSnapshot } from '../utils/entitlement-enrichment'
import {
  activationCountsTowardCap,
  buildActivationBindingLabel,
  parseEnvironmentJson,
  parseHeartbeatsJson,
  parseViolationsJson,
} from '../utils/activations'
import {
  defaultBillingModeLabel,
  isSubscriptionBillingActive,
  monthlyNormalizedMrr,
  productTypeLabel,
  subscriberIdsForProduct,
} from '../utils/products'
import { effectiveSubscriptionPricing, parseAddOns } from '../utils/subscriptions'
import { isEntitledSubscriptionStatus } from '../utils/features'
import { getStaffOrganizationId } from '../utils/organizations'
import { requireStaffApiWhenEnforced } from '../utils/auth-guards'
import { deriveUsageUiStatus, latestUsagePeriodKey, usageMetricLabel } from '../utils/usage-dashboard'
import { parsePlanMetadata } from '../utils/planMetadata'

const MS_DAY = 86_400_000
const ACTIVATION_STALE_MS = 14 * 24 * 60 * 60 * 1000

function monthKeyFromDate(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthKey: string) {
  const parts = monthKey.split('-')
  if (parts.length !== 2) {
    return monthKey
  }
  const y = Number(parts[0])
  const m = Number(parts[1])
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  )
}

type PlanLimitForSummary = {
  limitKey: string
  limitValue: number
  resetPeriod: string
  limitUnit: string
  valueKind: 'number' | 'boolean'
  enforcement: 'hard' | 'soft'
}

function buildLimitsSummary(limits: PlanLimitForSummary[]): string {
  if (limits.length === 0) {
    return 'No limits'
  }

  const formatOne = (l: PlanLimitForSummary): string => {
    if (l.valueKind === 'boolean') {
      return `${l.limitKey}: ${l.limitValue ? 'yes' : 'no'}`
    }
    const unit = l.limitUnit.trim() ? ` ${l.limitUnit}` : ''
    const soft = l.enforcement === 'soft' ? ' (soft)' : ''
    return `${l.limitKey}: ${l.limitValue}${unit} / ${l.resetPeriod}${soft}`
  }

  const head = limits.slice(0, 4).map(formatOne)
  const rest = limits.length > 4 ? `; +${limits.length - 4} more` : ''
  return head.join('; ') + rest
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.organizationId, organizationId))
    .orderBy(desc(productsTable.createdAt))
  const productIds = products.map((p) => p.id)

  const tenants = await db
    .select()
    .from(subscribersTable)
    .where(eq(subscribersTable.organizationId, organizationId))
    .orderBy(desc(subscribersTable.createdAt))
  const subscriberIds = tenants.map((t) => t.id)

  const plans = productIds.length
    ? await db
        .select()
        .from(plansTable)
        .where(inArray(plansTable.productId, productIds))
        .orderBy(desc(plansTable.createdAt))
    : []
  const planIds = plans.map((p) => p.id)

  const subscriptions = subscriberIds.length
    ? await db.select().from(subscriptionsTable).where(inArray(subscriptionsTable.subscriberId, subscriberIds))
    : []

  const licenses =
    subscriberIds.length && productIds.length
      ? await db
          .select()
          .from(licensesTable)
          .where(and(inArray(licensesTable.subscriberId, subscriberIds), inArray(licensesTable.productId, productIds)))
      : []
  const licenseIds = licenses.map((l) => l.id)

  const activations = licenseIds.length
    ? await db
        .select()
        .from(activationsTable)
        .where(inArray(activationsTable.licenseId, licenseIds))
        .orderBy(desc(activationsTable.lastSeenAt))
    : []

  const usageWhere =
    subscriberIds.length && productIds.length
      ? and(
          inArray(usageRecordsTable.subscriberId, subscriberIds),
          or(isNull(usageRecordsTable.productId), inArray(usageRecordsTable.productId, productIds)),
        )
      : subscriberIds.length
        ? and(
            inArray(usageRecordsTable.subscriberId, subscriberIds),
            isNull(usageRecordsTable.productId),
          )
        : sql`1 = 0`

  const usageRecords = subscriberIds.length ? await db.select().from(usageRecordsTable).where(usageWhere) : []

  const billingEvents = subscriberIds.length
    ? await db
        .select()
        .from(billingEventsTable)
        .where(inArray(billingEventsTable.subscriberId, subscriberIds))
        .orderBy(desc(billingEventsTable.occurredAt))
    : []

  const features = productIds.length
    ? await db
        .select()
        .from(featuresTable)
        .where(or(isNull(featuresTable.productId), inArray(featuresTable.productId, productIds)))
    : await db.select().from(featuresTable).where(isNull(featuresTable.productId))

  const planFeatures = planIds.length
    ? await db.select().from(planFeaturesTable).where(inArray(planFeaturesTable.planId, planIds))
    : []

  const planLimits = planIds.length
    ? await db.select().from(planLimitsTable).where(inArray(planLimitsTable.planId, planIds))
    : []

  const planAddonLinks = planIds.length
    ? await db.select().from(planAddonsTable).where(inArray(planAddonsTable.planId, planIds))
    : []

  const entitlements =
    subscriberIds.length && productIds.length
      ? await db
          .select()
          .from(entitlementsTable)
          .where(and(inArray(entitlementsTable.subscriberId, subscriberIds), inArray(entitlementsTable.productId, productIds)))
      : []

  const auditLogs = subscriberIds.length
    ? await db
        .select()
        .from(auditLogsTable)
        .where(inArray(auditLogsTable.subscriberId, subscriberIds))
        .orderBy(desc(auditLogsTable.createdAt))
    : []

  const runtimeFlags = productIds.length
    ? await db
        .select()
        .from(runtimeFeatureFlagsTable)
        .where(or(isNull(runtimeFeatureFlagsTable.productId), inArray(runtimeFeatureFlagsTable.productId, productIds)))
    : await db.select().from(runtimeFeatureFlagsTable).where(isNull(runtimeFeatureFlagsTable.productId))

  const now = new Date()
  const onlineLicenses = licenses.filter((license) => license.mode === 'online').length
  const offlineLicenses = licenses.filter((license) => license.mode === 'offline').length
  const expiryLimit = new Date(now.getTime() + 30 * MS_DAY)

  const expiringSoon = licenses.filter((license) => {
    const expiry = new Date(license.validTo)
    return expiry > now && expiry <= expiryLimit
  }).length

  const expiringInDays = (days: number) =>
    licenses.filter((license) => {
      const expiry = new Date(license.validTo)
      const horizon = new Date(now.getTime() + days * MS_DAY)
      return expiry > now && expiry <= horizon
    })

  const productPlans = new Map<string, number>()
  const planIdsByProduct = new Map<string, Set<string>>()
  for (const plan of plans) {
    productPlans.set(plan.productId, (productPlans.get(plan.productId) ?? 0) + 1)
    const idSet = planIdsByProduct.get(plan.productId) ?? new Set<string>()
    idSet.add(plan.id)
    planIdsByProduct.set(plan.productId, idSet)
  }

  const entitlementIndex = entitlements.map((e) => ({ subscriberId: e.subscriberId, productId: e.productId }))
  const licenseIndex = licenses.map((l) => ({ subscriberId: l.subscriberId, productId: l.productId }))

  const planMap = new Map(plans.map((plan) => [plan.id, plan]))
  const tenantMap = new Map(tenants.map((subscriber) => [subscriber.id, subscriber]))
  const productMap = new Map(products.map((product) => [product.id, product]))
  const featureMap = new Map(features.map((feature) => [feature.id, feature]))
  const subsByTenant = new Map<string, typeof subscriptions>()
  for (const s of subscriptions) {
    const cur = subsByTenant.get(s.subscriberId) ?? []
    cur.push(s)
    subsByTenant.set(s.subscriberId, cur)
  }

  const resolveUsageProductId = (subscriberId: string, explicit: string | null | undefined) => {
    if (explicit && String(explicit).trim()) {
      return String(explicit).trim()
    }

    const sub = subscriptions.find((s) => s.subscriberId === subscriberId && isSubscriptionBillingActive(s.status))
    if (!sub) {
      return ''
    }

    return planMap.get(sub.planId)?.productId ?? ''
  }

  const subscribedProductNames = (subscriberId: string) => {
    const names = new Set<string>()
    for (const sub of subsByTenant.get(subscriberId) ?? []) {
      const plan = planMap.get(sub.planId)
      const product = plan ? productMap.get(plan.productId) : undefined
      if (product?.name) names.add(product.name)
    }
    for (const ent of entitlements) {
      if (ent.subscriberId !== subscriberId) continue
      const product = productMap.get(ent.productId)
      if (product?.name) names.add(product.name)
    }
    return [...names].sort()
  }

  const planSummaryForTenant = (subscriberId: string) => {
    const parts: string[] = []
    for (const sub of subsByTenant.get(subscriberId) ?? []) {
      const plan = planMap.get(sub.planId)
      const product = plan ? productMap.get(plan.productId) : undefined
      const label = product && plan ? `${product.name} — ${plan.name}` : plan?.name ?? sub.planId
      parts.push(label)
    }
    const uniq = [...new Set(parts)]
    return uniq.length ? uniq.join(' · ') : '—'
  }

  const billingStatusForTenant = (subscriberId: string) => {
    const subs = subsByTenant.get(subscriberId) ?? []
    if (!subs.length) return 'None'
    const lowered = subs.map((s) => s.status.toLowerCase())
    if (lowered.some((x) => x === 'past_due')) return 'Past due'
    if (lowered.some((x) => x === 'trialing')) return 'Trialing'
    if (lowered.some((x) => x === 'active')) return 'Active'
    if (lowered.every((x) => x === 'canceled' || x === 'cancelled' || x === 'expired' || x === 'ended')) return 'Ended'
    return subs[0]!.status
  }

  const licenseStatusForTenant = (subscriberId: string) => {
    const lics = licenses.filter((l) => l.subscriberId === subscriberId)
    if (!lics.length) return 'None'
    const lowered = lics.map((l) => l.status.toLowerCase())
    if (lowered.some((x) => x === 'expired')) return 'Expired'
    if (lowered.some((x) => x === 'revoked')) return 'Revoked'
    if (lowered.some((x) => x === 'grace')) return 'Grace'
    if (lowered.some((x) => x === 'active')) return 'Active'
    return lics[0]!.status
  }
  const featurePlans = new Map<
    string,
    Array<{ planId: string; planName: string; productName: string; enabled: boolean }>
  >()

  for (const link of planFeatures) {
    const plan = planMap.get(link.planId)

    if (!plan) {
      continue
    }

    const product = productMap.get(plan.productId)
    const rows = featurePlans.get(link.featureId) ?? []

    rows.push({
      planId: plan.id,
      planName: plan.name,
      productName: product?.name ?? plan.productId,
      enabled: link.enabled,
    })
    featurePlans.set(link.featureId, rows)
  }

  const runtimeFlagsByFeature = new Map<
    string,
    Array<{ id: string; flagKey: string; name: string; status: string; globallyEnabled: boolean }>
  >()
  for (const rf of runtimeFlags) {
    if (!rf.linkedFeatureId) {
      continue
    }
    const list = runtimeFlagsByFeature.get(rf.linkedFeatureId) ?? []
    list.push({
      id: rf.id,
      flagKey: rf.flagKey,
      name: rf.name,
      status: rf.status,
      globallyEnabled: rf.globallyEnabled,
    })
    runtimeFlagsByFeature.set(rf.linkedFeatureId, list)
  }

  const entitledTenantsMap = new Map<string, Map<string, { id: string; name: string; via: Set<string> }>>()
  const addEntitledTenant = (
    featureId: string,
    subscriberId: string,
    subscriberName: string,
    via: 'plan' | 'entitlement',
  ) => {
    const byTenant = entitledTenantsMap.get(featureId) ?? new Map()
    const cur = byTenant.get(subscriberId) ?? { id: subscriberId, name: subscriberName, via: new Set<string>() }
    cur.via.add(via)
    cur.name = subscriberName
    byTenant.set(subscriberId, cur)
    entitledTenantsMap.set(featureId, byTenant)
  }

  for (const link of planFeatures) {
    if (!link.enabled) {
      continue
    }

    for (const sub of subscriptions) {
      if (sub.planId !== link.planId || !isEntitledSubscriptionStatus(sub.status)) {
        continue
      }

      const subscriber = tenantMap.get(sub.subscriberId)
      if (!subscriber) {
        continue
      }

      addEntitledTenant(link.featureId, subscriber.id, subscriber.name, 'plan')
    }
  }

  for (const ent of entitlements) {
    let modules: Record<string, boolean> = {}

    try {
      modules = (JSON.parse(ent.payloadJson) as { modules?: Record<string, boolean> }).modules ?? {}
    } catch {
      modules = {}
    }

    for (const feature of features) {
      if (modules[feature.featureKey] !== true) {
        continue
      }

      if (feature.productId && feature.productId !== ent.productId) {
        continue
      }

      const subscriber = tenantMap.get(ent.subscriberId)
      if (!subscriber) {
        continue
      }

      addEntitledTenant(feature.id, subscriber.id, subscriber.name, 'entitlement')
    }
  }

  const planFeatureRows = planFeatures.map((link) => ({
    planId: link.planId,
    featureKey: featureMap.get(link.featureId)?.featureKey ?? '',
    enabled: link.enabled,
  }))

  const planLimitRowsFlat = planLimits.map((limit) => ({
    planId: limit.planId,
    limitKey: limit.limitKey,
    limitValue: limit.limitValue,
    limitUnit: limit.limitUnit,
    enforcement: limit.enforcement,
    notes: limit.notes,
  }))

  const subscriptionForTenantProduct = (subscriberId: string, productId: string) => {
    for (const sub of subsByTenant.get(subscriberId) ?? []) {
      const plan = planMap.get(sub.planId)
      if (plan?.productId === productId) {
        return sub
      }
    }
    return null
  }

  const tenantsWithSubscription = new Set(subscriptions.map((s) => s.subscriberId))
  const activeSubscriptions = subscriptions.filter((s) => isSubscriptionBillingActive(s.status)).length
  const trialingSubscriptions = subscriptions.filter((s) => s.status.toLowerCase() === 'trialing').length
  const trialTenants = tenants.filter((t) => t.status.toLowerCase() === 'trial').length

  let mrrCents = 0
  for (const subscription of subscriptions) {
    if (!isSubscriptionBillingActive(subscription.status)) {
      continue
    }

    const plan = planMap.get(subscription.planId)
    if (!plan) {
      continue
    }

    mrrCents += monthlyNormalizedMrr(plan.priceCents, plan.billingCycle)
  }

  const arrCents = mrrCents * 12

  const failedPaymentsCount = billingEvents.filter((e) => {
    if (e.processingStatus === 'failed') return true
    return /fail|declin|chargeback|dispute|past_due/i.test(e.eventType)
  }).length

  const offlineLicensesActive = licenses.filter(
    (l) => l.mode === 'offline' && l.status.toLowerCase() === 'active',
  ).length

  const renewalOverdue = subscriptions.filter((s) => {
    if (!isSubscriptionBillingActive(s.status)) {
      return false
    }

    return new Date(s.renewalAt).getTime() < now.getTime()
  })

  const activationsByLicense = new Map<string, number>()
  const deviceCountByLicense = new Map<string, Map<string, number>>()
  const sitesByLicense = new Map<string, Set<string>>()
  for (const act of activations) {
    if (!activationCountsTowardCap(act.status)) {
      continue
    }

    activationsByLicense.set(act.licenseId, (activationsByLicense.get(act.licenseId) ?? 0) + 1)
    const dm = deviceCountByLicense.get(act.licenseId) ?? new Map<string, number>()
    dm.set(act.deviceId, (dm.get(act.deviceId) ?? 0) + 1)
    deviceCountByLicense.set(act.licenseId, dm)
    const sites = sitesByLicense.get(act.licenseId) ?? new Set<string>()
    sites.add(act.siteId)
    sitesByLicense.set(act.licenseId, sites)
  }

  const lastCheckInByLicense = new Map<string, string>()
  for (const act of activations) {
    const prev = lastCheckInByLicense.get(act.licenseId)
    if (!prev || new Date(act.lastSeenAt).getTime() > new Date(prev).getTime()) {
      lastCheckInByLicense.set(act.licenseId, act.lastSeenAt)
    }
  }

  const lastPayloadDownloadByLicense = new Map<string, string>()
  for (const log of auditLogs) {
    if (log.resourceType !== 'license' || log.action !== 'license.payload_downloaded') {
      continue
    }

    const prev = lastPayloadDownloadByLicense.get(log.resourceId)
    if (!prev || new Date(log.createdAt).getTime() > new Date(prev).getTime()) {
      lastPayloadDownloadByLicense.set(log.resourceId, log.createdAt)
    }
  }

  const parseEntitlementPayload = (payloadJson: string) => {
    try {
      const raw = JSON.parse(payloadJson) as { modules?: Record<string, boolean>; limits?: Record<string, number> }
      return {
        modules: raw.modules ?? null,
        limits: raw.limits ?? null,
      }
    } catch {
      return { modules: null as Record<string, boolean> | null, limits: null as Record<string, number> | null }
    }
  }

  const subscriptionForLicenseRow = (license: (typeof licenses)[number]) => {
    for (const sub of subsByTenant.get(license.subscriberId) ?? []) {
      const plan = planMap.get(sub.planId)
      if (plan?.productId === license.productId) {
        return { subscription: sub, plan }
      }
    }

    return null
  }

  const overLimitUsage = usageRecords.filter((r) => {
    if (r.limitValue <= 0) {
      return false
    }

    return (
      deriveUsageUiStatus({
        value: r.value,
        limitValue: r.limitValue,
        status: r.status,
        warningThresholdPercent: r.warningThresholdPercent ?? 80,
      }) === 'exceeded'
    )
  })

  const usageWarning = usageRecords.filter(
    (r) =>
      deriveUsageUiStatus({
        value: r.value,
        limitValue: r.limitValue,
        status: r.status,
        warningThresholdPercent: r.warningThresholdPercent ?? 80,
      }) === 'warning',
  )

  const licensesExpiring7d = expiringInDays(7)
  const licensesExpiring30d = expiringInDays(30)

  const offlineNearingExpiry = licenses.filter((l) => {
    if (l.mode !== 'offline') {
      return false
    }

    const expiry = new Date(l.validTo)
    return expiry > now && expiry <= expiryLimit
  })

  const suspiciousActivations = licenses
    .map((license) => {
      const used = activationsByLicense.get(license.id) ?? 0
      const max = license.maxActivations

      if (max <= 0 || used < Math.ceil(max * 0.8)) {
        return null
      }

      return { license, used, max, atCap: used >= max }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  const tenantsWithoutSubscription = tenants.filter((t) => !tenantsWithSubscription.has(t.id))

  type AlertSeverity = 'critical' | 'warning' | 'info'
  type DashboardAlert = {
    severity: AlertSeverity
    title: string
    detail: string
    count: number
    href: string
  }

  const alerts: DashboardAlert[] = []

  if (failedPaymentsCount > 0) {
    alerts.push({
      severity: 'critical',
      title: 'Failed or disputed payments',
      detail: 'Review billing events and retry or contact subscribers.',
      count: failedPaymentsCount,
      href: '/subscribers',
    })
  }

  if (renewalOverdue.length > 0) {
    alerts.push({
      severity: 'critical',
      title: 'Subscriptions past renewal date',
      detail: 'Active or trialing subscriptions with renewal date in the past.',
      count: renewalOverdue.length,
      href: '/subscriptions',
    })
  }

  if (licensesExpiring7d.length > 0) {
    alerts.push({
      severity: 'critical',
      title: 'Licenses expiring within 7 days',
      detail: 'Renew or re-issue before access is interrupted.',
      count: licensesExpiring7d.length,
      href: '/licenses',
    })
  } else if (licensesExpiring30d.length > 0) {
    alerts.push({
      severity: 'warning',
      title: 'Licenses expiring within 30 days',
      detail: 'Schedule renewals with subscribers.',
      count: licensesExpiring30d.length,
      href: '/licenses',
    })
  }

  if (overLimitUsage.length > 0) {
    alerts.push({
      severity: 'critical',
      title: 'Tenants over usage limits',
      detail: 'Usage metrics at or above plan limits.',
      count: new Set(overLimitUsage.map((r) => r.subscriberId)).size,
      href: '/usage',
    })
  } else if (usageWarning.length > 0) {
    alerts.push({
      severity: 'warning',
      title: 'Tenants nearing usage limits',
      detail: 'Watch for upgrades or limit increases.',
      count: new Set(usageWarning.map((r) => r.subscriberId)).size,
      href: '/usage',
    })
  }

  const atCapActivations = suspiciousActivations.filter((s) => s.atCap)
  if (atCapActivations.length > 0) {
    alerts.push({
      severity: 'critical',
      title: 'Activation capacity reached',
      detail: 'One or more licenses are at max activations.',
      count: atCapActivations.length,
      href: '/licenses',
    })
  } else if (suspiciousActivations.length > 0) {
    alerts.push({
      severity: 'warning',
      title: 'High activation utilization',
      detail: 'Licenses at 80%+ of activation allowance — possible expansion or abuse.',
      count: suspiciousActivations.length,
      href: '/licenses',
    })
  }

  if (offlineNearingExpiry.length > 0) {
    alerts.push({
      severity: 'warning',
      title: 'Offline licenses nearing expiry',
      detail: 'Offline deployments need renewal windows planned in advance.',
      count: offlineNearingExpiry.length,
      href: '/licenses',
    })
  }

  if (tenantsWithoutSubscription.length > 0) {
    alerts.push({
      severity: 'info',
      title: 'Tenants without a subscription',
      detail: 'Subscribers present but no subscription row — assign plans or clean up.',
      count: tenantsWithoutSubscription.length,
      href: '/subscribers',
    })
  }

  alerts.sort((a, b) => {
    const rank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
    return rank[a.severity] - rank[b.severity] || b.count - a.count
  })

  const featureNameByKey = new Map(features.map((f) => [f.featureKey, f.name]))

  const productStats = products.map((product) => {
    const subsForProduct = subscriptions.filter((s) => {
      const plan = planMap.get(s.planId)
      return plan?.productId === product.id && isSubscriptionBillingActive(s.status)
    })

    const subscriberIds = new Set(subsForProduct.map((s) => s.subscriberId))
    const activeTenants = subscriberIds.size

    let revenueContributionCents = 0
    for (const s of subsForProduct) {
      const plan = planMap.get(s.planId)
      if (plan) {
        revenueContributionCents += monthlyNormalizedMrr(plan.priceCents, plan.billingCycle)
      }
    }

    const moduleUsage = new Map<string, number>()
    for (const ent of entitlements) {
      if (ent.productId !== product.id) {
        continue
      }

      let payload: Record<string, unknown> = {}
      try {
        payload = JSON.parse(ent.payloadJson) as Record<string, unknown>
      } catch {
        payload = {}
      }

      const modules = payload.modules as Record<string, boolean> | undefined
      if (!modules) {
        continue
      }

      for (const [key, on] of Object.entries(modules)) {
        if (on) {
          moduleUsage.set(key, (moduleUsage.get(key) ?? 0) + 1)
        }
      }
    }

    const topModules = [...moduleUsage.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, count]) => ({
        key,
        name: featureNameByKey.get(key) ?? key,
        subscriberCount: count,
      }))

    const seatsSum = [...subscriberIds].reduce((acc, tid) => acc + (tenantMap.get(tid)?.seats ?? 0), 0)
    const avgUsersPerTenant = activeTenants > 0 ? Math.round((seatsSum / activeTenants) * 10) / 10 : 0

    const recentCutoff = new Date(now.getTime() - 30 * MS_DAY)
    const olderCutoff = new Date(now.getTime() - 60 * MS_DAY)
    const recentTenants = [...subscriberIds].filter((tid) => {
      const created = tenantMap.get(tid)?.createdAt
      return created && new Date(created) >= recentCutoff
    }).length
    const olderTenants = [...subscriberIds].filter((tid) => {
      const created = tenantMap.get(tid)?.createdAt
      if (!created) {
        return false
      }

      const d = new Date(created)
      return d >= olderCutoff && d < recentCutoff
    }).length

    let growthTrend: 'up' | 'flat' | 'down' = 'flat'
    if (recentTenants > olderTenants) {
      growthTrend = 'up'
    } else if (recentTenants < olderTenants && olderTenants > 0) {
      growthTrend = 'down'
    }

    return {
      productId: product.id,
      name: product.name,
      slug: product.slug,
      status: product.status,
      activeTenants,
      revenueContributionCents,
      topModules,
      avgUsersPerTenant,
      growthTrend,
    }
  })

  const paidBillingTypes = /invoice|paid|renew|charge|subscription/i
  const excludeBillingTypes = /trial|fail|refund/i

  const monthBuckets = new Map<string, number>()
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    monthBuckets.set(monthKeyFromDate(d), 0)
  }

  for (const event of billingEvents) {
    if (!paidBillingTypes.test(event.eventType) || excludeBillingTypes.test(event.eventType)) {
      continue
    }

    const mk = monthKeyFromDate(new Date(event.occurredAt))
    if (monthBuckets.has(mk)) {
      monthBuckets.set(mk, (monthBuckets.get(mk) ?? 0) + event.amountCents)
    }
  }

  const monthlyBillingTrend = [...monthBuckets.entries()].map(([monthKey, totalCents]) => ({
    monthKey,
    label: monthLabel(monthKey),
    totalCents,
  }))

  const newSubscribersByMonth = new Map<string, number>()
  for (const mk of monthBuckets.keys()) {
    newSubscribersByMonth.set(mk, 0)
  }

  for (const subscriber of tenants) {
    const mk = monthKeyFromDate(new Date(subscriber.createdAt))
    if (newSubscribersByMonth.has(mk)) {
      newSubscribersByMonth.set(mk, (newSubscribersByMonth.get(mk) ?? 0) + 1)
    }
  }

  const newTenantsTrend = [...newSubscribersByMonth.entries()].map(([monthKey, count]) => ({
    monthKey,
    label: monthLabel(monthKey),
    count,
  }))

  const canceledSubs = subscriptions.filter((s) => /cancel|expired|ended/i.test(s.status)).length
  const churnRatePercent =
    subscriptions.length > 0 ? Math.round((canceledSubs / subscriptions.length) * 1000) / 10 : null

  const activeSubsList = subscriptions.filter((s) => isSubscriptionBillingActive(s.status))
  const planDistributionMap = new Map<string, { planName: string; productName: string; count: number; mrrCents: number }>()

  for (const s of activeSubsList) {
    const plan = planMap.get(s.planId)
    if (!plan) {
      continue
    }

    const productName = productMap.get(plan.productId)?.name ?? ''
    const key = plan.id
    const row = planDistributionMap.get(key) ?? {
      planName: plan.name,
      productName,
      count: 0,
      mrrCents: 0,
    }

    row.count += 1
    row.mrrCents += monthlyNormalizedMrr(plan.priceCents, plan.billingCycle)
    planDistributionMap.set(key, row)
  }

  const planDistribution = [...planDistributionMap.values()].sort((a, b) => b.mrrCents - a.mrrCents)

  type FeedItem = {
    id: string
    kind: 'billing' | 'audit'
    occurredAt: string
    title: string
    description: string
    severity: 'success' | 'warning' | 'destructive' | 'info'
    href: string
  }

  const billingFeedLabel = (eventType: string) => {
    const t = eventType.toLowerCase()
    if (t.includes('fail') || t.includes('declin')) {
      return { title: 'Payment failed', severity: 'destructive' as const }
    }

    if (t.includes('paid') || t.includes('renew')) {
      return { title: 'Payment received', severity: 'success' as const }
    }

    if (t.includes('trial')) {
      return { title: 'Trial started', severity: 'warning' as const }
    }

    return { title: eventType.replace(/_/g, ' '), severity: 'info' as const }
  }

  const auditFeedLabel = (action: string) => {
    const a = action.toLowerCase()
    if (a.includes('license.issued') || a.includes('license_issued')) {
      return { title: 'License issued', severity: 'info' as const }
    }

    if (a.includes('activation')) {
      return { title: 'License activated', severity: 'success' as const }
    }

    if (a.includes('billing')) {
      return { title: 'Billing event processed', severity: 'info' as const }
    }

    if (a.includes('entitlement')) {
      return { title: 'Entitlements updated', severity: 'info' as const }
    }

    return { title: action.replace(/\./g, ' '), severity: 'info' as const }
  }

  const activityFeed: FeedItem[] = []

  for (const event of billingEvents) {
    const subscriber = tenantMap.get(event.subscriberId)
    const bl = billingFeedLabel(event.eventType)
    activityFeed.push({
      id: `bevt-${event.id}`,
      kind: 'billing',
      occurredAt: event.occurredAt,
      title: bl.title,
      description: `${subscriber?.name ?? 'Tenant'} · ${event.provider} · ${event.eventType}`,
      severity: bl.severity,
      href: `/subscribers/${event.subscriberId}?tab=billing`,
    })
  }

  for (const log of auditLogs) {
    const subscriber = log.subscriberId ? tenantMap.get(log.subscriberId) : undefined
    const al = auditFeedLabel(log.action)
    const severity =
      String(log.result).toLowerCase() === 'failure' ? ('destructive' as const) : al.severity
    activityFeed.push({
      id: `aud-${log.id}`,
      kind: 'audit',
      occurredAt: log.createdAt,
      title: al.title,
      description: `${subscriber?.name ?? 'Beak'} · ${log.actor} · ${log.resourceType}`,
      severity,
      href: '/audit-logs',
    })
  }

  activityFeed.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
  const activityFeedTop = activityFeed.slice(0, 40)

  const usagePeriodKeyLatest = latestUsagePeriodKey(usageRecords)
  const usageInLatestPeriod = usagePeriodKeyLatest
    ? usageRecords.filter((r) => (r.periodKey ?? '').trim() === usagePeriodKeyLatest)
    : usageRecords

  const usageTotal = usageInLatestPeriod.reduce((acc, record) => acc + record.value, 0)

  const monthlyApiCalls = usageInLatestPeriod
    .filter((record) => record.metric === 'api_calls_per_month')
    .reduce((acc, record) => acc + record.value, 0)

  return {
    summary: {
      products: products.length,
      tenants: tenants.length,
      plans: plans.length,
      licenses: licenses.length,
      activations: activations.length,
      monthlyApiCalls,
      onlineLicenses,
      offlineLicenses,
      expiringSoon,
    },
    businessHealth: {
      totalSubscribers: tenants.length,
      activeSubscriptions,
      mrrCents,
      arrCents,
      trialTenants,
      trialingSubscriptions,
      expiringLicenses30d: licensesExpiring30d.length,
      failedPayments: failedPaymentsCount,
      offlineLicensesActive,
    },
    productOverview: productStats,
    alerts,
    activityFeed: activityFeedTop,
    revenueInsights: {
      mrrCents,
      monthlyBillingTrend,
      newTenantsByMonth: newTenantsTrend,
      churnRatePercent,
      planDistribution,
    },
    modules: [
      {
        title: 'Product catalog',
        description: 'Products, plans, features, and limits are modeled separately so one control plane can serve many applications.',
        status: 'Ready',
      },
      {
        title: 'Subscriber management',
        description: 'Tenants, subscriptions, and seat allocations are represented for self-service and internal teams.',
        status: 'Ready',
      },
      {
        title: 'Billing gateway',
        description: 'Provider abstraction keeps Stripe, Paynow, and manual contracts under a single event model.',
        status: 'Ready',
      },
      {
        title: 'Entitlement engine',
        description: 'Plan features, overrides, and limits can be merged into one computed entitlement payload.',
        status: 'Ready',
      },
      {
        title: 'License management',
        description: 'License records support online fetch, hybrid refresh, and offline export/import flows.',
        status: 'Ready',
      },
      {
        title: 'Activation management',
        description: 'Device, site, and installation bindings can be checked against activation limits.',
        status: 'Ready',
      },
      {
        title: 'Usage tracking',
        description: 'Metrics are recorded with thresholds so overuse and alerts can be surfaced quickly.',
        status: 'Ready',
      },
      {
        title: 'Feature flags',
        description: 'Feature rollout support is modeled through plan-to-feature relationships and entitlements.',
        status: 'Ready',
      },
    ],
    api: [
      {
        method: 'GET',
        path: '/api/entitlements/:subscriber/:product',
        purpose: 'Return computed modules and limits for a subscriber and product pair.',
      },
      {
        method: 'POST',
        path: '/api/licenses',
        purpose: 'Generate a new license record for online, hybrid, or offline delivery.',
      },
      {
        method: 'POST',
        path: '/api/activations',
        purpose: 'Register a machine, server, site, user, or installation activation; enforces per-license caps.',
      },
      {
        method: 'GET',
        path: '/api/activations/:id',
        purpose: 'Inspect one activation with license, subscriber, heartbeats, violations, and risk indicators.',
      },
      {
        method: 'PATCH',
        path: '/api/activations/:id',
        purpose: 'Release (deactivate), invalidate, or record a check-in heartbeat.',
      },
    ],
    products: products.map((product) => {
      const planIds = planIdsByProduct.get(product.id) ?? new Set<string>()
      const subscriberCount = subscriberIdsForProduct(product.id, planIds, subscriptions, entitlementIndex, licenseIndex).size

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        status: product.status,
        activePlans: productPlans.get(product.id) ?? 0,
        productType: product.productType,
        productTypeLabel: productTypeLabel(product.productType),
        defaultBillingMode: product.defaultBillingMode,
        defaultBillingModeLabel: defaultBillingModeLabel(product.defaultBillingMode),
        subscriberCount,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        offlineLicensesSupported: product.offlineLicensesSupported,
        activationsRequired: product.activationsRequired,
        usageTrackingEnabled: product.usageTrackingEnabled,
        description: product.description,
      }
    }),
    tenants: tenants.map((subscriber) => {
      const planSummary = planSummaryForTenant(subscriber.id)
      const productsSubscribed = subscribedProductNames(subscriber.id)
      return {
        id: subscriber.id,
        slug: subscriber.slug,
        legalName: subscriber.legalName,
        name: subscriber.name,
        industry: subscriber.industry,
        status: subscriber.status,
        planName: planSummary === '—' ? 'Unassigned' : planSummary,
        planSummary,
        subscribedProducts: productsSubscribed,
        billingStatus: billingStatusForTenant(subscriber.id),
        licenseStatus: licenseStatusForTenant(subscriber.id),
        country: subscriber.country,
        createdAt: subscriber.createdAt,
        contactName: subscriber.contactName,
        email: subscriber.email,
        phone: subscriber.phone,
        billingMode: subscriber.billingMode,
        billingProvider: subscriber.billingProvider,
        supportTier: subscriber.supportTier,
        internalNotes: subscriber.internalNotes,
        productCount: subscriptions.filter((subscription) => subscription.subscriberId === subscriber.id).length,
        seats: subscriber.seats,
        enterpriseSegment: subscriber.enterpriseSegment ?? '',
      }
    }),
    licenses: licenses.map((license) => {
      const subscriber = tenantMap.get(license.subscriberId)
      const product = productMap.get(license.productId)

      return {
        id: license.id,
        subscriberId: license.subscriberId,
        productId: license.productId,
        licenseKey: license.licenseKey,
        subscriberName: subscriber?.name ?? license.subscriberId,
        productName: product?.name ?? license.productId,
        mode: license.mode,
        status: license.status,
        validFrom: license.validFrom,
        validTo: license.validTo,
        graceUntil: license.graceUntil,
        maxActivations: license.maxActivations,
        offlineAllowed: license.offlineAllowed,
        payloadJson: license.payloadJson,
        signature: license.signature,
      }
    }),
    activations: activations.map((activation) => {
      const license = licenses.find((row) => row.id === activation.licenseId)
      const subscriber = license ? tenantMap.get(license.subscriberId) : undefined
      const product = license ? productMap.get(license.productId) : undefined

      const consumed = activationsByLicense.get(activation.licenseId) ?? 0
      const maxAct = license?.maxActivations ?? 0
      const deviceDupes = deviceCountByLicense.get(activation.licenseId)?.get(activation.deviceId) ?? 0
      const duplicateMachine = deviceDupes > 1

      const siteSet = sitesByLicense.get(activation.licenseId)
      const multiEnvironment = (siteSet?.size ?? 0) >= 3

      const lastSeenMs = new Date(activation.lastSeenAt).getTime()
      const stale = Number.isFinite(lastSeenMs) && now.getTime() - lastSeenMs > ACTIVATION_STALE_MS

      const licenseAtCap = consumed >= maxAct && maxAct > 0
      const licenseOverCap = consumed > maxAct && maxAct > 0

      const st = activation.status.toLowerCase()
      const inactiveConsumingSeat = stale && (st === 'active' || st === 'exceeded')

      const suspicious = stale || duplicateMachine || licenseOverCap || st === 'exceeded'

      const highUtilization =
        maxAct > 0 && consumed >= Math.ceil(maxAct * 0.8) && consumed < maxAct

      const environment = parseEnvironmentJson(activation.environmentJson)
      const activatedAt = activation.activatedAt?.trim() ? activation.activatedAt : activation.lastSeenAt

      return {
        id: activation.id,
        licenseId: activation.licenseId,
        licenseKey: license?.licenseKey ?? activation.licenseId,
        subscriberId: license?.subscriberId ?? '',
        subscriberName: subscriber?.name ?? '',
        productName: product?.name ?? '',
        deviceId: activation.deviceId,
        siteId: activation.siteId,
        installationId: activation.installationId,
        userBinding: activation.userBinding ?? '',
        activationType: activation.activationType ?? 'machine',
        bindingLabel: buildActivationBindingLabel(activation),
        status: activation.status,
        activatedAt,
        lastSeenAt: activation.lastSeenAt,
        environment,
        maxActivations: maxAct,
        activeSeatsForLicense: consumed,
        indicators: {
          stale,
          duplicateMachine,
          multiEnvironment,
          licenseAtCap,
          licenseOverCap,
          inactiveConsumingSeat,
          suspicious,
          highUtilization,
        },
      }
    }),
    usage: usageRecords.map((record) => {
      const subscriber = tenantMap.get(record.subscriberId)
      const productId = resolveUsageProductId(record.subscriberId, record.productId)
      const product = productId ? productMap.get(productId) : undefined
      const limitValue = record.limitValue
      const utilizationPercent = limitValue > 0 ? Math.round((record.value / limitValue) * 1000) / 10 : 0
      const warningThresholdPercent = record.warningThresholdPercent ?? 80
      const status = deriveUsageUiStatus({
        value: record.value,
        limitValue,
        status: record.status,
        warningThresholdPercent,
      })
      const enforcementRaw = (record.enforcement ?? 'hard').toLowerCase()
      const enforcement = enforcementRaw === 'advisory' ? 'advisory' : 'hard'

      return {
        id: record.id,
        subscriberId: record.subscriberId,
        subscriberName: subscriber?.name ?? record.subscriberId,
        productId,
        productName: product?.name ?? (productId ? productId : '—'),
        metric: record.metric,
        metricLabel: usageMetricLabel(record.metric),
        value: record.value,
        limitValue,
        utilizationPercent,
        period: record.period,
        periodKey: (record.periodKey ?? '').trim() || record.period,
        status,
        rawStatus: record.status,
        recordedAt: record.recordedAt,
        warningThresholdPercent,
        enforcement,
        source: record.source?.trim() ? record.source : 'metering.pipeline',
      }
    }),
    billingEvents: billingEvents.map((event) => {
      const t = tenantMap.get(event.subscriberId)
      return {
        id: event.id,
        subscriberId: event.subscriberId,
        subscriberName: t?.name ?? event.subscriberId,
        subscriptionId: event.subscriptionId,
        provider: event.provider,
        eventType: event.eventType,
        amountCents: event.amountCents,
        currency: event.currency,
        occurredAt: event.occurredAt,
        status: event.processingStatus,
        processedAt: event.processedAt,
        retryCount: event.retryCount,
      }
    }),
    plansDetail: plans.map((plan) => {
      const meta = parsePlanMetadata(plan.metadataJson)
      const limitsForPlan = planLimits
        .filter((limit) => limit.planId === plan.id)
        .map((limit) => ({
          id: limit.id,
          limitKey: limit.limitKey,
          limitValue: limit.limitValue,
          resetPeriod: limit.resetPeriod,
          limitUnit: limit.limitUnit ?? '',
          enforcement: (limit.enforcement === 'soft' ? 'soft' : 'hard') as 'hard' | 'soft',
          notes: limit.notes ?? '',
          valueKind: (limit.valueKind === 'boolean' ? 'boolean' : 'number') as 'number' | 'boolean',
        }))

      const enabledLinks = planFeatures.filter((link) => link.planId === plan.id && link.enabled)
      const includedFeatures = enabledLinks
        .map((link) => {
          const feature = featureMap.get(link.featureId)
          if (!feature) {
            return null
          }

          return { id: feature.id, featureKey: feature.featureKey, name: feature.name }
        })
        .filter((row): row is { id: string; featureKey: string; name: string } => Boolean(row))

      const activeAddonKeys = planAddonLinks.filter((row) => row.planId === plan.id).map((row) => row.addonKey)

      const updatedAt =
        plan.updatedAt && String(plan.updatedAt).trim() !== '' ? plan.updatedAt : plan.createdAt

      return {
        id: plan.id,
        productId: plan.productId,
        productName: productMap.get(plan.productId)?.name ?? plan.productId,
        slug: plan.slug,
        name: plan.name,
        edition: plan.edition ?? '',
        billingCycle: plan.billingCycle,
        priceCents: plan.priceCents,
        currency: plan.currency,
        status: plan.status,
        createdAt: plan.createdAt,
        updatedAt,
        trialSupported: Boolean(plan.trialSupported),
        visibility: plan.visibility ?? 'public',
        isDefault: Boolean(plan.isDefault),
        isRecommended: Boolean(plan.isRecommended),
        limits: limitsForPlan,
        limitsSummary: buildLimitsSummary(limitsForPlan),
        enabledFeatureCount: enabledLinks.length,
        includedFeatures,
        activeAddonKeys,
        billingMappings: meta.billingMappings ?? {},
        trialSettings: meta.trial ?? { days: 0, requiresPaymentMethod: false },
        gracePeriodDays: meta.gracePeriodDays ?? 0,
        enterpriseOverrideCompatible: Boolean(meta.enterpriseOverrideCompatible),
      }
    }),
    featuresDetail: features.map((feature) => {
      const parseJsonArray = (raw: string): string[] => {
        try {
          const v = JSON.parse(raw) as unknown
          return Array.isArray(v) ? v.map((x) => String(x)) : []
        } catch {
          return []
        }
      }

      const parseJsonObject = (raw: string): Record<string, unknown> => {
        try {
          const v = JSON.parse(raw) as unknown
          return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
        } catch {
          return {}
        }
      }

      const assignments = featurePlans.get(feature.id) ?? []
      const plansUsingCount = assignments.filter((row) => row.enabled).length
      const tenantRows = entitledTenantsMap.get(feature.id) ?? new Map()
      const entitledTenants = [...tenantRows.values()].map((t) => ({
        id: t.id,
        name: t.name,
        via: [...t.via].sort() as Array<'plan' | 'entitlement'>,
      }))

      const myEnabledPlans = new Set(assignments.filter((a) => a.enabled).map((a) => a.planId))
      const relatedCatalogFlags = features
        .filter(
          (f) =>
            f.category === 'feature-flags' &&
            f.id !== feature.id &&
            (featurePlans.get(f.id) ?? []).some((a) => a.enabled && myEnabledPlans.has(a.planId)),
        )
        .map((f) => ({ id: f.id, name: f.name, featureKey: f.featureKey }))

      const depIds = parseJsonArray(feature.dependenciesJson ?? '[]')
      const mutexIds = parseJsonArray(feature.mutuallyExclusiveJson ?? '[]')

      const recentChanges = auditLogs
        .filter((log) => {
          if (log.resourceType === 'feature' && log.resourceId === feature.id) {
            return true
          }

          try {
            const d = JSON.parse(log.detailsJson) as { featureId?: string; featureKey?: string }
            return d.featureId === feature.id || d.featureKey === feature.featureKey
          } catch {
            return false
          }
        })
        .slice(0, 12)
        .map((log) => ({
          id: log.id,
          action: log.action,
          actor: log.actor,
          createdAt: log.createdAt,
          resourceName: log.resourceName ?? '',
        }))

      return {
        id: feature.id,
        featureKey: feature.featureKey,
        name: feature.name,
        description: feature.description,
        category: feature.category,
        productId: feature.productId ?? null,
        productName: feature.productId ? productMap.get(feature.productId)?.name ?? null : null,
        featureType: feature.featureType ?? 'module',
        isBillable: Boolean(feature.isBillable ?? true),
        defaultEnabled: Boolean(feature.defaultEnabled ?? true),
        status: feature.status ?? 'active',
        visibility: feature.visibility ?? 'public',
        visibilityRules: parseJsonObject(feature.visibilityRulesJson ?? '{}'),
        dependencies: depIds.map((id) => {
          const f = featureMap.get(id)
          return f ? { id: f.id, name: f.name, featureKey: f.featureKey } : { id, name: id, featureKey: '' }
        }),
        mutuallyExclusive: mutexIds.map((id) => {
          const f = featureMap.get(id)
          return f ? { id: f.id, name: f.name, featureKey: f.featureKey } : { id, name: id, featureKey: '' }
        }),
        tags: parseJsonArray(feature.tagsJson ?? '[]'),
        updatedAt: (feature.updatedAt && feature.updatedAt.trim()) || '—',
        planAssignments: assignments,
        plansUsingCount,
        entitledTenants,
        runtimeFlags: runtimeFlagsByFeature.get(feature.id) ?? [],
        relatedCatalogFlags,
        recentChanges,
      }
    }),
    subscriptionsDetail: subscriptions.map((subscription) => {
      const plan = planMap.get(subscription.planId)
      const product = plan ? productMap.get(plan.productId) : undefined
      const pricing = plan
        ? effectiveSubscriptionPricing(subscription, plan)
        : {
            amountCents: subscription.amountOverrideCents ?? 0,
            unitAmountCents: subscription.amountOverrideCents ?? 0,
          licenseCount: Math.max(1, Math.floor(Number((subscription as { licenseCount?: number }).licenseCount) || 1)),
          activationsPerLicense: Math.max(
            1,
            Math.floor(Number((subscription as { activationsPerLicense?: number }).activationsPerLicense) || 1),
          ),
          currency: subscription.currencyOverride?.trim() ? subscription.currencyOverride : 'USD',
          billingInterval: '—',
        }

      return {
        id: subscription.id,
        subscriberId: subscription.subscriberId,
        subscriberName: tenantMap.get(subscription.subscriberId)?.name ?? subscription.subscriberId,
        planId: subscription.planId,
        planName: plan?.name ?? subscription.planId,
        productId: product?.id ?? plan?.productId ?? '',
        productName: product?.name ?? '',
        provider: subscription.provider,
        providerRef: subscription.providerRef,
        status: subscription.status,
        startsAt: subscription.startsAt,
        renewalAt: subscription.renewalAt,
        endsAt: subscription.endsAt,
        graceEndsAt: subscription.graceEndsAt,
        autoRenew: subscription.autoRenew,
        manualContract: subscription.manualContract,
        pausedAt: subscription.pausedAt,
        billingInterval: pricing.billingInterval,
        amountCents: pricing.amountCents,
        unitAmountCents: pricing.unitAmountCents,
        licenseCount: pricing.licenseCount,
        activationsPerLicense: pricing.activationsPerLicense,
        currency: pricing.currency,
        addOns: parseAddOns(subscription.addOnsJson),
      }
    }),
    entitlementsDetail: entitlements.map((entitlement) => {
      let payload: Record<string, unknown> = {}

      try {
        payload = JSON.parse(entitlement.payloadJson) as Record<string, unknown>
      } catch {
        payload = {}
      }

      const subRow = subscriptionForTenantProduct(entitlement.subscriberId, entitlement.productId)
      const plan = subRow ? planMap.get(subRow.planId) : null
      const planDerived = plan
        ? buildPlanDerived(plan.id, plan.name, plan.productId, planFeatureRows, planLimitRowsFlat)
        : null

      let addOns: unknown[] = []
      try {
        addOns = JSON.parse(subRow?.addOnsJson || '[]') as unknown[]
      } catch {
        addOns = []
      }

      const subscription: SubscriptionSnapshot | null = subRow
        ? {
            id: subRow.id,
            status: subRow.status,
            provider: subRow.provider,
            providerRef: subRow.providerRef,
            planId: subRow.planId,
            planName: plan?.name ?? subRow.planId,
            startsAt: subRow.startsAt,
            renewalAt: subRow.renewalAt,
            endsAt: subRow.endsAt,
            manualContract: subRow.manualContract,
            addOns,
          }
        : null

      const licRow = licenses.find((l) => l.subscriberId === entitlement.subscriberId && l.productId === entitlement.productId)
      let payloadSummary: Record<string, unknown> = {}
      try {
        payloadSummary = JSON.parse(licRow?.payloadJson || '{}') as Record<string, unknown>
      } catch {
        payloadSummary = {}
      }

      const license: LicenseSnapshot | null = licRow
        ? {
            id: licRow.id,
            licenseKey: licRow.licenseKey,
            mode: licRow.mode,
            status: licRow.status,
            validFrom: licRow.validFrom,
            validTo: licRow.validTo,
            graceUntil: licRow.graceUntil,
            payloadSummary,
          }
        : null

      const modules = payload.modules as Record<string, boolean> | undefined
      const featureFlagInteractions = features
        .filter((f) => f.category === 'feature-flags')
        .map((f) => {
          const link = planFeatureRows.find((r) => r.planId === subRow?.planId && r.featureKey === f.featureKey)
          const enabledOnPlan = link?.enabled ?? false
          const enabledInEntitlement = modules?.[f.featureKey] ?? false
          let notes = ''
          if (enabledInEntitlement && !enabledOnPlan) {
            notes = 'Enabled in entitlement but off in plan catalog — override, add-on path, or stale catalog snapshot.'
          } else if (!enabledInEntitlement && enabledOnPlan) {
            notes = 'Plan enables flag but entitlement does not — rollout gate or partial compute.'
          }
          return {
            featureKey: f.featureKey,
            name: f.name,
            enabledInEntitlement,
            enabledOnPlan,
            notes,
          }
        })

      return enrichEntitlementRow({
        id: entitlement.id,
        subscriberId: entitlement.subscriberId,
        subscriberName: tenantMap.get(entitlement.subscriberId)?.name ?? entitlement.subscriberId,
        productId: entitlement.productId,
        productName: productMap.get(entitlement.productId)?.name ?? entitlement.productId,
        computedAt: entitlement.computedAt,
        payloadJson: entitlement.payloadJson,
        subscription,
        planDerived,
        license,
        featureFlagInteractions,
        auditLogs,
      })
    }),
    auditTrail: auditLogs.map((log) => ({
      id: log.id,
      subscriberId: log.subscriberId,
      subscriberName: log.subscriberId ? tenantMap.get(log.subscriberId)?.name ?? log.subscriberId : 'Beak',
      actor: log.actor,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      resourceName: log.resourceName ?? '',
      source: log.source ?? 'job',
      result: log.result ?? 'success',
      detailsJson: log.detailsJson,
      createdAt: log.createdAt,
    })),
    featureFlags: features
      .filter((feature) => feature.category === 'feature-flags')
      .map((feature) => ({
        id: feature.id,
        featureKey: feature.featureKey,
        name: feature.name,
        description: feature.description,
        assignments: (featurePlans.get(feature.id) ?? []).filter((assignment) => assignment.enabled),
      })),
    totals: {
      usageTotal,
    },
  }
})
