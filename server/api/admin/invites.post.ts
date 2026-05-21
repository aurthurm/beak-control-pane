import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { adminInvitesTable, usersTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { hashToken, randomSessionToken } from '../../utils/auth-crypto'
import { requirePlatformAdmin } from '../../utils/auth-guards'

type Body = {
  email?: string
  /** support | platform_admin */
  targetRole?: string
}

export default defineEventHandler(async (event) => {
  const session = await requirePlatformAdmin(event)

  const body = await readBody<Body>(event)
  const email = body.email?.trim().toLowerCase()
  const targetRole = body.targetRole?.trim() === 'platform_admin' ? 'platform_admin' : 'support'

  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'email is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email))

  if (existingUser) {
    throw createError({ statusCode: 409, statusMessage: 'User already exists with this email' })
  }

  const rawToken = randomSessionToken()
  const tokenHash = hashToken(rawToken)
  const id = `ainv_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const expires = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const now = new Date().toISOString()

  await db.insert(adminInvitesTable).values({
    id,
    email,
    tokenHash,
    invitedByUserId: session.user.id,
    targetRole,
    expiresAt: expires,
    consumedAt: '',
    createdAt: now,
  })

  return {
    ok: true,
    inviteId: id,
    token: rawToken,
    expiresAt: expires,
    targetRole,
    acceptUrl: `/admin/login?invite=${encodeURIComponent(rawToken)}`,
  }
})
