import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { usersTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { verifyPassword } from '../../utils/auth-crypto'
import { createSessionForUser } from '../../utils/auth'

type Body = {
  email?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const email = body.email?.trim().toLowerCase()
  const password = body.password

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'email and password are required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email))
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  await createSessionForUser(event, user.id)

  return {
    ok: true,
    userId: user.id,
    platformRole: user.platformRole,
  }
})
