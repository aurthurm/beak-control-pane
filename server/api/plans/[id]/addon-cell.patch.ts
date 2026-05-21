import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { planAddonsTable, plansTable, productAddonKeysTable } from '../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

type Body = {
  addonKey: string
  enabled: boolean
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const planId = getRouterParam(event, 'id')?.trim()
  if (!planId) {
    throw createError({ statusCode: 400, statusMessage: 'Plan id is required' })
  }

  const body = await readBody<Body>(event)
  const addonKey = body.addonKey?.trim()
  if (!addonKey) {
    throw createError({ statusCode: 400, statusMessage: 'addonKey is required' })
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
    .from(productAddonKeysTable)
    .where(and(eq(productAddonKeysTable.productId, plan.productId), eq(productAddonKeysTable.addonKey, addonKey)))

  if (!def) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unknown add-on for this product — add it under product add-on definitions first',
    })
  }

  await db.delete(planAddonsTable).where(and(eq(planAddonsTable.planId, planId), eq(planAddonsTable.addonKey, addonKey)))

  if (body.enabled) {
    await db.insert(planAddonsTable).values({ planId, addonKey })
  }

  return { ok: true, planId, addonKey, enabled: Boolean(body.enabled) }
})
