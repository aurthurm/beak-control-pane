import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { auditLogsTable, featuresTable } from '../../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../../db/bootstrap'
import { getProductByIdOrSlug } from '../../../../utils/productLookup'
import { getStaffOrganizationId } from '../../../../utils/organizations'
import { requireStaffApiWhenEnforced } from '../../../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const rawProduct = event.context.params?.id?.trim()
  const featureId = event.context.params?.featureId?.trim()
  if (!rawProduct || !featureId) {
    throw createError({ statusCode: 400, statusMessage: 'Product and feature id required' })
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

  const [feature] = await db.select().from(featuresTable).where(eq(featuresTable.id, featureId))
  if (!feature) {
    throw createError({ statusCode: 404, statusMessage: 'Feature not found' })
  }

  if (feature.productId !== productId) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'This feature is not owned by this product. Remove it from plans or archive it instead of deleting here.',
    })
  }

  const now = new Date().toISOString()
  await db.delete(featuresTable).where(and(eq(featuresTable.id, featureId), eq(featuresTable.productId, productId)))

  await db.insert(auditLogsTable).values({
    id: `aud_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    tenantId: null,
    actor: 'console',
    action: 'catalog.feature_deleted',
    resourceType: 'feature',
    resourceId: featureId,
    resourceName: feature.name,
    source: 'api',
    result: 'success',
    detailsJson: JSON.stringify({
      featureId,
      featureKey: feature.featureKey,
      productId,
      summary: 'Feature deleted from product catalog.',
    }),
    createdAt: now,
  })

  return { ok: true }
})
