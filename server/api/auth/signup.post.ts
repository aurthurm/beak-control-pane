import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import {
  organizationMembershipsTable,
  organizationsTable,
  usersTable,
} from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { hashPassword } from '../../utils/auth-crypto'
import { createSessionForUser, newOrganizationId, newUserId } from '../../utils/auth'
import { ensureUniqueOrganizationSlug } from '../../utils/organizations'
import { slugifyKey } from '../../utils/products'

type Body = {
  email?: string
  password?: string
  organizationName?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const email = body.email?.trim().toLowerCase()
  const password = body.password
  const orgName = body.organizationName?.trim() || 'Organization'

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'email and password are required' })
  }
  if (password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'password must be at least 8 characters' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email))
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists' })
  }

  const passwordHash = await hashPassword(password)
  const userId = newUserId()
  const orgId = newOrganizationId()
  const now = new Date().toISOString()
  const baseSlug = slugifyKey(orgName) || 'organization'
  const orgSlug = await ensureUniqueOrganizationSlug(db, baseSlug)

  await db.insert(organizationsTable).values({
    id: orgId,
    slug: orgSlug,
    name: orgName,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(usersTable).values({
    id: userId,
    email,
    passwordHash,
    platformRole: 'customer',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(organizationMembershipsTable).values({
    userId,
    organizationId: orgId,
    membershipRole: 'owner',
  })

  await createSessionForUser(event, userId)

  return {
    ok: true,
    userId,
    organizationId: orgId,
  }
})
