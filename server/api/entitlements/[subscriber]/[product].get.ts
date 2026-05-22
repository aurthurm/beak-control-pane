import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import {
  entitlementsTable,
  featuresTable,
  licensesTable,
  plansTable,
  productsTable,
  subscriptionsTable,
  subscribersTable,
} from '../../../db/schema'
import { recomputeEntitlementForSubscriberProduct } from '../../../utils/entitlement-by-product'

type StoredPayload = {
  modules?: Record<string, boolean>
  limits?: Record<string, number>
  modulesDetail?: Array<{ key: string; enabled: boolean; source: string; notes: string }>
  limitsDetail?: Array<{
    metricKey: string
    value: number
    unit: string
    enforcementMode: string
    source: string
    notes: string
  }>
  meta?: Record<string, unknown>
  lineage?: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const subscriberId = getRouterParam(event, 'subscriber')
  const productId = getRouterParam(event, 'product')

  if (!subscriberId || !productId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'subscriber and product params are required',
    })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [subscriber] = await db.select().from(subscribersTable).where(eq(subscribersTable.id, subscriberId))
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId))

  if (!subscriber || !product) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Subscriber or product not found',
    })
  }

  if (subscriber.organizationId !== product.organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Subscriber and product must belong to the same organization',
    })
  }

  const subs = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.subscriberId, subscriber.id))

  let subscriptionRow: (typeof subs)[0] | null = null
  let planRow: typeof plansTable.$inferSelect | null = null

  for (const sub of subs) {
    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, sub.planId)).limit(1)
    if (plan?.productId === product.id) {
      subscriptionRow = sub
      planRow = plan
      break
    }
  }

  if (!subscriptionRow || !planRow) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No subscription for this subscriber and product',
    })
  }

  let [entRow] = await db
    .select()
    .from(entitlementsTable)
    .where(and(eq(entitlementsTable.subscriberId, subscriber.id), eq(entitlementsTable.productId, product.id)))
    .limit(1)

  if (!entRow) {
    const rec = await recomputeEntitlementForSubscriberProduct(db, subscriber.id, product.id)
    if (!rec) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Could not compute entitlements',
      })
    }
    ;[entRow] = await db
      .select()
      .from(entitlementsTable)
      .where(eq(entitlementsTable.id, rec.entitlementId))
      .limit(1)
  }

  let payload: StoredPayload = {}
  try {
    payload = JSON.parse(entRow?.payloadJson ?? '{}') as StoredPayload
  } catch {
    payload = {}
  }

  const featureRows = await db
    .select({ featureKey: featuresTable.featureKey, name: featuresTable.name })
    .from(featuresTable)
    .where(eq(featuresTable.productId, product.id))

  const nameByKey = new Map(featureRows.map((f) => [f.featureKey, f.name]))

  const modulesDetail = payload.modulesDetail ?? []
  const features = modulesDetail.map((m) => ({
    key: m.key,
    name: nameByKey.get(m.key) ?? m.key,
    enabled: m.enabled,
    source: m.source,
  }))

  const limitsDetail = payload.limitsDetail ?? []
  const limits = limitsDetail.map((l) => ({
    key: l.metricKey,
    value: l.value,
    resetPeriod: '—',
    unit: l.unit,
    enforcement: l.enforcementMode,
    notes: l.notes,
    valueKind: 'number',
  }))

  const license = (
    await db
      .select()
      .from(licensesTable)
      .where(and(eq(licensesTable.subscriberId, subscriber.id), eq(licensesTable.productId, product.id)))
  )[0]

  return {
    subscriber: {
      id: subscriber.id,
      name: subscriber.name,
      status: subscriber.status,
      seats: subscriber.seats,
    },
    product: {
      id: product.id,
      name: product.name,
      slug: product.slug,
    },
    subscription: {
      id: subscriptionRow.id,
      status: subscriptionRow.status,
      provider: subscriptionRow.provider,
      renewalAt: subscriptionRow.renewalAt,
    },
    plan: {
      id: planRow.id,
      name: planRow.name,
      billingCycle: planRow.billingCycle,
      status: planRow.status,
    },
    entitlement: {
      id: entRow?.id,
      computedAt: entRow?.computedAt,
      modules: payload.modules ?? {},
      limits: payload.limits ?? {},
      meta: payload.meta ?? {},
      lineage: payload.lineage ?? {},
      modulesDetail: payload.modulesDetail ?? [],
      limitsDetail: payload.limitsDetail ?? [],
    },
    features,
    limits,
    license: license
      ? {
          id: license.id,
          licenseKey: license.licenseKey,
          mode: license.mode,
          status: license.status,
          validTo: license.validTo,
          graceUntil: license.graceUntil,
        }
      : null,
  }
})
