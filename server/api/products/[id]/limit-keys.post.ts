import { drizzle } from 'drizzle-orm/libsql'
import { productLimitKeysTable } from '../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { getProductByIdOrSlug } from '../../../utils/productLookup'
import { getStaffOrganizationId } from '../../../utils/organizations'
import { featureKeyFromInput } from '../../../utils/features'
import { newProductLimitKeyId } from '../../../utils/planIds'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

type Body = {
  limitKey: string
  resetPeriod?: string
  limitUnit?: string
  valueKind?: 'number' | 'boolean'
  enforcement?: 'hard' | 'soft'
  notes?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const rawId = event.context.params?.id?.trim()
  if (!rawId) {
    throw createError({ statusCode: 400, statusMessage: 'Product id required' })
  }

  const body = await readBody<Body>(event)
  const keySource = body.limitKey?.trim()
  if (!keySource) {
    throw createError({ statusCode: 400, statusMessage: 'Limit key is required' })
  }

  const limitKey = featureKeyFromInput(keySource)
  if (!limitKey) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid limit key' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const resolved = await getProductByIdOrSlug(db, rawId, organizationId)
  if (!resolved) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }
  const productId = resolved.id

  const resetPeriod = (body.resetPeriod ?? 'monthly').trim() || 'monthly'
  const limitUnit = (body.limitUnit ?? '').trim()
  const valueKind = body.valueKind === 'boolean' ? 'boolean' : 'number'
  const enforcement = body.enforcement === 'soft' ? 'soft' : 'hard'
  const notes = (body.notes ?? '').trim()

  try {
    await db.insert(productLimitKeysTable).values({
      id: newProductLimitKeyId(),
      productId,
      limitKey,
      resetPeriod,
      limitUnit,
      valueKind,
      enforcement,
      notes,
      createdAt: new Date().toISOString(),
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Limit key already exists for this product' })
  }

  return { ok: true, productId, limitKey }
})
