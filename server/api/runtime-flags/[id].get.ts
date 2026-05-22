import { drizzle } from 'drizzle-orm/libsql'
import { eq, inArray, isNull, or } from 'drizzle-orm'
import { featuresTable, planFeaturesTable, plansTable, productsTable, runtimeFeatureFlagsTable, subscribersTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { toRuntimeFlagDetail } from '../../utils/runtime-flags'
import { getStaffOrganizationId } from '../../utils/organizations'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const orgProductRows = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.organizationId, organizationId))
  const orgProductIds = orgProductRows.map((p) => p.id)

  const [row] = await db.select().from(runtimeFeatureFlagsTable).where(eq(runtimeFeatureFlagsTable.id, id))
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Flag not found' })
  }

  if (row.productId && !orgProductIds.includes(row.productId)) {
    throw createError({ statusCode: 404, statusMessage: 'Flag not found' })
  }

  const [products, tenants, features] = await Promise.all([
    db
      .select({ id: productsTable.id, name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.organizationId, organizationId)),
    db
      .select({ id: subscribersTable.id, name: subscribersTable.name })
      .from(subscribersTable)
      .where(eq(subscribersTable.organizationId, organizationId)),
    orgProductIds.length
      ? db
          .select({ id: featuresTable.id, name: featuresTable.name, featureKey: featuresTable.featureKey })
          .from(featuresTable)
          .where(or(isNull(featuresTable.productId), inArray(featuresTable.productId, orgProductIds)))
      : db
          .select({ id: featuresTable.id, name: featuresTable.name, featureKey: featuresTable.featureKey })
      .from(featuresTable)
      .where(isNull(featuresTable.productId)),
  ])

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

  const productName = (pid: string | null) => {
    if (!pid) return null
    return products.find((p) => p.id === pid)?.name ?? null
  }

  const subscriberName = (tid: string) => tenants.find((t) => t.id === tid)?.name ?? null

  const featureMeta = (fid: string | null) => {
    if (!fid) return null
    const f = features.find((x) => x.id === fid)
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

  return {
    flag: toRuntimeFlagDetail(row, { productName, featureMeta, subscriberName, planIdsForFeature, planIdsForProduct }),
  }
})
