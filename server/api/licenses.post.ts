import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import { licensesTable, plansTable, productsTable, subscriptionsTable, subscribersTable } from '../db/schema'
import { signLicenseOrThrow } from '../core/licensing/reissue'
import { recomputeEntitlementForSubscriberProduct } from '../utils/entitlement-by-product'
import { requireStaffApiWhenEnforced } from '../utils/auth-guards'

type LicenseRequestBody = {
  subscriptionId?: string
  mode?: 'online' | 'hybrid' | 'offline'
  maxActivations?: number
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const body = await readBody<LicenseRequestBody>(event)
  const subscriptionId = body.subscriptionId?.trim()
  const mode = body.mode ?? 'online'

  if (!subscriptionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'subscriptionId is required',
    })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [subscription] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscriptionId))
  if (!subscription) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Subscription not found',
    })
  }

  const [subscriber] = await db.select().from(subscribersTable).where(eq(subscribersTable.id, subscription.subscriberId))
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, subscription.planId))
  const [product] = plan ? await db.select().from(productsTable).where(eq(productsTable.id, plan.productId)) : [null]

  if (!subscriber || !product) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Tenant, product, or subscription not found',
    })
  }

  if (subscriber.organizationId !== product.organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Tenant and product must belong to the same organization',
    })
  }

  const planSlug = plan?.slug ?? ''
  const edition = plan?.edition?.trim() ? plan.edition : plan?.name ?? ''

  const now = new Date()
  const validTo = new Date(now)
  validTo.setFullYear(validTo.getFullYear() + 1)
  const graceUntil = new Date(validTo)
  graceUntil.setDate(graceUntil.getDate() + 15)

  const id = `lic_${randomUUID().slice(0, 8)}`
  const licenseKey = `BCP-${product.slug.toUpperCase()}-${subscriber.slug.toUpperCase()}-${id.slice(-4).toUpperCase()}`
  const maxActivations = Math.max(1, Math.floor(Number(body.maxActivations) || subscription.activationsPerLicense || 3))
  const payloadObj: Record<string, unknown> = {
    schemaVersion: '2026.04',
    subscriberId: subscription.subscriberId,
    productId: product.id,
    subscriptionId: subscription.id,
    subscriptionLicenseCount: subscription.licenseCount,
    subscriptionActivationsPerLicense: subscription.activationsPerLicense,
    mode,
    maxActivations,
    planSlug,
    edition,
    validFrom: now.toISOString(),
    validTo: validTo.toISOString(),
    graceUntil: graceUntil.toISOString(),
    constraints: {
      offlineCapable: mode !== 'online',
      connectivity: mode,
      activationCap: maxActivations,
      telemetryRequired: mode !== 'offline',
    },
    issue: {
      issuedBy: 'console',
      issuedAt: now.toISOString(),
      reason: 'generated',
      revision: 1,
    },
    binding: {} as Record<string, string | undefined>,
  }

  const ent = await recomputeEntitlementForSubscriberProduct(db, subscription.subscriberId, product.id)
  if (ent) {
    payloadObj.entitlement = {
      modules: ent.payload.modules,
      limits: ent.payload.limits,
      computedAt: ent.computedAt,
    }
  }

  const payloadJson = JSON.stringify(payloadObj)
  const signature = await signLicenseOrThrow(payloadObj)

  await db.insert(licensesTable).values({
    id,
    subscriberId: subscription.subscriberId,
    productId: product.id,
    subscriptionId: subscription.id,
    licenseKey,
    mode,
    status: 'active',
    validFrom: now.toISOString(),
    validTo: validTo.toISOString(),
    graceUntil: graceUntil.toISOString(),
    signature,
    payloadJson,
    offlineAllowed: mode !== 'online',
    maxActivations,
  })

  return {
    id,
    licenseKey,
    subscriber: subscriber.name,
    product: product.name,
    subscriptionId: subscription.id,
    mode,
    status: 'active',
    validFrom: now.toISOString(),
    validTo: validTo.toISOString(),
    graceUntil: graceUntil.toISOString(),
    signature,
    payloadJson,
  }
})
