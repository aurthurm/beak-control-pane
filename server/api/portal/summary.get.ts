import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { getQuery } from 'h3'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import {
  activationsTable,
  entitlementsTable,
  licensesTable,
  organizationsTable,
  plansTable,
  productsTable,
  subscriptionsTable,
  tenantsTable,
  usageRecordsTable,
} from '../../db/schema'
import { getSessionFromEvent } from '../../utils/auth'
import { activationCountsTowardCap } from '../../utils/activations'
import { isEntitledSubscriptionStatus } from '../../utils/features'
import { subscriptionListItem } from '../../utils/subscriptions'
import { deriveUsageUiStatus, usageMetricLabel } from '../../utils/usage-dashboard'

type PortalSummaryQuery = {
  organizationId?: string
}

function isoDateLabel(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    return value || '—'
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d)
}

function formatMoney(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amountCents / 100)
  } catch {
    return `${currency || 'USD'} ${Math.round(amountCents / 100)}`
  }
}

function summarizeEntitlement(payloadJson: string) {
  try {
    const payload = JSON.parse(payloadJson) as {
      modules?: Record<string, boolean>
      limits?: Record<string, number>
      meta?: { primarySource?: string }
    }
    const modules = Object.entries(payload.modules ?? {})
    const limits = Object.entries(payload.limits ?? {})
    return {
      moduleCount: modules.length,
      enabledModuleCount: modules.filter(([, enabled]) => enabled).length,
      limitCount: limits.length,
      modulePreview: modules.slice(0, 3).map(([key, enabled]) => `${key}: ${enabled ? 'on' : 'off'}`),
      limitPreview: limits.slice(0, 3).map(([key, value]) => `${key}: ${value}`),
      primarySource: payload.meta?.primarySource ?? 'unknown',
    }
  } catch {
    return {
      moduleCount: 0,
      enabledModuleCount: 0,
      limitCount: 0,
      modulePreview: [] as string[],
      limitPreview: [] as string[],
      primarySource: 'unknown',
    }
  }
}

export default defineEventHandler(async (event) => {
  const session = await getSessionFromEvent(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  }
  if (session.user.platformRole !== 'customer') {
    throw createError({ statusCode: 403, statusMessage: 'Customer portal access only' })
  }

  const query = getQuery(event) as PortalSummaryQuery
  const requestedOrganizationId = typeof query.organizationId === 'string' ? query.organizationId.trim() : ''
  const membershipOrgIds = [...new Set(session.memberships.map((m) => m.organizationId))]
  if (!membershipOrgIds.length) {
    throw createError({ statusCode: 404, statusMessage: 'No customers available for this account' })
  }
  if (requestedOrganizationId && !membershipOrgIds.includes(requestedOrganizationId)) {
    throw createError({ statusCode: 403, statusMessage: 'Customer not available in this account' })
  }

  const activeOrganizationId = requestedOrganizationId || membershipOrgIds[0]!

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const organizations = await db
    .select()
    .from(organizationsTable)
    .where(inArray(organizationsTable.id, membershipOrgIds))
    .orderBy(desc(organizationsTable.createdAt))

  const organizationMap = new Map(organizations.map((org) => [org.id, org]))

  const products = await db
    .select()
    .from(productsTable)
    .where(inArray(productsTable.organizationId, membershipOrgIds))
    .orderBy(desc(productsTable.createdAt))
  const productById = new Map(products.map((product) => [product.id, product]))

  const tenants = await db
    .select()
    .from(tenantsTable)
    .where(inArray(tenantsTable.organizationId, membershipOrgIds))
    .orderBy(desc(tenantsTable.createdAt))
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]))

  const productIds = products.map((product) => product.id)
  const tenantIds = tenants.map((tenant) => tenant.id)

  const plans = productIds.length
    ? await db.select().from(plansTable).where(inArray(plansTable.productId, productIds))
    : []
  const planById = new Map(plans.map((plan) => [plan.id, plan]))

  const subscriptions = tenantIds.length
    ? await db.select().from(subscriptionsTable).where(inArray(subscriptionsTable.tenantId, tenantIds))
    : []
  const licenses =
    tenantIds.length && productIds.length
      ? await db
          .select()
          .from(licensesTable)
          .where(and(inArray(licensesTable.tenantId, tenantIds), inArray(licensesTable.productId, productIds)))
      : []
  const licenseIds = licenses.map((license) => license.id)

  const activations = licenseIds.length
    ? await db
        .select()
        .from(activationsTable)
        .where(inArray(activationsTable.licenseId, licenseIds))
        .orderBy(desc(activationsTable.lastSeenAt))
    : []

  const usageWhere =
    tenantIds.length && productIds.length
      ? and(
          inArray(usageRecordsTable.tenantId, tenantIds),
          or(isNull(usageRecordsTable.productId), inArray(usageRecordsTable.productId, productIds)),
        )
      : tenantIds.length
        ? and(inArray(usageRecordsTable.tenantId, tenantIds), isNull(usageRecordsTable.productId))
        : null
  const usageRecords = usageWhere
    ? await db.select().from(usageRecordsTable).where(usageWhere).orderBy(desc(usageRecordsTable.recordedAt))
    : []

  const entitlements =
    tenantIds.length && productIds.length
      ? await db
          .select()
          .from(entitlementsTable)
          .where(and(inArray(entitlementsTable.tenantId, tenantIds), inArray(entitlementsTable.productId, productIds)))
          .orderBy(desc(entitlementsTable.computedAt))
      : []

  const selectedOrganization = organizationMap.get(activeOrganizationId) ?? null

  const orgCounts = new Map<string, {
    productCount: number
    tenantCount: number
    subscriptionCount: number
    activeSubscriptionCount: number
    licenseCount: number
    onlineLicenseCount: number
    expiringLicenseCount: number
    usageRecordCount: number
    entitlementCount: number
  }>()

  for (const orgId of membershipOrgIds) {
    orgCounts.set(orgId, {
      productCount: 0,
      tenantCount: 0,
      subscriptionCount: 0,
      activeSubscriptionCount: 0,
      licenseCount: 0,
      onlineLicenseCount: 0,
      expiringLicenseCount: 0,
      usageRecordCount: 0,
      entitlementCount: 0,
    })
  }

  for (const product of products) {
    const entry = orgCounts.get(product.organizationId)
    if (entry) {
      entry.productCount += 1
    }
  }
  for (const tenant of tenants) {
    const entry = orgCounts.get(tenant.organizationId)
    if (entry) {
      entry.tenantCount += 1
    }
  }

  const tenantOrgById = new Map(tenants.map((tenant) => [tenant.id, tenant.organizationId]))
  const productOrgById = new Map(products.map((product) => [product.id, product.organizationId]))

  const now = new Date()
  const soon = new Date(now.getTime() + 30 * 86_400_000)
  for (const subscription of subscriptions) {
    const orgId = tenantOrgById.get(subscription.tenantId)
    const entry = orgId ? orgCounts.get(orgId) : null
    if (!entry) {
      continue
    }
    entry.subscriptionCount += 1
    if (isEntitledSubscriptionStatus(subscription.status)) {
      entry.activeSubscriptionCount += 1
    }
  }
  for (const license of licenses) {
    const orgId = tenantOrgById.get(license.tenantId) ?? productOrgById.get(license.productId)
    const entry = orgId ? orgCounts.get(orgId) : null
    if (!entry) {
      continue
    }
    entry.licenseCount += 1
    if (license.mode === 'online') {
      entry.onlineLicenseCount += 1
    }
    const expires = new Date(license.validTo)
    if (expires > now && expires <= soon) {
      entry.expiringLicenseCount += 1
    }
  }
  for (const usageRecord of usageRecords) {
    const orgId = tenantOrgById.get(usageRecord.tenantId)
    const entry = orgId ? orgCounts.get(orgId) : null
    if (entry) {
      entry.usageRecordCount += 1
    }
  }
  for (const entitlement of entitlements) {
    const orgId = tenantOrgById.get(entitlement.tenantId) ?? productOrgById.get(entitlement.productId)
    const entry = orgId ? orgCounts.get(orgId) : null
    if (entry) {
      entry.entitlementCount += 1
    }
  }

  const selectedTenantIds = tenants.filter((tenant) => tenant.organizationId === activeOrganizationId).map((tenant) => tenant.id)
  const selectedProductIds = products.filter((product) => product.organizationId === activeOrganizationId).map((product) => product.id)
  const selectedPlans = plans.filter((plan) => selectedProductIds.includes(plan.productId))
  const selectedSubscriptions = subscriptions.filter((subscription) => selectedTenantIds.includes(subscription.tenantId))
  const selectedLicenses = licenses.filter(
    (license) => selectedTenantIds.includes(license.tenantId) || selectedProductIds.includes(license.productId),
  )
  const selectedUsage = usageRecords.filter((record) => {
    if (!selectedTenantIds.includes(record.tenantId)) {
      return false
    }
    return record.productId ? selectedProductIds.includes(record.productId) : true
  })
  const selectedEntitlements = entitlements.filter(
    (row) => selectedTenantIds.includes(row.tenantId) || selectedProductIds.includes(row.productId),
  )

  const activationsByLicense = new Map<string, typeof activations>()
  for (const activation of activations) {
    const bucket = activationsByLicense.get(activation.licenseId) ?? []
    bucket.push(activation)
    activationsByLicense.set(activation.licenseId, bucket)
  }

  const licenseCards = selectedLicenses.map((license) => {
    const licenseActivations = activationsByLicense.get(license.id) ?? []
    const activeActivations = licenseActivations.filter((activation) => activationCountsTowardCap(activation.status)).length
    const latestSeenAt = licenseActivations[0]?.lastSeenAt ?? ''
    const expires = new Date(license.validTo)
    const remainingDays = Number.isNaN(expires.getTime()) ? null : Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / 86_400_000))
    return {
      id: license.id,
      tenantName: tenantById.get(license.tenantId)?.name ?? license.tenantId,
      productName: productById.get(license.productId)?.name ?? license.productId,
      licenseKey: license.licenseKey,
      mode: license.mode,
      status: license.status,
      validTo: license.validTo,
      validToLabel: isoDateLabel(license.validTo),
      graceUntil: license.graceUntil,
      graceUntilLabel: isoDateLabel(license.graceUntil),
      remainingDays,
      maxActivations: license.maxActivations,
      activeActivations,
      activationsTotal: licenseActivations.length,
      latestSeenAt,
      latestSeenAtLabel: latestSeenAt ? isoDateLabel(latestSeenAt) : '',
    }
  })

  const subscriptionCards = selectedSubscriptions
    .map((subscription) => {
      const plan = planById.get(subscription.planId)
      const product = plan ? productById.get(plan.productId) : productById.get(subscription.planId)
      const tenant = tenantById.get(subscription.tenantId)
      const item = subscriptionListItem(subscription, plan, product?.name ?? '', product?.id ?? plan?.productId ?? '', tenant)
      return {
        ...item,
        renewalAtLabel: isoDateLabel(item.renewalAt),
        endsAtLabel: isoDateLabel(item.endsAt),
        amountLabel: formatMoney(item.amountCents, item.currency),
      }
    })
    .sort((a, b) => a.renewalAt.localeCompare(b.renewalAt))

  const usageCards = selectedUsage.map((usageRecord) => {
    const status = deriveUsageUiStatus(usageRecord)
    const product = usageRecord.productId ? productById.get(usageRecord.productId) : null
    const tenant = tenantById.get(usageRecord.tenantId)
    return {
      id: usageRecord.id,
      tenantName: tenant?.name ?? usageRecord.tenantId,
      productName: product?.name ?? (usageRecord.productId ?? 'All products'),
      metric: usageRecord.metric,
      metricLabel: usageMetricLabel(usageRecord.metric),
      value: usageRecord.value,
      limitValue: usageRecord.limitValue,
      period: usageRecord.period,
      periodKey: usageRecord.periodKey,
      recordedAt: usageRecord.recordedAt,
      recordedAtLabel: isoDateLabel(usageRecord.recordedAt),
      status: usageRecord.status,
      uiStatus: status,
      warningThresholdPercent: usageRecord.warningThresholdPercent,
    }
  })

  const entitlementCards = selectedEntitlements
    .map((entitlement) => {
      const product = productById.get(entitlement.productId)
      const tenant = tenantById.get(entitlement.tenantId)
      const summary = summarizeEntitlement(entitlement.payloadJson)
      return {
        id: entitlement.id,
        tenantName: tenant?.name ?? entitlement.tenantId,
        productName: product?.name ?? entitlement.productId,
        computedAt: entitlement.computedAt,
        computedAtLabel: isoDateLabel(entitlement.computedAt),
        primarySource: summary.primarySource,
        moduleCount: summary.moduleCount,
        enabledModuleCount: summary.enabledModuleCount,
        limitCount: summary.limitCount,
        modulePreview: summary.modulePreview,
        limitPreview: summary.limitPreview,
      }
    })

  const selectedCounts = orgCounts.get(activeOrganizationId) ?? {
    productCount: 0,
    tenantCount: 0,
    subscriptionCount: 0,
    activeSubscriptionCount: 0,
    licenseCount: 0,
    onlineLicenseCount: 0,
    expiringLicenseCount: 0,
    usageRecordCount: 0,
    entitlementCount: 0,
  }

  return {
    account: {
      user: session.user,
      memberships: session.memberships.map((membership) => {
        const org = organizationMap.get(membership.organizationId)
        const counts = orgCounts.get(membership.organizationId) ?? {
          productCount: 0,
          tenantCount: 0,
          subscriptionCount: 0,
          activeSubscriptionCount: 0,
          licenseCount: 0,
          onlineLicenseCount: 0,
          expiringLicenseCount: 0,
          usageRecordCount: 0,
          entitlementCount: 0,
        }
        return {
          organizationId: membership.organizationId,
          organizationName: org?.name ?? membership.organizationId,
          organizationSlug: org?.slug ?? '',
          organizationStatus: org?.status ?? '',
          membershipRole: membership.membershipRole,
          counts,
        }
      }),
    },
    activeOrganizationId,
    activeOrganization: selectedOrganization
      ? {
          id: selectedOrganization.id,
          name: selectedOrganization.name,
          slug: selectedOrganization.slug,
          status: selectedOrganization.status,
          createdAt: selectedOrganization.createdAt,
          updatedAt: selectedOrganization.updatedAt,
        }
      : null,
    overview: {
      productCount: selectedCounts.productCount,
      tenantCount: selectedCounts.tenantCount,
      subscriptionCount: selectedCounts.subscriptionCount,
      activeSubscriptionCount: selectedCounts.activeSubscriptionCount,
      licenseCount: selectedCounts.licenseCount,
      onlineLicenseCount: selectedCounts.onlineLicenseCount,
      expiringLicenseCount: selectedCounts.expiringLicenseCount,
      usageRecordCount: selectedCounts.usageRecordCount,
      entitlementCount: selectedCounts.entitlementCount,
      planCount: selectedPlans.length,
      activationCount: activations.length,
    },
    entryPoints: [
      {
        key: 'subscriptions',
        title: 'Subscriptions',
        href: '/portal/subscriptions',
        description: 'Review current plans, renewals, and billing state.',
        count: selectedCounts.subscriptionCount,
      },
      {
        key: 'licenses',
        title: 'Licenses',
        href: '/portal/licenses',
        description: 'Check license status, activations, and expiry windows.',
        count: selectedCounts.licenseCount,
      },
      {
        key: 'usage',
        title: 'Usage',
        href: '/portal/usage',
        description: 'Track usage against limits and warning thresholds.',
        count: selectedCounts.usageRecordCount,
      },
      {
        key: 'entitlements',
        title: 'Entitlements',
        href: '/portal/entitlements',
        description: 'Inspect effective modules and limits in the active customer.',
        count: selectedCounts.entitlementCount,
      },
    ],
    subscriptions: subscriptionCards,
    licenses: licenseCards,
    usage: usageCards,
    entitlements: entitlementCards,
    recent: {
      subscriptions: subscriptionCards.slice(0, 4),
      licenses: licenseCards.slice(0, 4),
      usage: usageCards.slice(0, 4),
      entitlements: entitlementCards.slice(0, 4),
    },
  }
})
