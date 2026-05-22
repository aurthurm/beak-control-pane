import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/libsql'
import { orgInvitesTable } from '../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { hashToken, randomSessionToken } from '../../../utils/auth-crypto'
import { getSessionFromEvent } from '../../../utils/auth'

type Body = {
  email?: string
  organizationId?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const email = body.email?.trim().toLowerCase()
  const organizationId = body.organizationId?.trim()

  if (!email || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'email and organizationId are required' })
  }

  const session = await getSessionFromEvent(event)
  if (!session || session.user.platformRole !== 'subscriber') {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const membership = session.memberships.find((m) => m.organizationId === organizationId)
  if (!membership || (membership.membershipRole !== 'owner' && membership.membershipRole !== 'admin')) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const rawToken = randomSessionToken()
  const tokenHash = hashToken(rawToken)
  const id = `oinv_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const expires = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const now = new Date().toISOString()

  await db.insert(orgInvitesTable).values({
    id,
    email,
    organizationId,
    tokenHash,
    invitedByUserId: session.user.id,
    expiresAt: expires,
    consumedAt: '',
    createdAt: now,
  })

  return {
    ok: true,
    inviteId: id,
    token: rawToken,
    expiresAt: expires,
    acceptUrl: `/portal/join?invite=${encodeURIComponent(rawToken)}&type=org`,
  }
})
