import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { planAddonsTable, plansTable, productAddonKeysTable } from '../../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../../db/bootstrap'
import { getProductByIdOrSlug } from '../../../../utils/productLookup'
import { getStaffOrganizationId } from '../../../../utils/organizations'
import { requireStaffApiWhenEnforced } from '../../../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const rawProduct = event.context.params?.id?.trim()
  const keyId = event.context.params?.keyId?.trim()
  if (!rawProduct || !keyId) {
    throw createError({ statusCode: 400, statusMessage: 'Product and add-on definition id required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const resolved = await getProductByIdOrSlug(db, rawProduct, organizationId)
  if (!resolved) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }
  const productId = resolved.id

  const [def] = await db
    .select()
    .from(productAddonKeysTable)
    .where(and(eq(productAddonKeysTable.id, keyId), eq(productAddonKeysTable.productId, productId)))

  if (!def) {
    throw createError({ statusCode: 404, statusMessage: 'Add-on definition not found' })
  }

  const productPlans = await db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.productId, productId))
  const planIds = productPlans.map((p) => p.id)

  if (planIds.length) {
    await db
      .delete(planAddonsTable)
      .where(and(inArray(planAddonsTable.planId, planIds), eq(planAddonsTable.addonKey, def.addonKey)))
  }

  await db
    .delete(productAddonKeysTable)
    .where(and(eq(productAddonKeysTable.id, keyId), eq(productAddonKeysTable.productId, productId)))

  return { ok: true }
})
