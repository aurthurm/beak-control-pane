import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { tenantsTable } from '../../db/schema'
import { slugifyKey } from '../../utils/products'
import { getStaffOrganizationId } from '../../utils/organizations'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

type Body = {
  slug?: string
  name?: string
  legalName?: string
  industry?: string
  status?: string
  seats?: number
  email?: string
  phone?: string
  country?: string
  billingMode?: string
  billingProvider?: string
  supportTier?: string
  internalNotes?: string
  contactName?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const body = await readBody<Body>(event)
  const name = body.name?.trim()

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  let baseSlug = body.slug?.trim() ? slugifyKey(body.slug) : slugifyKey(name)
  if (!baseSlug) baseSlug = 'tenant'

  let slug = baseSlug
  let n = 0
  while (true) {
    const existing = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(and(eq(tenantsTable.organizationId, organizationId), eq(tenantsTable.slug, slug)))
    if (!existing.length) break
    n += 1
    slug = `${baseSlug}-${n}`
  }

  const id = `tenant_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const now = new Date().toISOString()

  await db.insert(tenantsTable).values({
    id,
    organizationId,
    slug,
    name,
    legalName: body.legalName?.trim() ?? '',
    industry: body.industry?.trim() ?? 'General',
    status: body.status?.trim() || 'active',
    seats: typeof body.seats === 'number' && Number.isFinite(body.seats) ? Math.max(0, Math.floor(body.seats)) : 0,
    createdAt: now,
    email: body.email?.trim() ?? '',
    phone: body.phone?.trim() ?? '',
    country: body.country?.trim() ?? '',
    billingMode: body.billingMode?.trim() ?? '',
    billingProvider: body.billingProvider?.trim() ?? '',
    supportTier: body.supportTier?.trim() ?? '',
    internalNotes: body.internalNotes?.trim() ?? '',
    contactName: body.contactName?.trim() ?? '',
  })

  return { id, slug }
})
