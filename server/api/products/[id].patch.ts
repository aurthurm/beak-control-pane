import { drizzle } from 'drizzle-orm/libsql'
import { and, eq } from 'drizzle-orm'
import { productsTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { getProductByIdOrSlug } from '../../utils/productLookup'
import { DEFAULT_BILLING_MODES, PRODUCT_STATUS, PRODUCT_TYPE_KEYS, slugifyKey } from '../../utils/products'
import { getStaffOrganizationId } from '../../utils/organizations'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

type Body = {
  name?: string
  slug?: string
  description?: string
  status?: string
  productType?: string
  defaultBillingMode?: string
  offlineLicensesSupported?: boolean
  activationsRequired?: boolean
  usageTrackingEnabled?: boolean
  extraDetails?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const raw = event.context.params?.id?.trim()
  if (!raw) {
    throw createError({ statusCode: 400, statusMessage: 'Product id or slug required' })
  }

  const body = await readBody<Body>(event)
  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const existing = await getProductByIdOrSlug(db, raw, organizationId)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }

  const id = existing.id

  const nextSlug = body.slug?.trim()
  if (nextSlug && nextSlug !== existing.slug) {
    const [slugClash] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(eq(productsTable.slug, nextSlug), eq(productsTable.organizationId, organizationId)))
    if (slugClash && slugClash.id !== id) {
      throw createError({ statusCode: 409, statusMessage: 'A product with this key already exists' })
    }
  }

  const updates: Partial<typeof productsTable.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name cannot be empty' })
    }
    updates.name = name
  }

  if (body.slug !== undefined) {
    const slug = slugifyKey(body.slug)
    if (!slug) {
      throw createError({ statusCode: 400, statusMessage: 'Key cannot be empty' })
    }
    updates.slug = slug
  }

  if (body.description !== undefined) {
    updates.description = body.description.trim()
  }

  if (body.extraDetails !== undefined) {
    updates.extraDetails = body.extraDetails.trim()
  }

  if (body.status !== undefined) {
    const status = body.status.trim().toLowerCase()
    if (!PRODUCT_STATUS.includes(status as (typeof PRODUCT_STATUS)[number])) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
    }
    updates.status = status
  }

  if (body.productType !== undefined) {
    const productType = body.productType.trim().toLowerCase()
    if (!PRODUCT_TYPE_KEYS.includes(productType as (typeof PRODUCT_TYPE_KEYS)[number])) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid product type' })
    }
    updates.productType = productType
  }

  if (body.defaultBillingMode !== undefined) {
    const mode = body.defaultBillingMode.trim().toLowerCase()
    if (!DEFAULT_BILLING_MODES.includes(mode as (typeof DEFAULT_BILLING_MODES)[number])) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid default billing mode' })
    }
    updates.defaultBillingMode = mode
  }

  if (body.offlineLicensesSupported !== undefined) {
    updates.offlineLicensesSupported = body.offlineLicensesSupported
  }
  if (body.activationsRequired !== undefined) {
    updates.activationsRequired = body.activationsRequired
  }
  if (body.usageTrackingEnabled !== undefined) {
    updates.usageTrackingEnabled = body.usageTrackingEnabled
  }

  await db.update(productsTable).set(updates).where(eq(productsTable.id, id))

  return { ok: true as const }
})
