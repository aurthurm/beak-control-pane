import { and, desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import {
  auditLogsTable,
  billingEventsTable,
  entitlementsTable,
  featuresTable,
  licensesTable,
  planFeaturesTable,
  plansTable,
  productsTable,
  subscriptionsTable,
  tenantsTable,
} from '../../db/schema'
import { subscriptionListItem } from '../../utils/subscriptions'
import { getStaffOrganizationId } from '../../utils/organizations'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = event.context.params?.id?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Subscription id required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const [subscription] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id))

  if (!subscription) {
    throw createError({ statusCode: 404, statusMessage: 'Subscription not found' })
  }

  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(and(eq(tenantsTable.id, subscription.tenantId), eq(tenantsTable.organizationId, organizationId)))
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Subscription not found' })
  }

  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, subscription.planId))
  const productId = plan?.productId ?? ''

  const [product] = productId
    ? await db
        .select()
        .from(productsTable)
        .where(and(eq(productsTable.id, productId), eq(productsTable.organizationId, organizationId)))
    : [undefined]

  const listFields = subscriptionListItem(subscription, plan, product?.name ?? '', productId, tenant)

  const entitlementRows =
    productId === ''
      ? []
      : await db
          .select()
          .from(entitlementsTable)
          .where(and(eq(entitlementsTable.tenantId, subscription.tenantId), eq(entitlementsTable.productId, productId)))
          .orderBy(desc(entitlementsTable.computedAt))

  const featureLinks = plan
    ? await db
        .select({
          featureId: planFeaturesTable.featureId,
          enabled: planFeaturesTable.enabled,
          featureKey: featuresTable.featureKey,
          name: featuresTable.name,
        })
        .from(planFeaturesTable)
        .innerJoin(featuresTable, eq(planFeaturesTable.featureId, featuresTable.id))
        .where(eq(planFeaturesTable.planId, plan.id))
    : []

  const bySubId = await db
    .select()
    .from(billingEventsTable)
    .where(eq(billingEventsTable.subscriptionId, id))
    .orderBy(desc(billingEventsTable.occurredAt))
    .limit(100)

  const billingEvents =
    bySubId.length > 0
      ? bySubId
      : await db
          .select()
          .from(billingEventsTable)
          .where(eq(billingEventsTable.tenantId, subscription.tenantId))
          .orderBy(desc(billingEventsTable.occurredAt))
          .limit(25)

  const statusHistory = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.resourceType, 'subscription'), eq(auditLogsTable.resourceId, id)))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(50)

  const licenseRows = await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.subscriptionId, id))
    .orderBy(desc(licensesTable.validFrom))

  const auto = listFields.autoRenew ? 'On' : 'Off'
  const pauseNote = listFields.isPaused ? 'Paused · billing hold' : 'Not paused'
  const billingState = `${pauseNote} · Auto-renew ${auto} · ${listFields.billingInterval} billing`

  return {
    subscription: listFields,
    tenant: tenant
      ? { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status }
      : null,
    product: product ? { id: product.id, name: product.name, slug: product.slug } : null,
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          slug: plan.slug,
          billingCycle: plan.billingCycle,
          priceCents: plan.priceCents,
          currency: plan.currency,
          status: plan.status,
        }
      : null,
    currentBillingState: billingState,
    planFeatures: featureLinks.map((f) => ({
      featureKey: f.featureKey,
      name: f.name,
      enabled: f.enabled,
    })),
    entitlements: entitlementRows.map((e) => ({
      id: e.id,
      computedAt: e.computedAt,
      payloadJson: e.payloadJson,
    })),
    billingEvents: billingEvents.map((b) => ({
      id: b.id,
      provider: b.provider,
      eventType: b.eventType,
      amountCents: b.amountCents,
      currency: b.currency,
      occurredAt: b.occurredAt,
      subscriptionId: b.subscriptionId,
      payloadJson: b.payloadJson,
    })),
    statusHistory: statusHistory.map((a) => ({
      id: a.id,
      actor: a.actor,
      action: a.action,
      detailsJson: a.detailsJson,
      createdAt: a.createdAt,
    })),
    licenses: licenseRows.map((license) => ({
      id: license.id,
      tenantId: license.tenantId,
      productId: license.productId,
      subscriptionId: license.subscriptionId,
      licenseKey: license.licenseKey,
      mode: license.mode,
      status: license.status,
      validFrom: license.validFrom,
      validTo: license.validTo,
      graceUntil: license.graceUntil,
      maxActivations: license.maxActivations,
      offlineAllowed: license.offlineAllowed,
      signature: license.signature,
      payloadJson: license.payloadJson,
    })),
  }
})
