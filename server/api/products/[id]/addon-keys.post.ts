import { drizzle } from 'drizzle-orm/libsql'
import { productAddonKeysTable } from '../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { getProductByIdOrSlug } from '../../../utils/productLookup'
import { getStaffOrganizationId } from '../../../utils/organizations'
import { featureKeyFromInput } from '../../../utils/features'
import { newProductAddonKeyId } from '../../../utils/planIds'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

type Body = {
  addonKey: string
  displayName?: string
  notes?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const rawId = event.context.params?.id?.trim()
  if (!rawId) {
    throw createError({ statusCode: 400, statusMessage: 'Product id required' })
  }

  const body = await readBody<Body>(event)
  const keySource = body.addonKey?.trim()
  if (!keySource) {
    throw createError({ statusCode: 400, statusMessage: 'Add-on key is required' })
  }

  const addonKey = featureKeyFromInput(keySource)
  if (!addonKey) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid add-on key' })
  }

  const displayName = (body.displayName?.trim() || addonKey.replaceAll('_', ' ')).slice(0, 200)
  const notes = (body.notes ?? '').trim()

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const resolved = await getProductByIdOrSlug(db, rawId, organizationId)
  if (!resolved) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }
  const productId = resolved.id

  try {
    await db.insert(productAddonKeysTable).values({
      id: newProductAddonKeyId(),
      productId,
      addonKey,
      displayName,
      notes,
      createdAt: new Date().toISOString(),
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Add-on key already exists for this product' })
  }

  return { ok: true, productId, addonKey }
})
