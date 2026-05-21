import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { plansTable, productsTable } from '../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import { slugifyKey } from '../utils/products'
import { stringifyPlanMetadata, type PlanMetadata } from '../utils/planMetadata'
import { newPlanId } from '../utils/planIds'
import { getStaffOrganizationId } from '../utils/organizations'
import { requireStaffApiWhenEnforced } from '../utils/auth-guards'

type CreatePlanBody = {
  productId: string
  name: string
  slug?: string
  edition?: string
  billingCycle: string
  priceCents: number
  currency?: string
  status?: string
  trialSupported?: boolean
  visibility?: string
  isDefault?: boolean
  isRecommended?: boolean
  metadata?: PlanMetadata
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const body = await readBody<CreatePlanBody>(event)

  if (!body?.productId || !body.name?.trim() || !body.billingCycle?.trim() || body.priceCents === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'productId, name, billingCycle, and priceCents are required',
    })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, body.productId), eq(productsTable.organizationId, organizationId)))

  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }

  const id = newPlanId()
  let slug = (body.slug?.trim() && slugifyKey(body.slug)) || slugifyKey(body.name)
  const clash = await db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.slug, slug))
  if (clash.length) {
    slug = `${slug}-${id.slice(-6)}`
  }

  const now = new Date().toISOString()
  const metadata = body.metadata ?? {}

  if (body.isDefault) {
    await db.update(plansTable).set({ isDefault: false }).where(eq(plansTable.productId, body.productId))
  }

  await db.insert(plansTable).values({
    id,
    productId: body.productId,
    slug,
    name: body.name.trim(),
    edition: body.edition?.trim() ?? '',
    billingCycle: body.billingCycle.trim(),
    priceCents: Math.max(0, Math.round(body.priceCents)),
    currency: (body.currency ?? 'USD').trim() || 'USD',
    status: (body.status ?? 'draft').trim() || 'draft',
    createdAt: now,
    updatedAt: now,
    trialSupported: Boolean(body.trialSupported),
    visibility: (body.visibility ?? 'public').trim() || 'public',
    isDefault: Boolean(body.isDefault),
    isRecommended: Boolean(body.isRecommended),
    metadataJson: stringifyPlanMetadata(metadata),
  })

  return { id, slug }
})
