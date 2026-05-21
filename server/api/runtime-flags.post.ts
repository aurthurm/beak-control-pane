import { drizzle } from 'drizzle-orm/libsql'
import { and, eq, inArray } from 'drizzle-orm'
import { featuresTable, planFeaturesTable, plansTable, productsTable, runtimeFeatureFlagsTable } from '../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import { slugifyKey } from '../utils/products'
import {
  newRuntimeFlagId,
  RUNTIME_FLAG_SCOPES,
  RUNTIME_FLAG_STATUSES,
  RUNTIME_FLAG_STRATEGIES,
  RUNTIME_FLAG_TYPES,
} from '../utils/runtime-flags'
import { getStaffOrganizationId } from '../utils/organizations'
import { requireStaffApiWhenEnforced } from '../utils/auth-guards'

type Body = {
  name?: string
  key?: string
  description?: string
  productId?: string | null
  linkedFeatureId?: string | null
  flagType?: string
  status?: string
  scope?: string
  defaultValue?: string
  rolloutStrategy?: string
  rolloutPercent?: number
  globallyEnabled?: boolean
  rules?: Record<string, unknown>
  targetTenantIds?: string[]
  environmentValues?: Record<string, string | number | boolean>
  planIds?: string[]
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const body = await readBody<Body>(event)
  const name = body.name?.trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const flagKey = slugifyKey(body.key?.trim() || name)
  const flagType = (body.flagType?.trim().toLowerCase() ?? 'release') as (typeof RUNTIME_FLAG_TYPES)[number]
  const status = (body.status?.trim().toLowerCase() ?? 'active') as (typeof RUNTIME_FLAG_STATUSES)[number]
  const scope = (body.scope?.trim().toLowerCase() ?? 'global') as (typeof RUNTIME_FLAG_SCOPES)[number]
  const rolloutStrategy = (body.rolloutStrategy?.trim().toLowerCase() ??
    'full_rollout') as (typeof RUNTIME_FLAG_STRATEGIES)[number]

  if (!RUNTIME_FLAG_TYPES.includes(flagType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid flag type' })
  }
  if (!RUNTIME_FLAG_STATUSES.includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
  }
  if (!RUNTIME_FLAG_SCOPES.includes(scope)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid scope' })
  }
  if (!RUNTIME_FLAG_STRATEGIES.includes(rolloutStrategy)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid rollout strategy' })
  }

  let rolloutPercent = Math.min(100, Math.max(0, Math.round(Number(body.rolloutPercent ?? 100))))
  if (Number.isNaN(rolloutPercent)) rolloutPercent = 100

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const [keyClash] = await db
    .select({ id: runtimeFeatureFlagsTable.id })
    .from(runtimeFeatureFlagsTable)
    .where(eq(runtimeFeatureFlagsTable.flagKey, flagKey))
  if (keyClash) {
    throw createError({ statusCode: 409, statusMessage: 'A flag with this key already exists' })
  }

  let productId: string | null = body.productId?.trim() || null
  if (productId) {
    const [p] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.organizationId, organizationId)))
    if (!p) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown product' })
    }
  }

  let linkedFeatureId: string | null = body.linkedFeatureId?.trim() || null
  if (linkedFeatureId) {
    const [f] = await db.select({ id: featuresTable.id }).from(featuresTable).where(eq(featuresTable.id, linkedFeatureId))
    if (!f) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown linked feature' })
    }
  }

  const requestedPlanIds = Array.isArray(body.planIds) ? [...new Set(body.planIds.map((id) => String(id).trim()).filter(Boolean))] : []
  let planIds = requestedPlanIds
  if (!planIds.length) {
    if (linkedFeatureId) {
      const coverage = await db
        .select({ planId: planFeaturesTable.planId })
        .from(planFeaturesTable)
        .where(eq(planFeaturesTable.featureId, linkedFeatureId))
      planIds = coverage.map((row) => row.planId)
    } else if (productId) {
      const productPlans = await db
        .select({ id: plansTable.id })
        .from(plansTable)
        .where(eq(plansTable.productId, productId))
      planIds = productPlans.map((row) => row.id)
    }
  }

  if (planIds.length) {
    const rows = await db
      .select({ id: plansTable.id, productId: plansTable.productId })
      .from(plansTable)
      .where(inArray(plansTable.id, planIds))
    if (rows.length !== planIds.length) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown plan selection' })
    }
    const planProductIds = [...new Set(rows.map((row) => row.productId))]
    if (planProductIds.length > 1) {
      throw createError({ statusCode: 400, statusMessage: 'Plan selection must stay within one product' })
    }
    if (productId && planProductIds[0] !== productId) {
      throw createError({ statusCode: 400, statusMessage: 'Selected plans do not belong to this product' })
    }
    if (!productId) {
      productId = planProductIds[0] ?? null
    }
  }

  const now = new Date().toISOString()
  const id = newRuntimeFlagId()

  const targetTenantIds = Array.isArray(body.targetTenantIds) ? body.targetTenantIds.filter(Boolean) : []
  const environmentValues =
    body.environmentValues && typeof body.environmentValues === 'object' ? body.environmentValues : {}
  const rules = body.rules && typeof body.rules === 'object' ? body.rules : {}

  await db.insert(runtimeFeatureFlagsTable).values({
    id,
    flagKey,
    name,
    description: body.description?.trim() ?? '',
    productId,
    linkedFeatureId,
    planAssignmentsJson: JSON.stringify(planIds),
    flagType,
    status,
    scope,
    defaultValue: body.defaultValue?.trim() ?? 'false',
    rolloutStrategy,
    rolloutPercent,
    globallyEnabled: body.globallyEnabled !== false,
    rulesJson: JSON.stringify(rules),
    targetTenantIdsJson: JSON.stringify(targetTenantIds),
    environmentValuesJson: JSON.stringify(environmentValues),
    evaluationHistoryJson: '[]',
    expiresAt: '',
    archivedAt: '',
    createdAt: now,
    updatedAt: now,
  })

  return { id, key: flagKey }
})
