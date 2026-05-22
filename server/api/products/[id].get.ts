import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import {
  activationsTable,
  entitlementsTable,
  featuresTable,
  licensesTable,
  planFeaturesTable,
  planAddonsTable,
  planLimitsTable,
  plansTable,
  productAddonKeysTable,
  productLimitKeysTable,
  productsTable,
  subscriptionsTable,
  subscribersTable,
} from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { activationCountsTowardCap } from '../../utils/activations'
import { getProductByIdOrSlug } from '../../utils/productLookup'
import { parsePlanMetadata } from '../../utils/planMetadata'
import {
  defaultBillingModeLabel,
  isSubscriptionBillingActive,
  monthlyNormalizedMrr,
  productTypeLabel,
  subscriberIdsForProduct,
} from '../../utils/products'
import { getStaffOrganizationId } from '../../utils/organizations'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

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

  const raw = event.context.params?.id?.trim()
  if (!raw) {
    throw createError({ statusCode: 400, statusMessage: 'Product id or slug required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const product = await getProductByIdOrSlug(db, raw, organizationId)
  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }

  const id = product.id

  const orgTenants = await db
    .select()
    .from(subscribersTable)
    .where(eq(subscribersTable.organizationId, organizationId))
  const subscriberIds = orgTenants.map((t) => t.id)

  const plans = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.productId, id))
    .orderBy(desc(plansTable.createdAt))
  const planIdsForProduct = plans.map((p) => p.id)

  const subscriptions =
    planIdsForProduct.length && subscriberIds.length
      ? await db
          .select()
          .from(subscriptionsTable)
          .where(
            and(
              inArray(subscriptionsTable.planId, planIdsForProduct),
              inArray(subscriptionsTable.subscriberId, subscriberIds),
            ),
          )
      : []

  const entitlements =
    subscriberIds.length
      ? await db
          .select({ subscriberId: entitlementsTable.subscriberId, productId: entitlementsTable.productId })
          .from(entitlementsTable)
          .where(and(eq(entitlementsTable.productId, id), inArray(entitlementsTable.subscriberId, subscriberIds)))
      : []

  const licenses =
    subscriberIds.length
      ? await db
          .select()
          .from(licensesTable)
          .where(
            and(eq(licensesTable.productId, id), inArray(licensesTable.subscriberId, subscriberIds)),
          )
      : []

  const tenants = orgTenants

  const planFeatureLinks = planIdsForProduct.length
    ? await db.select().from(planFeaturesTable).where(inArray(planFeaturesTable.planId, planIdsForProduct))
    : []

  const features = await db
    .select()
    .from(featuresTable)
    .where(and(eq(featuresTable.productId, id)))

  const planLimits = planIdsForProduct.length
    ? await db.select().from(planLimitsTable).where(inArray(planLimitsTable.planId, planIdsForProduct))
    : []

  const planAddonLinks = planIdsForProduct.length
    ? await db.select().from(planAddonsTable).where(inArray(planAddonsTable.planId, planIdsForProduct))
    : []

  const productLimitKeysRows = await db
    .select()
    .from(productLimitKeysTable)
    .where(eq(productLimitKeysTable.productId, id))
    .orderBy(asc(productLimitKeysTable.limitKey))

  const productAddonKeysRows = await db
    .select()
    .from(productAddonKeysTable)
    .where(eq(productAddonKeysTable.productId, id))
    .orderBy(asc(productAddonKeysTable.addonKey))

  const licenseIdListForActivations = licenses.map((l) => l.id)
  const activations = licenseIdListForActivations.length
    ? await db
        .select()
        .from(activationsTable)
        .where(inArray(activationsTable.licenseId, licenseIdListForActivations))
    : []

  const planIds = new Set(plans.map((p) => p.id))
  const tenantSet = subscriberIdsForProduct(
    id,
    planIds,
    subscriptions,
    entitlements,
    licenses.map((l) => ({ subscriberId: l.subscriberId, productId: l.productId })),
  )

  const licenseIds = new Set(licenses.map((l) => l.id))

  const planLimitsForProduct = planLimits.filter((l) => planIds.has(l.planId))
  const planAddonsForProduct = planAddonLinks.filter((r) => planIds.has(r.planId))

  const enabledFeatureIdsByPlan: Record<string, string[]> = {}
  const catalogPlans = plans.map((plan) => {
    const meta = parsePlanMetadata(plan.metadataJson)
    const limitsForPlan = planLimitsForProduct
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

    const limitsForSummary: PlanLimitForSummary[] = limitsForPlan.map((l) => ({
      limitKey: l.limitKey,
      limitValue: l.limitValue,
      resetPeriod: l.resetPeriod,
      limitUnit: l.limitUnit,
      valueKind: l.valueKind,
      enforcement: l.enforcement,
    }))

    const enabledLinks = planFeatureLinks.filter((link) => link.planId === plan.id && link.enabled)
    const includedFeatureIds = enabledLinks.map((l) => l.featureId)
    enabledFeatureIdsByPlan[plan.id] = includedFeatureIds

    const updatedAt =
      plan.updatedAt && String(plan.updatedAt).trim() !== '' ? plan.updatedAt : plan.createdAt

    return {
      id: plan.id,
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
      limitsSummary: buildLimitsSummary(limitsForSummary),
      enabledFeatureCount: enabledLinks.length,
      includedFeatureIds,
      billingMappings: meta.billingMappings ?? {},
      trialSettings: meta.trial ?? { days: 0, requiresPaymentMethod: false },
      gracePeriodDays: meta.gracePeriodDays ?? 0,
      enterpriseOverrideCompatible: Boolean(meta.enterpriseOverrideCompatible),
    }
  })

  const featureIdsTouched = new Set<string>()
  for (const link of planFeatureLinks) {
    if (planIds.has(link.planId)) {
      featureIdsTouched.add(link.featureId)
    }
  }

  const catalogFeatures = features
    .filter((f) => f.productId === id || featureIdsTouched.has(f.id))
    .sort((a, b) => {
      const c = a.category.localeCompare(b.category)
      if (c !== 0) return c
      return a.name.localeCompare(b.name)
    })
    .map((f) => ({
      id: f.id,
      productId: f.productId,
      featureKey: f.featureKey,
      name: f.name,
      description: f.description,
      category: f.category,
      featureType: f.featureType,
      status: f.status,
      visibility: f.visibility,
      isBillable: Boolean(f.isBillable),
      defaultEnabled: Boolean(f.defaultEnabled),
    }))

  const limitDefinitions = productLimitKeysRows.map((r) => ({
    id: r.id,
    limitKey: r.limitKey,
    resetPeriod: r.resetPeriod,
    limitUnit: r.limitUnit ?? '',
    valueKind: (r.valueKind === 'boolean' ? 'boolean' : 'number') as 'number' | 'boolean',
    enforcement: (r.enforcement === 'soft' ? 'soft' : 'hard') as 'hard' | 'soft',
    notes: r.notes ?? '',
  }))

  const limitCellsByPlan: Record<
    string,
    Record<
      string,
      | {
          id: string
          limitValue: number
          resetPeriod: string
          limitUnit: string
          enforcement: 'hard' | 'soft'
          notes: string
          valueKind: 'number' | 'boolean'
        }
      | null
    >
  > = {}
  for (const plan of plans) {
    const cells: Record<
      string,
      | {
          id: string
          limitValue: number
          resetPeriod: string
          limitUnit: string
          enforcement: 'hard' | 'soft'
          notes: string
          valueKind: 'number' | 'boolean'
        }
      | null
    > = (limitCellsByPlan[plan.id] = {})
    for (const def of limitDefinitions) {
      const match = planLimitsForProduct.find((l) => l.planId === plan.id && l.limitKey === def.limitKey)
      cells[def.limitKey] = match
        ? {
            id: match.id,
            limitValue: match.limitValue,
            resetPeriod: match.resetPeriod,
            limitUnit: match.limitUnit ?? '',
            enforcement: (match.enforcement === 'soft' ? 'soft' : 'hard') as 'hard' | 'soft',
            notes: match.notes ?? '',
            valueKind: (match.valueKind === 'boolean' ? 'boolean' : 'number') as 'number' | 'boolean',
          }
        : null
    }
  }

  const addonDefinitions = productAddonKeysRows.map((r) => ({
    id: r.id,
    addonKey: r.addonKey,
    displayName: (r.displayName ?? '').trim() || r.addonKey,
    notes: r.notes ?? '',
  }))

  const enabledAddonKeysByPlan: Record<string, string[]> = {}
  for (const plan of plans) {
    enabledAddonKeysByPlan[plan.id] = planAddonsForProduct
      .filter((row) => row.planId === plan.id)
      .map((row) => row.addonKey)
  }

  const subsForProduct = subscriptions.filter((s) => planIds.has(s.planId))

  const activeSubs = subsForProduct.filter((s) => isSubscriptionBillingActive(s.status))
  const trialingSubs = subsForProduct.filter((s) => s.status.toLowerCase() === 'trialing')

  const planById = new Map(plans.map((p) => [p.id, p]))
  let mrrCents = 0
  for (const sub of activeSubs) {
    const plan = planById.get(sub.planId)
    if (plan) {
      mrrCents += monthlyNormalizedMrr(plan.priceCents, plan.billingCycle)
    }
  }

  const licensesByStatus = new Map<string, number>()
  for (const lic of licenses) {
    const st = lic.status.toLowerCase()
    licensesByStatus.set(st, (licensesByStatus.get(st) ?? 0) + 1)
  }

  const activationCount = activations.filter(
    (a) => licenseIds.has(a.licenseId) && activationCountsTowardCap(a.status),
  ).length

  return {
    summary: {
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
      planCount: plans.length,
      subscriberCount: tenantSet.size,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    },
    catalog: {
      plans: catalogPlans,
      features: catalogFeatures,
      enabledFeatureIdsByPlan,
      limitDefinitions,
      limitCellsByPlan,
      addonDefinitions,
      enabledAddonKeysByPlan,
    },
    subscriptionStats: {
      totalSubscriptions: subsForProduct.length,
      activeSubscriptions: activeSubs.length,
      trialingSubscriptions: trialingSubs.length,
      mrrCents,
      licensesTotal: licenses.length,
      licensesByStatus: Object.fromEntries(licensesByStatus),
      activeActivations: activationCount,
    },
  }
})
