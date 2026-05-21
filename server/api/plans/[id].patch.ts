import { and, eq, ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { planFeaturesTable, planLimitsTable, plansTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { slugifyKey } from '../../utils/products'
import { stringifyPlanMetadata, type PlanMetadata } from '../../utils/planMetadata'
import { newPlanLimitId } from '../../utils/planIds'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

type LimitInput = {
  id?: string
  limitKey: string
  limitValue: number
  resetPeriod: string
  limitUnit?: string
  enforcement?: 'hard' | 'soft'
  notes?: string
  valueKind?: 'number' | 'boolean'
}

type PatchPlanBody = {
  name?: string
  slug?: string
  edition?: string
  billingCycle?: string
  priceCents?: number
  currency?: string
  status?: string
  trialSupported?: boolean
  visibility?: string
  isDefault?: boolean
  isRecommended?: boolean
  metadata?: PlanMetadata
  enabledFeatureIds?: string[]
  limits?: LimitInput[]
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Plan id is required' })
  }

  const body = await readBody<PatchPlanBody>(event)
  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [existing] = await db.select().from(plansTable).where(eq(plansTable.id, id))

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Plan not found' })
  }

  if (body.slug?.trim()) {
    const nextSlug = slugifyKey(body.slug)
    const clash = await db
      .select({ id: plansTable.id })
      .from(plansTable)
      .where(and(eq(plansTable.slug, nextSlug), ne(plansTable.id, id)))

    if (clash.length) {
      throw createError({ statusCode: 409, statusMessage: 'Slug already in use' })
    }
  }

  if (body.isDefault) {
    await db.update(plansTable).set({ isDefault: false }).where(eq(plansTable.productId, existing.productId))
  }

  const now = new Date().toISOString()
  const patch: Partial<typeof plansTable.$inferInsert> = { updatedAt: now }

  if (body.name !== undefined) {
    patch.name = body.name.trim()
  }

  if (body.slug !== undefined && body.slug.trim()) {
    patch.slug = slugifyKey(body.slug)
  }

  if (body.edition !== undefined) {
    patch.edition = body.edition.trim()
  }

  if (body.billingCycle !== undefined) {
    patch.billingCycle = body.billingCycle.trim()
  }

  if (body.priceCents !== undefined) {
    patch.priceCents = Math.max(0, Math.round(body.priceCents))
  }

  if (body.currency !== undefined) {
    patch.currency = body.currency.trim() || 'USD'
  }

  if (body.status !== undefined) {
    patch.status = body.status.trim()
  }

  if (body.trialSupported !== undefined) {
    patch.trialSupported = body.trialSupported
  }

  if (body.visibility !== undefined) {
    patch.visibility = body.visibility.trim() || 'public'
  }

  if (body.isDefault !== undefined) {
    patch.isDefault = body.isDefault
  }

  if (body.isRecommended !== undefined) {
    patch.isRecommended = body.isRecommended
  }

  if (body.metadata !== undefined) {
    patch.metadataJson = stringifyPlanMetadata(body.metadata)
  }

  await db.update(plansTable).set(patch).where(eq(plansTable.id, id))

  if (body.enabledFeatureIds) {
    await db.delete(planFeaturesTable).where(eq(planFeaturesTable.planId, id))
    const unique = [...new Set(body.enabledFeatureIds)]
    if (unique.length) {
      await db.insert(planFeaturesTable).values(
        unique.map((featureId) => ({
          planId: id,
          featureId,
          enabled: true,
        })),
      )
    }
  }

  if (body.limits) {
    await db.delete(planLimitsTable).where(eq(planLimitsTable.planId, id))
    if (body.limits.length) {
      await db.insert(planLimitsTable).values(
        body.limits.map((limit) => ({
          id: limit.id && limit.id.trim() ? limit.id : newPlanLimitId(),
          planId: id,
          limitKey: limit.limitKey.trim(),
          limitValue: Math.round(limit.limitValue),
          resetPeriod: (limit.resetPeriod ?? 'none').trim() || 'none',
          limitUnit: (limit.limitUnit ?? '').trim(),
          enforcement: limit.enforcement === 'soft' ? 'soft' : 'hard',
          notes: (limit.notes ?? '').trim(),
          valueKind: limit.valueKind === 'boolean' ? 'boolean' : 'number',
        })),
      )
    }
  }

  return { ok: true, id }
})
