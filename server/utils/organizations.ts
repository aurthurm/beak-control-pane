import type { Client } from '@libsql/client'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '../db/schema'
import type { H3Event } from 'h3'
import { getCookie, getQuery } from 'h3'
import { organizationsTable } from '../db/schema'
import { ACTIVE_ORGANIZATION_COOKIE } from './auth'

/** Seeded default org for local/bootstrap data; new signups create their own org rows. */
export const DEFAULT_ORGANIZATION_ID = 'org_default'

export async function migrateOrganizationsTable(client: Client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT ''
  );`)

  const now = new Date().toISOString()
  await client.execute({
    sql: `INSERT OR IGNORE INTO organizations (id, slug, name, status, created_at, updated_at)
          VALUES (?, ?, ?, 'active', ?, ?)`,
    args: [DEFAULT_ORGANIZATION_ID, 'beak', 'Beak', now, now],
  })
  await client.execute({
    sql: `UPDATE organizations
          SET slug = 'beak', name = 'Beak', updated_at = ?
          WHERE id = ?`,
    args: [now, DEFAULT_ORGANIZATION_ID],
  })

  const prodInfo = await client.execute('PRAGMA table_info(products)')
  const prodCols = new Set<string>()
  for (const row of prodInfo.rows) {
    const r = row as unknown
    if (r && typeof r === 'object' && 'name' in r && typeof (r as { name: unknown }).name === 'string') {
      prodCols.add((r as { name: string }).name)
    } else if (Array.isArray(r) && r.length > 1) {
      prodCols.add(String(r[1]))
    }
  }

  if (!prodCols.has('organization_id')) {
    await client.execute(
      `ALTER TABLE products ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org_default'`,
    )
    await client.execute({
      sql: `UPDATE products SET organization_id = ? WHERE organization_id IS NULL OR organization_id = ''`,
      args: [DEFAULT_ORGANIZATION_ID],
    })
  }

  const tenantInfo = await client.execute('PRAGMA table_info(tenants)')
  const tenantCols = new Set<string>()
  for (const row of tenantInfo.rows) {
    const r = row as unknown
    if (r && typeof r === 'object' && 'name' in r && typeof (r as { name: unknown }).name === 'string') {
      tenantCols.add((r as { name: string }).name)
    } else if (Array.isArray(r) && r.length > 1) {
      tenantCols.add(String(r[1]))
    }
  }

  if (!tenantCols.has('organization_id')) {
    await client.execute(
      `ALTER TABLE tenants ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org_default'`,
    )
    await client.execute({
      sql: `UPDATE tenants SET organization_id = ? WHERE organization_id IS NULL OR organization_id = ''`,
      args: [DEFAULT_ORGANIZATION_ID],
    })
  }

  await migrateProductsSlugUniqueIndex(client)
  await migrateTenantsSlugUniqueIndex(client)
}

async function migrateProductsSlugUniqueIndex(client: Client) {
  const indexes = await client.execute('PRAGMA index_list(products)')
  const rows = indexes.rows as unknown as Array<Record<string, unknown>>
  for (const row of rows) {
    const unique = row.unique
    const name = String(row.name ?? '')
    if (Number(unique) === 1) {
      const info = await client.execute({ sql: `PRAGMA index_info(${name})`, args: [] })
      const cols = (info.rows as unknown as Array<Record<string, unknown>>).map((r) => String(r.name ?? ''))
      if (cols.length === 1 && cols[0] === 'slug') {
        await client.execute(`DROP INDEX IF EXISTS "${name}"`)
      }
    }
  }

  await client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_products_organization_slug ON products(organization_id, slug)`,
  )
}

async function migrateTenantsSlugUniqueIndex(client: Client) {
  const indexes = await client.execute('PRAGMA index_list(tenants)')
  const rows = indexes.rows as unknown as Array<Record<string, unknown>>
  for (const row of rows) {
    const unique = row.unique
    const name = String(row.name ?? '')
    if (Number(unique) === 1) {
      const info = await client.execute({ sql: `PRAGMA index_info(${name})`, args: [] })
      const cols = (info.rows as unknown as Array<Record<string, unknown>>).map((r) => String(r.name ?? ''))
      if (cols.length === 1 && cols[0] === 'slug') {
        await client.execute(`DROP INDEX IF EXISTS "${name}"`)
      }
    }
  }

  await client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_organization_slug ON tenants(organization_id, slug)`,
  )
}

type AppDb = LibSQLDatabase<any>

export async function ensureUniqueOrganizationSlug(db: AppDb, base: string): Promise<string> {
  let slug = base || 'org'
  let n = 0
  while (true) {
    const [row] = await db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.slug, slug))
    if (!row) return slug
    n += 1
    slug = `${base || 'org'}-${n}`
  }
}

/** Staff console: optional ?organizationId= ; defaults to seeded platform org. */
export function getStaffOrganizationId(event: H3Event): string {
  const q = getQuery(event)
  const raw = q.organizationId
  const id = typeof raw === 'string' ? raw.trim() : ''
  if (id && /^[a-zA-Z0-9_-]+$/.test(id)) {
    return id
  }

  const activeOrganizationId = getCookie(event, ACTIVE_ORGANIZATION_COOKIE)?.trim() || ''
  if (activeOrganizationId && /^[a-zA-Z0-9_-]+$/.test(activeOrganizationId)) {
    return activeOrganizationId
  }

  return DEFAULT_ORGANIZATION_ID
}
