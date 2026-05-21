import { desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import {
  entitlementsTable,
  licensesTable,
  plansTable,
  productsTable,
  subscriptionsTable,
} from '../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import {
  defaultBillingModeLabel,
  productTypeLabel,
  tenantIdsForProduct,
} from '../utils/products'
import { getStaffOrganizationId } from '../utils/organizations'
import { requireStaffApiWhenEnforced } from '../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const [products, plans, subscriptions, entitlements, licenses] = await Promise.all([
    db
      .select()
      .from(productsTable)
      .where(eq(productsTable.organizationId, organizationId))
      .orderBy(desc(productsTable.createdAt)),
    db.select().from(plansTable),
    db.select().from(subscriptionsTable),
    db.select({ tenantId: entitlementsTable.tenantId, productId: entitlementsTable.productId }).from(entitlementsTable),
    db.select({ tenantId: licensesTable.tenantId, productId: licensesTable.productId }).from(licensesTable),
  ])

  const productPlans = new Map<string, number>()
  const planIdsByProduct = new Map<string, Set<string>>()
  for (const plan of plans) {
    productPlans.set(plan.productId, (productPlans.get(plan.productId) ?? 0) + 1)
    const set = planIdsByProduct.get(plan.productId) ?? new Set<string>()
    set.add(plan.id)
    planIdsByProduct.set(plan.productId, set)
  }

  return {
    products: products.map((product) => {
      const planIds = planIdsByProduct.get(product.id) ?? new Set<string>()
      const tenantCount = tenantIdsForProduct(product.id, planIds, subscriptions, entitlements, licenses).size

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        status: product.status,
        productType: product.productType,
        productTypeLabel: productTypeLabel(product.productType),
        defaultBillingMode: product.defaultBillingMode,
        defaultBillingModeLabel: defaultBillingModeLabel(product.defaultBillingMode),
        offlineLicensesSupported: product.offlineLicensesSupported,
        activationsRequired: product.activationsRequired,
        usageTrackingEnabled: product.usageTrackingEnabled,
        extraDetails: product.extraDetails,
        planCount: productPlans.get(product.id) ?? 0,
        tenantCount,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        organizationId: product.organizationId,
      }
    }),
  }
})
