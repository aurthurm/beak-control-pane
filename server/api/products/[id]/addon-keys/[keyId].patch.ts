import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { planAddonsTable, plansTable, productAddonKeysTable } from '../../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../../db/bootstrap'
import { getProductByIdOrSlug } from '../../../../utils/productLookup'
import { getStaffOrganizationId } from '../../../../utils/organizations'
import { featureKeyFromInput } from '../../../../utils/features'
import { requireStaffApiWhenEnforced } from '../../../../utils/auth-guards'

type Body = {
  addonKey?: string
  displayName?: string
  notes?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const rawProduct = event.context.params?.id?.trim()
  const keyId = event.context.params?.keyId?.trim()
  if (!rawProduct || !keyId) {
    throw createError({ statusCode: 400, statusMessage: 'Product and add-on definition id required' })
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
    .from(productAddonKeysTable)
    .where(and(eq(productAddonKeysTable.id, keyId), eq(productAddonKeysTable.productId, productId)))

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Add-on definition not found' })
  }

  const nextAddonKey =
    body.addonKey !== undefined ? featureKeyFromInput(body.addonKey.trim() || existing.addonKey) : existing.addonKey
  if (!nextAddonKey) {
    throw createError({ statusCode: 400, statusMessage: 'Add-on key cannot be empty' })
  }
  if (nextAddonKey !== existing.addonKey) {
    const [clash] = await db
      .select({ id: productAddonKeysTable.id })
      .from(productAddonKeysTable)
      .where(and(eq(productAddonKeysTable.productId, productId), eq(productAddonKeysTable.addonKey, nextAddonKey)))
    if (clash && clash.id !== keyId) {
      throw createError({ statusCode: 409, statusMessage: 'Add-on key already exists for this product' })
    }
  }

  const nextDisplayName =
    body.displayName !== undefined
      ? (body.displayName.trim() || nextAddonKey.replaceAll('_', ' '))
      : (existing.displayName ?? '')
  const nextNotes = body.notes !== undefined ? body.notes.trim() : existing.notes ?? ''

  await db
    .update(productAddonKeysTable)
    .set({
      addonKey: nextAddonKey,
      displayName: nextDisplayName.slice(0, 200),
      notes: nextNotes,
    })
    .where(and(eq(productAddonKeysTable.id, keyId), eq(productAddonKeysTable.productId, productId)))

  if (nextAddonKey !== existing.addonKey) {
    const productPlans = await db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.productId, productId))
    const planIds = productPlans.map((p) => p.id)
    if (planIds.length) {
      await db
        .update(planAddonsTable)
        .set({ addonKey: nextAddonKey })
        .where(and(inArray(planAddonsTable.planId, planIds), eq(planAddonsTable.addonKey, existing.addonKey)))
    }
  }

  return { ok: true, id: keyId, addonKey: nextAddonKey }
})
