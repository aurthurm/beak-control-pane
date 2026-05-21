import type { Client } from '@libsql/client'
import { hashPassword } from './auth-crypto'

async function upsertPlatformAdminFromEnv(
  client: Client,
  opts: { id: string; email?: string; password?: string },
) {
  const email = opts.email?.trim().toLowerCase()
  const password = opts.password
  if (!email || !password) {
    return
  }

  const now = new Date().toISOString()
  const hash = await hashPassword(password)

  const existing = await client.execute({
    sql: 'SELECT id FROM users WHERE lower(email) = ?',
    args: [email],
  })

  if (existing.rows.length > 0) {
    const existingId = String(existing.rows[0]?.id ?? '')
    if (!existingId) {
      return
    }
    await client.execute({
      sql: `UPDATE users
            SET password_hash = ?, platform_role = 'platform_admin', updated_at = ?
            WHERE id = ?`,
      args: [hash, now, existingId],
    })
    return
  }

  await client.execute({
    sql: `INSERT INTO users (id, email, password_hash, platform_role, created_at, updated_at)
          VALUES (?, ?, ?, 'platform_admin', ?, ?)`,
    args: [opts.id, email, hash, now, now],
  })
}

export async function seedPlatformAdmin(client: Client) {
  // Legacy/default seeded admin.
  await upsertPlatformAdminFromEnv(client, {
    id: 'usr_platform_admin_seed',
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  })

  // Dedicated super admin seed (same platform_admin role permissions).
  await upsertPlatformAdminFromEnv(client, {
    id: 'usr_super_admin_seed',
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
  })
}
