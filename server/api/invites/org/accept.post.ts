import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import {
  organizationMembershipsTable,
  orgInvitesTable,
  usersTable,
} from '../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { hashPassword, hashToken } from '../../../utils/auth-crypto'
import { createSessionForUser, newUserId } from '../../../utils/auth'

type Body = {
  token?: string
  password?: string
  email?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const token = body.token?.trim()
  const password = body.password
  const emailOverride = body.email?.trim().toLowerCase()

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'token is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const tokenHash = hashToken(token)
  const [invite] = await db.select().from(orgInvitesTable).where(eq(orgInvitesTable.tokenHash, tokenHash))
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  }
  if (invite.consumedAt) {
    throw createError({ statusCode: 409, statusMessage: 'Invite already used' })
  }
  if (new Date(invite.expiresAt) < new Date()) {
    throw createError({ statusCode: 410, statusMessage: 'Invite expired' })
  }

  const targetEmail = emailOverride || invite.email.toLowerCase()
  if (targetEmail !== invite.email.toLowerCase() && emailOverride) {
    throw createError({ statusCode: 400, statusMessage: 'Email must match invite' })
  }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, targetEmail))
  if (existing) {
    const [already] = await db
      .select()
      .from(organizationMembershipsTable)
      .where(
        and(
          eq(organizationMembershipsTable.userId, existing.id),
          eq(organizationMembershipsTable.organizationId, invite.organizationId),
        ),
      )
    if (!already) {
      await db.insert(organizationMembershipsTable).values({
        userId: existing.id,
        organizationId: invite.organizationId,
        membershipRole: 'member',
      })
    }

    await db
      .update(orgInvitesTable)
      .set({ consumedAt: new Date().toISOString() })
      .where(eq(orgInvitesTable.id, invite.id))

    await createSessionForUser(event, existing.id)
    return { ok: true, userId: existing.id, organizationId: invite.organizationId, joined: true }
  }

  if (!password || password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'password (min 8 chars) is required for new user' })
  }

  const userId = newUserId()
  const now = new Date().toISOString()
  const passwordHash = await hashPassword(password)

  await db.insert(usersTable).values({
    id: userId,
    email: targetEmail,
    passwordHash,
    platformRole: 'subscriber',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(organizationMembershipsTable).values({
    userId,
    organizationId: invite.organizationId,
    membershipRole: 'member',
  })

  await db
    .update(orgInvitesTable)
    .set({ consumedAt: now })
    .where(eq(orgInvitesTable.id, invite.id))

  await createSessionForUser(event, userId)

  return { ok: true, userId, organizationId: invite.organizationId, joined: true }
})
