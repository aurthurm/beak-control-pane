import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/libsql'
import { and, eq } from 'drizzle-orm'
import { auditLogsTable, featuresTable, planFeaturesTable, productsTable } from '../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import {
  FEATURE_STATUSES,
  FEATURE_TYPES,
  FEATURE_VISIBILITY,
  featureKeyFromInput,
} from '../utils/features'
import { getStaffOrganizationId } from '../utils/organizations'
import { requireStaffApiWhenEnforced } from '../utils/auth-guards'

type PlanAssign = { planId: string; enabled: boolean }

type Body = {
  name: string
  featureKey?: string
  description?: string
  category: string
  productId?: string | null
  featureType?: string
  isBillable?: boolean
  defaultEnabled?: boolean
  status?: string
  visibility?: string
  visibilityRules?: Record<string, unknown>
  dependencies?: string[]
  mutuallyExclusive?: string[]
  tags?: string[]
  planAssignments?: PlanAssign[]
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const body = await readBody<Body>(event)
  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const name = body.name?.trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const category = body.category?.trim()
  if (!category) {
    throw createError({ statusCode: 400, statusMessage: 'Category is required' })
  }

  const keySource = body.featureKey?.trim() || name
  const featureKey = featureKeyFromInput(keySource)
  if (!featureKey) {
    throw createError({ statusCode: 400, statusMessage: 'Feature key is required' })
  }

  let productId: string | null = body.productId === undefined ? null : body.productId?.trim() || null
  if (productId) {
    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.organizationId, organizationId)))
    if (!product) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown product' })
    }
  }

  const featureType = (body.featureType ?? 'module').trim().toLowerCase()
  if (!FEATURE_TYPES.includes(featureType as (typeof FEATURE_TYPES)[number])) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid feature type' })
  }

  const status = (body.status ?? 'active').trim().toLowerCase()
  if (!FEATURE_STATUSES.includes(status as (typeof FEATURE_STATUSES)[number])) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
  }

  const visibility = (body.visibility ?? 'public').trim().toLowerCase()
  if (!FEATURE_VISIBILITY.includes(visibility as (typeof FEATURE_VISIBILITY)[number])) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid visibility' })
  }

  const id = `feat_${randomUUID().replace(/-/g, '').slice(0, 10)}`
  const now = new Date().toISOString()

  try {
    await db.insert(featuresTable).values({
      id,
      featureKey,
      name,
      description: body.description?.trim() ?? '',
      category,
      productId,
      featureType,
      isBillable: body.isBillable ?? true,
      defaultEnabled: body.defaultEnabled ?? true,
      status,
      visibility,
      visibilityRulesJson: JSON.stringify(body.visibilityRules ?? {}),
      dependenciesJson: JSON.stringify(body.dependencies ?? []),
      mutuallyExclusiveJson: JSON.stringify(body.mutuallyExclusive ?? []),
      tagsJson: JSON.stringify(body.tags ?? []),
      updatedAt: now,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/unique|UNIQUE/i.test(message)) {
      throw createError({ statusCode: 409, statusMessage: 'A feature with this key already exists' })
    }
    throw error
  }

  for (const row of body.planAssignments ?? []) {
    if (row.enabled) {
      await db.insert(planFeaturesTable).values({ planId: row.planId, featureId: id, enabled: true })
    }
  }

  await db.insert(auditLogsTable).values({
    id: `aud_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    tenantId: null,
    actor: 'console',
    action: 'catalog.feature_created',
    resourceType: 'feature',
    resourceId: id,
    resourceName: name,
    source: 'api',
    result: 'success',
    detailsJson: JSON.stringify({ featureId: id, featureKey, summary: 'Feature created from catalog.' }),
    createdAt: now,
  })

  return { ok: true, id }
})
