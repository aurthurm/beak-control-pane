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
  /** standard | smb | mid_market | enterprise — reporting & flag rollouts */
  enterpriseSegment?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'tenant id is required' })
  }

  const body = await readBody<Body>(event)
  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const [existing] = await db
    .select()
    .from(tenantsTable)
    .where(and(eq(tenantsTable.id, id), eq(tenantsTable.organizationId, organizationId)))
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Tenant not found' })
  }

  const patch: Partial<typeof tenantsTable.$inferInsert> = {}

  if (body.slug !== undefined) {
    const next = slugifyKey(body.slug)
    if (!next) {
      throw createError({ statusCode: 400, statusMessage: 'slug must not be empty' })
    }
    if (next !== existing.slug) {
      const clash = await db
        .select({ id: tenantsTable.id })
        .from(tenantsTable)
        .where(and(eq(tenantsTable.slug, next), eq(tenantsTable.organizationId, organizationId)))
      if (clash.length && clash[0]!.id !== id) {
        throw createError({ statusCode: 409, statusMessage: 'tenant code already in use' })
      }
    }
    patch.slug = next
  }

  if (body.name !== undefined) {
    const v = body.name.trim()
    if (!v) throw createError({ statusCode: 400, statusMessage: 'name must not be empty' })
    patch.name = v
  }
  if (body.legalName !== undefined) patch.legalName = body.legalName.trim()
  if (body.industry !== undefined) patch.industry = body.industry.trim()
  if (body.status !== undefined) patch.status = body.status.trim()
  if (body.seats !== undefined) {
    if (typeof body.seats !== 'number' || !Number.isFinite(body.seats)) {
      throw createError({ statusCode: 400, statusMessage: 'seats must be a number' })
    }
    patch.seats = Math.max(0, Math.floor(body.seats))
  }
  if (body.email !== undefined) patch.email = body.email.trim()
  if (body.phone !== undefined) patch.phone = body.phone.trim()
  if (body.country !== undefined) patch.country = body.country.trim()
  if (body.billingMode !== undefined) patch.billingMode = body.billingMode.trim()
  if (body.billingProvider !== undefined) patch.billingProvider = body.billingProvider.trim()
  if (body.supportTier !== undefined) patch.supportTier = body.supportTier.trim()
  if (body.internalNotes !== undefined) patch.internalNotes = body.internalNotes.trim()
  if (body.contactName !== undefined) patch.contactName = body.contactName.trim()
  if (body.enterpriseSegment !== undefined) patch.enterpriseSegment = body.enterpriseSegment.trim()

  if (Object.keys(patch).length === 0) {
    return { ok: true, id }
  }

  await db.update(tenantsTable).set(patch).where(eq(tenantsTable.id, id))

  return { ok: true, id }
})
