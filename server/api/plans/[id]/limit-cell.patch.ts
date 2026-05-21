import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { planLimitsTable, plansTable, productLimitKeysTable } from '../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { newPlanLimitId } from '../../../utils/planIds'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

type Body = {
  limitKey: string
  /** Omit or set null to remove the limit row for this plan. */
  limitValue?: number | null
  resetPeriod?: string
  limitUnit?: string
  enforcement?: 'hard' | 'soft'
  notes?: string
  valueKind?: 'number' | 'boolean'
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const planId = getRouterParam(event, 'id')?.trim()
  if (!planId) {
    throw createError({ statusCode: 400, statusMessage: 'Plan id is required' })
  }

  const body = await readBody<Body>(event)
  const limitKey = body.limitKey?.trim()
  if (!limitKey) {
    throw createError({ statusCode: 400, statusMessage: 'limitKey is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, planId))
  if (!plan) {
    throw createError({ statusCode: 404, statusMessage: 'Plan not found' })
  }

  const [def] = await db
    .select()
    .from(productLimitKeysTable)
    .where(and(eq(productLimitKeysTable.productId, plan.productId), eq(productLimitKeysTable.limitKey, limitKey)))

  if (!def) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unknown limit key for this product — add it under product limit definitions first',
    })
  }

  await db.delete(planLimitsTable).where(and(eq(planLimitsTable.planId, planId), eq(planLimitsTable.limitKey, limitKey)))

  if (body.limitValue === null || body.limitValue === undefined) {
    return { ok: true, planId, limitKey, cleared: true }
  }

  const valueKind = body.valueKind ?? (def.valueKind === 'boolean' ? 'boolean' : 'number')
  const limitValue =
    valueKind === 'boolean' ? (body.limitValue ? 1 : 0) : Math.round(Number(body.limitValue) || 0)

  const resetPeriod = (body.resetPeriod ?? def.resetPeriod).trim() || 'none'
  const limitUnit = (body.limitUnit ?? def.limitUnit ?? '').trim()
  const enforcementFinal =
    body.enforcement !== undefined
      ? body.enforcement === 'soft'
        ? 'soft'
        : 'hard'
      : def.enforcement === 'soft'
        ? 'soft'
        : 'hard'

  const notes = (body.notes ?? def.notes ?? '').trim()

  await db.insert(planLimitsTable).values({
    id: newPlanLimitId(),
    planId,
    limitKey,
    limitValue,
    resetPeriod,
    limitUnit,
    enforcement: enforcementFinal,
    notes,
    valueKind: valueKind === 'boolean' ? 'boolean' : 'number',
  })

  return { ok: true, planId, limitKey }
})
