import { drizzle } from 'drizzle-orm/libsql'
import { eq, inArray, isNull, or } from 'drizzle-orm'
import { featuresTable, planFeaturesTable, plansTable, productsTable, runtimeFeatureFlagsTable, tenantsTable } from '../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import { toRuntimeFlagListItem } from '../utils/runtime-flags'
import { getStaffOrganizationId } from '../utils/organizations'
import { requireStaffApiWhenEnforced } from '../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const query = getQuery(event)
  const productId =
    typeof query.productId === 'string' && query.productId.trim() !== '' ? query.productId.trim() : undefined

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const orgProducts = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.organizationId, organizationId))
  const orgProductIds = orgProducts.map((p) => p.id)

  const tenants = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.organizationId, organizationId))

  const products = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.organizationId, organizationId))

  const plans = orgProductIds.length
    ? await db
        .select({ id: plansTable.id, productId: plansTable.productId })
        .from(plansTable)
        .where(inArray(plansTable.productId, orgProductIds))
    : []
  const planAssignments = plans.length
    ? await db
        .select({ planId: planFeaturesTable.planId, featureId: planFeaturesTable.featureId })
        .from(planFeaturesTable)
        .where(inArray(planFeaturesTable.planId, plans.map((p) => p.id)))
    : []

  const planIdsByProductId = new Map<string, string[]>()
  for (const plan of plans) {
    const list = planIdsByProductId.get(plan.productId) ?? []
    list.push(plan.id)
    planIdsByProductId.set(plan.productId, list)
  }

  const planIdsByFeatureId = new Map<string, string[]>()
  for (const assignment of planAssignments) {
    const list = planIdsByFeatureId.get(assignment.featureId) ?? []
    list.push(assignment.planId)
    planIdsByFeatureId.set(assignment.featureId, list)
  }

  const productInOrg = productId ? orgProductIds.includes(productId) : true

  const flagRows =
    productId && !productInOrg
      ? []
      : productId
        ? await db
            .select()
            .from(runtimeFeatureFlagsTable)
            .where(eq(runtimeFeatureFlagsTable.productId, productId))
        : await db
            .select()
            .from(runtimeFeatureFlagsTable)
            .where(
              orgProductIds.length
                ? or(isNull(runtimeFeatureFlagsTable.productId), inArray(runtimeFeatureFlagsTable.productId, orgProductIds))
                : isNull(runtimeFeatureFlagsTable.productId),
            )

  const features =
    productId && !productInOrg
      ? []
      : productId
    ? await db
        .select({ id: featuresTable.id, name: featuresTable.name, featureKey: featuresTable.featureKey })
        .from(featuresTable)
        .where(eq(featuresTable.productId, productId))
    : orgProductIds.length
      ? await db
          .select({ id: featuresTable.id, name: featuresTable.name, featureKey: featuresTable.featureKey })
          .from(featuresTable)
          .where(or(isNull(featuresTable.productId), inArray(featuresTable.productId, orgProductIds)))
      : await db
          .select({ id: featuresTable.id, name: featuresTable.name, featureKey: featuresTable.featureKey })
          .from(featuresTable)
          .where(isNull(featuresTable.productId))

  const flags = flagRows

  const productName = (id: string | null) => {
    if (!id) return null
    return products.find((p) => p.id === id)?.name ?? null
  }

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? null

  const featureMeta = (id: string | null) => {
    if (!id) return null
    const f = features.find((x) => x.id === id)
    if (!f) return null
    return { name: f.name, key: f.featureKey }
  }

  const planIdsForFeature = (featureId: string | null) => {
    if (!featureId) return []
    return [...new Set(planIdsByFeatureId.get(featureId) ?? [])]
  }

  const planIdsForProduct = (productId: string | null) => {
    if (!productId) return []
    return [...new Set(planIdsByProductId.get(productId) ?? [])]
  }

  const list = flags.map((row) =>
    toRuntimeFlagListItem(row, { productName, featureMeta, tenantName, planIdsForFeature, planIdsForProduct }),
  )

  return {
    flags: list,
    lookups: {
      products: products.map((p) => ({ id: p.id, name: p.name })),
      tenants: tenants.map((t) => ({ id: t.id, name: t.name })),
      features: features.map((f) => ({ id: f.id, name: f.name, featureKey: f.featureKey })),
    },
  }
})
