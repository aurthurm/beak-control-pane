import { drizzle } from 'drizzle-orm/libsql'
import { and, eq } from 'drizzle-orm'
import { productsTable } from '../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import {
  DEFAULT_BILLING_MODES,
  PRODUCT_STATUS,
  PRODUCT_TYPE_KEYS,
  newProductId,
  slugifyKey,
} from '../utils/products'
import { getStaffOrganizationId } from '../utils/organizations'
import { requireStaffApiWhenEnforced } from '../utils/auth-guards'

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

  const body = await readBody<Body>(event)
  const name = body.name?.trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const slug = slugifyKey(body.slug?.trim() || name)
  const description = body.description?.trim() ?? ''
  const status = body.status?.trim().toLowerCase() ?? 'draft'
  const productType = body.productType?.trim().toLowerCase() ?? 'saas'
  const defaultBillingMode = body.defaultBillingMode?.trim().toLowerCase() ?? 'subscription'

  if (!PRODUCT_STATUS.includes(status as (typeof PRODUCT_STATUS)[number])) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
  }
  if (!PRODUCT_TYPE_KEYS.includes(productType as (typeof PRODUCT_TYPE_KEYS)[number])) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid product type' })
  }
  if (!DEFAULT_BILLING_MODES.includes(defaultBillingMode as (typeof DEFAULT_BILLING_MODES)[number])) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid default billing mode' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const [existing] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(eq(productsTable.organizationId, organizationId), eq(productsTable.slug, slug)))
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'A product with this key already exists' })
  }

  const now = new Date().toISOString()
  const id = newProductId()

  await db.insert(productsTable).values({
    id,
    organizationId,
    slug,
    name,
    description,
    status,
    createdAt: now,
    updatedAt: now,
    productType,
    defaultBillingMode,
    offlineLicensesSupported: body.offlineLicensesSupported ?? false,
    activationsRequired: body.activationsRequired ?? true,
    usageTrackingEnabled: body.usageTrackingEnabled ?? true,
    extraDetails: body.extraDetails?.trim() ?? '',
  })

  return { id, slug }
})
