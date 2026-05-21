import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { planAddonsTable, planFeaturesTable, planLimitsTable, plansTable } from '../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { newPlanId, newPlanLimitId } from '../../../utils/planIds'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const sourceId = getRouterParam(event, 'id')

  if (!sourceId) {
    throw createError({ statusCode: 400, statusMessage: 'Plan id is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [source] = await db.select().from(plansTable).where(eq(plansTable.id, sourceId))

  if (!source) {
    throw createError({ statusCode: 404, statusMessage: 'Plan not found' })
  }

  const newId = newPlanId()
  let slug = `${source.slug}-copy`
  const clash = await db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.slug, slug))
  if (clash.length) {
    slug = `${source.slug}-copy-${newId.slice(-6)}`
  }

  const now = new Date().toISOString()

  await db.insert(plansTable).values({
    id: newId,
    productId: source.productId,
    slug,
    name: `${source.name} (copy)`,
    edition: source.edition,
    billingCycle: source.billingCycle,
    priceCents: source.priceCents,
    currency: source.currency,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    trialSupported: source.trialSupported,
    visibility: source.visibility,
    isDefault: false,
    isRecommended: false,
    metadataJson: source.metadataJson,
  })

  const links = await db.select().from(planFeaturesTable).where(eq(planFeaturesTable.planId, sourceId))
  if (links.length) {
    await db.insert(planFeaturesTable).values(
      links.map((link) => ({
        planId: newId,
        featureId: link.featureId,
        enabled: link.enabled,
      })),
    )
  }

  const limits = await db.select().from(planLimitsTable).where(eq(planLimitsTable.planId, sourceId))
  if (limits.length) {
    await db.insert(planLimitsTable).values(
      limits.map((limit) => ({
        id: newPlanLimitId(),
        planId: newId,
        limitKey: limit.limitKey,
        limitValue: limit.limitValue,
        resetPeriod: limit.resetPeriod,
        limitUnit: limit.limitUnit,
        enforcement: limit.enforcement,
        notes: limit.notes,
        valueKind: limit.valueKind,
      })),
    )
  }

  const addons = await db.select().from(planAddonsTable).where(eq(planAddonsTable.planId, sourceId))
  if (addons.length) {
    await db.insert(planAddonsTable).values(
      addons.map((row) => ({
        planId: newId,
        addonKey: row.addonKey,
      })),
    )
  }

  return { id: newId, slug }
})
