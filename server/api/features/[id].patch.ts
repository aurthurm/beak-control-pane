import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/libsql'
import { and, eq } from 'drizzle-orm'
import { auditLogsTable, featuresTable, planFeaturesTable, productsTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import {
  FEATURE_STATUSES,
  FEATURE_TYPES,
  FEATURE_VISIBILITY,
  featureKeyFromInput,
} from '../../utils/features'
import { getStaffOrganizationId } from '../../utils/organizations'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

type PlanAssign = { planId: string; enabled: boolean }

type Body = {
  name?: string
  featureKey?: string
  description?: string
  category?: string
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

  const id = event.context.params?.id?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Feature id required' })
  }

  const body = await readBody<Body>(event)
  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const [existing] = await db.select().from(featuresTable).where(eq(featuresTable.id, id))
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Feature not found' })
  }

  const updates: Partial<typeof featuresTable.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name cannot be empty' })
    }
    updates.name = name
  }

  if (body.description !== undefined) {
    updates.description = body.description.trim()
  }

  if (body.category !== undefined) {
    const category = body.category.trim()
    if (!category) {
      throw createError({ statusCode: 400, statusMessage: 'Category cannot be empty' })
    }
    updates.category = category
  }

  if (body.productId !== undefined) {
    let productId: string | null = body.productId?.trim() || null
    if (productId) {
      const [product] = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(and(eq(productsTable.id, productId), eq(productsTable.organizationId, organizationId)))
      if (!product) {
        throw createError({ statusCode: 400, statusMessage: 'Unknown product' })
      }
    }
    updates.productId = productId
  }

  if (body.featureKey !== undefined) {
    const featureKey = featureKeyFromInput(body.featureKey.trim() || existing.featureKey)
    if (!featureKey) {
      throw createError({ statusCode: 400, statusMessage: 'Feature key cannot be empty' })
    }
    if (featureKey !== existing.featureKey) {
      const [clash] = await db
        .select({ id: featuresTable.id })
        .from(featuresTable)
        .where(eq(featuresTable.featureKey, featureKey))
      if (clash && clash.id !== id) {
        throw createError({ statusCode: 409, statusMessage: 'A feature with this key already exists' })
      }
    }
    updates.featureKey = featureKey
  }

  if (body.featureType !== undefined) {
    const featureType = body.featureType.trim().toLowerCase()
    if (!FEATURE_TYPES.includes(featureType as (typeof FEATURE_TYPES)[number])) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid feature type' })
    }
    updates.featureType = featureType
  }

  if (body.isBillable !== undefined) {
    updates.isBillable = body.isBillable
  }

  if (body.defaultEnabled !== undefined) {
    updates.defaultEnabled = body.defaultEnabled
  }

  if (body.status !== undefined) {
    const status = body.status.trim().toLowerCase()
    if (!FEATURE_STATUSES.includes(status as (typeof FEATURE_STATUSES)[number])) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
    }
    updates.status = status
  }

  if (body.visibility !== undefined) {
    const visibility = body.visibility.trim().toLowerCase()
    if (!FEATURE_VISIBILITY.includes(visibility as (typeof FEATURE_VISIBILITY)[number])) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid visibility' })
    }
    updates.visibility = visibility
  }

  if (body.visibilityRules !== undefined) {
    updates.visibilityRulesJson = JSON.stringify(body.visibilityRules ?? {})
  }

  if (body.dependencies !== undefined) {
    updates.dependenciesJson = JSON.stringify(body.dependencies ?? [])
  }

  if (body.mutuallyExclusive !== undefined) {
    updates.mutuallyExclusiveJson = JSON.stringify(body.mutuallyExclusive ?? [])
  }

  if (body.tags !== undefined) {
    updates.tagsJson = JSON.stringify(body.tags ?? [])
  }

  await db.update(featuresTable).set(updates).where(eq(featuresTable.id, id))

  if (body.planAssignments !== undefined) {
    await db.delete(planFeaturesTable).where(eq(planFeaturesTable.featureId, id))
    for (const row of body.planAssignments) {
      if (row.enabled) {
        await db.insert(planFeaturesTable).values({ planId: row.planId, featureId: id, enabled: true })
      }
    }
  }

  const [next] = await db.select().from(featuresTable).where(eq(featuresTable.id, id))

  await db.insert(auditLogsTable).values({
    id: `aud_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    subscriberId: null,
    actor: 'console',
    action: 'catalog.feature_updated',
    resourceType: 'feature',
    resourceId: id,
    resourceName: next?.name ?? existing.name,
    source: 'api',
    result: 'success',
    detailsJson: JSON.stringify({
      featureId: id,
      featureKey: next?.featureKey ?? existing.featureKey,
      summary: 'Feature updated from catalog.',
      changedFields: Object.keys(body).filter((k) => k !== 'planAssignments'),
    }),
    createdAt: new Date().toISOString(),
  })

  return { ok: true, id }
})
