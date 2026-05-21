import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { adminInvitesTable, usersTable } from '../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { hashPassword, hashToken } from '../../../utils/auth-crypto'
import { createSessionForUser, newUserId } from '../../../utils/auth'

type Body = {
  token?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const token = body.token?.trim()
  const password = body.password

  if (!token || !password) {
    throw createError({ statusCode: 400, statusMessage: 'token and password are required' })
  }
  if (password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'password must be at least 8 characters' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const tokenHash = hashToken(token)
  const [invite] = await db.select().from(adminInvitesTable).where(eq(adminInvitesTable.tokenHash, tokenHash))
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  }
  if (invite.consumedAt) {
    throw createError({ statusCode: 409, statusMessage: 'Invite already used' })
  }
  if (new Date(invite.expiresAt) < new Date()) {
    throw createError({ statusCode: 410, statusMessage: 'Invite expired' })
  }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, invite.email))
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Account already exists' })
  }

  const userId = newUserId()
  const now = new Date().toISOString()
  const passwordHash = await hashPassword(password)

  await db.insert(usersTable).values({
    id: userId,
    email: invite.email.toLowerCase(),
    passwordHash,
    platformRole: invite.targetRole,
    createdAt: now,
    updatedAt: now,
  })

  await db
    .update(adminInvitesTable)
    .set({ consumedAt: now })
    .where(eq(adminInvitesTable.id, invite.id))

  await createSessionForUser(event, userId)

  return { ok: true, userId, platformRole: invite.targetRole }
})
