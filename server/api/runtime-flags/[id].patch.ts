import { drizzle } from 'drizzle-orm/libsql'
import { and, eq, inArray } from 'drizzle-orm'
import { featuresTable, plansTable, productsTable, runtimeFeatureFlagsTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { slugifyKey } from '../../utils/products'
import {
  RUNTIME_FLAG_SCOPES,
  RUNTIME_FLAG_STATUSES,
  RUNTIME_FLAG_STRATEGIES,
  RUNTIME_FLAG_TYPES,
} from '../../utils/runtime-flags'
import { getStaffOrganizationId } from '../../utils/organizations'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

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
  evaluationHistory?: Array<{
    at: string
    tenantId?: string | null
    environment?: string | null
    result: string
    reason: string
  }>
  expiresAt?: string | null
  archivedAt?: string | null
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const body = await readBody<Body>(event)
  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const [existing] = await db.select().from(runtimeFeatureFlagsTable).where(eq(runtimeFeatureFlagsTable.id, id))
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Flag not found' })
  }

  const orgProductIds = (
    await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.organizationId, organizationId))
  ).map((p) => p.id)

  if (existing.productId && !orgProductIds.includes(existing.productId)) {
    throw createError({ statusCode: 404, statusMessage: 'Flag not found' })
  }

  const patch: Partial<typeof runtimeFeatureFlagsTable.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name cannot be empty' })
    }
    patch.name = name
  }

  if (body.key !== undefined) {
    const nextKey = slugifyKey(body.key.trim())
    if (!nextKey) {
      throw createError({ statusCode: 400, statusMessage: 'Key cannot be empty' })
    }
    if (nextKey !== existing.flagKey) {
      const [clash] = await db
        .select({ id: runtimeFeatureFlagsTable.id })
        .from(runtimeFeatureFlagsTable)
        .where(eq(runtimeFeatureFlagsTable.flagKey, nextKey))
      if (clash && clash.id !== id) {
        throw createError({ statusCode: 409, statusMessage: 'A flag with this key already exists' })
      }
    }
    patch.flagKey = nextKey
  }

  if (body.description !== undefined) {
    patch.description = body.description.trim()
  }

  if (body.productId !== undefined) {
    let productId = body.productId?.trim() || null
    if (productId) {
      const [p] = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(and(eq(productsTable.id, productId), eq(productsTable.organizationId, organizationId)))
      if (!p) {
        throw createError({ statusCode: 400, statusMessage: 'Unknown product' })
      }
    }
    patch.productId = productId
  }

  if (body.linkedFeatureId !== undefined) {
    let linkedFeatureId = body.linkedFeatureId?.trim() || null
    if (linkedFeatureId) {
      const [f] = await db
        .select({ id: featuresTable.id })
        .from(featuresTable)
        .where(eq(featuresTable.id, linkedFeatureId))
      if (!f) {
        throw createError({ statusCode: 400, statusMessage: 'Unknown linked feature' })
      }
    }
    patch.linkedFeatureId = linkedFeatureId
  }

  if (body.flagType !== undefined) {
    const flagType = body.flagType.trim().toLowerCase() as (typeof RUNTIME_FLAG_TYPES)[number]
    if (!RUNTIME_FLAG_TYPES.includes(flagType)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid flag type' })
    }
    patch.flagType = flagType
  }

  if (body.status !== undefined) {
    const status = body.status.trim().toLowerCase() as (typeof RUNTIME_FLAG_STATUSES)[number]
    if (!RUNTIME_FLAG_STATUSES.includes(status)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
    }
    patch.status = status
    if (status === 'archived' && !body.archivedAt) {
      patch.archivedAt = new Date().toISOString()
    }
  }

  if (body.scope !== undefined) {
    const scope = body.scope.trim().toLowerCase() as (typeof RUNTIME_FLAG_SCOPES)[number]
    if (!RUNTIME_FLAG_SCOPES.includes(scope)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid scope' })
    }
    patch.scope = scope
  }

  if (body.defaultValue !== undefined) {
    patch.defaultValue = body.defaultValue.trim()
  }

  if (body.rolloutStrategy !== undefined) {
    const rolloutStrategy = body.rolloutStrategy.trim().toLowerCase() as (typeof RUNTIME_FLAG_STRATEGIES)[number]
    if (!RUNTIME_FLAG_STRATEGIES.includes(rolloutStrategy)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid rollout strategy' })
    }
    patch.rolloutStrategy = rolloutStrategy
  }

  if (body.rolloutPercent !== undefined) {
    let rolloutPercent = Math.min(100, Math.max(0, Math.round(Number(body.rolloutPercent))))
    if (Number.isNaN(rolloutPercent)) rolloutPercent = existing.rolloutPercent
    patch.rolloutPercent = rolloutPercent
  }

  if (body.globallyEnabled !== undefined) {
    patch.globallyEnabled = Boolean(body.globallyEnabled)
  }

  if (body.rules !== undefined) {
    if (typeof body.rules !== 'object' || body.rules === null) {
      throw createError({ statusCode: 400, statusMessage: 'rules must be an object' })
    }
    patch.rulesJson = JSON.stringify(body.rules)
  }

  if (body.targetTenantIds !== undefined) {
    const ids = Array.isArray(body.targetTenantIds) ? body.targetTenantIds.filter(Boolean) : []
    patch.targetTenantIdsJson = JSON.stringify(ids)
  }

  if (body.environmentValues !== undefined) {
    if (typeof body.environmentValues !== 'object' || body.environmentValues === null) {
      throw createError({ statusCode: 400, statusMessage: 'environmentValues must be an object' })
    }
    patch.environmentValuesJson = JSON.stringify(body.environmentValues)
  }

  if (body.planIds !== undefined) {
    const planIds = [...new Set(body.planIds.map((id) => String(id).trim()).filter(Boolean))]
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
      if (patch.productId && planProductIds[0] !== patch.productId) {
        throw createError({ statusCode: 400, statusMessage: 'Selected plans do not belong to this product' })
      }
      if (!patch.productId) {
        patch.productId = planProductIds[0] ?? existing.productId
      }
    }
    patch.planAssignmentsJson = JSON.stringify(planIds)
  }

  if (body.evaluationHistory !== undefined) {
    if (!Array.isArray(body.evaluationHistory)) {
      throw createError({ statusCode: 400, statusMessage: 'evaluationHistory must be an array' })
    }
    const normalized = body.evaluationHistory.map((e) => ({
      at: e.at,
      tenantId: e.tenantId ?? null,
      environment: e.environment ?? null,
      result: e.result,
      reason: e.reason,
    }))
    patch.evaluationHistoryJson = JSON.stringify(normalized)
  }

  if (body.expiresAt !== undefined) {
    patch.expiresAt = body.expiresAt?.trim() ?? ''
  }

  if (body.archivedAt !== undefined) {
    patch.archivedAt = body.archivedAt?.trim() ?? ''
  }

  await db.update(runtimeFeatureFlagsTable).set(patch).where(eq(runtimeFeatureFlagsTable.id, id))

  return { ok: true }
})
