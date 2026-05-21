import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { orgInvitesTable, organizationsTable } from '../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { hashToken } from '../../../utils/auth-crypto'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const token = typeof q.token === 'string' ? q.token.trim() : ''
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'token is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const tokenHash = hashToken(token)
  const [invite] = await db.select().from(orgInvitesTable).where(eq(orgInvitesTable.tokenHash, tokenHash))
  if (!invite || invite.consumedAt) {
    return { valid: false as const }
  }
  if (new Date(invite.expiresAt) < new Date()) {
    return { valid: false as const, reason: 'expired' as const }
  }

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, invite.organizationId))

  return {
    valid: true as const,
    email: invite.email,
    organizationId: invite.organizationId,
    organizationName: org?.name ?? '',
  }
})
