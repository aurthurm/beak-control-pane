import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { planLimitsTable, plansTable, productLimitKeysTable } from '../../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../../db/bootstrap'
import { getProductByIdOrSlug } from '../../../../utils/productLookup'
import { getStaffOrganizationId } from '../../../../utils/organizations'
import { featureKeyFromInput } from '../../../../utils/features'
import { requireStaffApiWhenEnforced } from '../../../../utils/auth-guards'

type Body = {
  limitKey?: string
  resetPeriod?: string
  limitUnit?: string
  valueKind?: 'number' | 'boolean'
  enforcement?: 'hard' | 'soft'
  notes?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const rawProduct = event.context.params?.id?.trim()
  const keyId = event.context.params?.keyId?.trim()
  if (!rawProduct || !keyId) {
    throw createError({ statusCode: 400, statusMessage: 'Product and limit definition id required' })
  }

  const body = await readBody<Body>(event)
  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const resolved = await getProductByIdOrSlug(db, rawProduct, organizationId)
  if (!resolved) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }
  const productId = resolved.id

  const [existing] = await db
    .select()
    .from(productLimitKeysTable)
    .where(and(eq(productLimitKeysTable.id, keyId), eq(productLimitKeysTable.productId, productId)))

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Limit definition not found' })
  }

  const nextLimitKey =
    body.limitKey !== undefined ? featureKeyFromInput(body.limitKey.trim() || existing.limitKey) : existing.limitKey
  if (!nextLimitKey) {
    throw createError({ statusCode: 400, statusMessage: 'Limit key cannot be empty' })
  }
  if (nextLimitKey !== existing.limitKey) {
    const [clash] = await db
      .select({ id: productLimitKeysTable.id })
      .from(productLimitKeysTable)
      .where(and(eq(productLimitKeysTable.productId, productId), eq(productLimitKeysTable.limitKey, nextLimitKey)))
    if (clash && clash.id !== keyId) {
      throw createError({ statusCode: 409, statusMessage: 'Limit key already exists for this product' })
    }
  }

  const nextResetPeriod =
    body.resetPeriod !== undefined ? body.resetPeriod.trim() || existing.resetPeriod : existing.resetPeriod
  const nextLimitUnit = body.limitUnit !== undefined ? body.limitUnit.trim() : existing.limitUnit ?? ''
  const nextValueKind =
    body.valueKind === 'boolean' || body.valueKind === 'number'
      ? body.valueKind
      : (existing.valueKind === 'boolean' ? 'boolean' : 'number')
  const nextEnforcement =
    body.enforcement === 'soft' || body.enforcement === 'hard'
      ? body.enforcement
      : (existing.enforcement === 'soft' ? 'soft' : 'hard')
  const nextNotes = body.notes !== undefined ? body.notes.trim() : existing.notes ?? ''

  await db
    .update(productLimitKeysTable)
    .set({
      limitKey: nextLimitKey,
      resetPeriod: nextResetPeriod,
      limitUnit: nextLimitUnit,
      valueKind: nextValueKind,
      enforcement: nextEnforcement,
      notes: nextNotes,
    })
    .where(and(eq(productLimitKeysTable.id, keyId), eq(productLimitKeysTable.productId, productId)))

  const productPlans = await db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.productId, productId))
  const planIds = productPlans.map((p) => p.id)

  if (planIds.length) {
    await db
      .update(planLimitsTable)
      .set({
        limitKey: nextLimitKey,
        resetPeriod: nextResetPeriod,
        limitUnit: nextLimitUnit,
        valueKind: nextValueKind,
        enforcement: nextEnforcement,
        notes: nextNotes,
      })
      .where(and(inArray(planLimitsTable.planId, planIds), eq(planLimitsTable.limitKey, existing.limitKey)))
  }

  return { ok: true, id: keyId, limitKey: nextLimitKey }
})
