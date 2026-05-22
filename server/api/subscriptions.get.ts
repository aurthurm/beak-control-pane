import { and, desc, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import { plansTable, productsTable, subscriptionsTable, subscribersTable } from '../db/schema'
import { subscriptionListItem } from '../utils/subscriptions'
import { getStaffOrganizationId } from '../utils/organizations'
import { requireStaffApiWhenEnforced } from '../utils/auth-guards'

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

  const subscriptions = subscriberIds.length
    ? await db.select().from(subscriptionsTable).where(inArray(subscriptionsTable.subscriberId, subscriberIds))
    : []

  const planMap = new Map(plans.map((p) => [p.id, p]))
  const productMap = new Map(products.map((p) => [p.id, p]))
  const tenantMap = new Map(tenants.map((t) => [t.id, t]))

  const list = subscriptions.map((sub) => {
    const plan = planMap.get(sub.planId)
    const product = plan ? productMap.get(plan.productId) : undefined
    const subscriber = tenantMap.get(sub.subscriberId)
    return subscriptionListItem(sub, plan, product?.name ?? '', product?.id ?? plan?.productId ?? '', subscriber)
  })

  return {
    subscriptions: list,
    references: {
      tenants: tenants.map((t) => ({ id: t.id, name: t.name })),
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        productId: p.productId,
        productName: productMap.get(p.productId)?.name ?? p.productId,
        billingCycle: p.billingCycle,
        priceCents: p.priceCents,
        currency: p.currency,
      })),
      products: products.map((p) => ({ id: p.id, name: p.name })),
    },
  }
})
