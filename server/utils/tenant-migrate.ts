import type { Client } from '@libsql/client'

export async function migrateTenantsTable(client: Client) {
  const info = await client.execute('PRAGMA table_info(tenants)')
  const nameIdx = info.columns.indexOf('name')
  const columns = new Set(
    info.rows.map((r) => (nameIdx >= 0 ? String(r[nameIdx]) : String((r as Record<string, unknown>).name ?? ''))),
  )

  const addColumn = async (sql: string) => {
    await client.execute(sql)
  }

  if (!columns.has('legal_name')) {
    await addColumn(`ALTER TABLE tenants ADD COLUMN legal_name TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('email')) {
    await addColumn(`ALTER TABLE tenants ADD COLUMN email TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('phone')) {
    await addColumn(`ALTER TABLE tenants ADD COLUMN phone TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('country')) {
    await addColumn(`ALTER TABLE tenants ADD COLUMN country TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('billing_mode')) {
    await addColumn(`ALTER TABLE tenants ADD COLUMN billing_mode TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('billing_provider')) {
    await addColumn(`ALTER TABLE tenants ADD COLUMN billing_provider TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('support_tier')) {
    await addColumn(`ALTER TABLE tenants ADD COLUMN support_tier TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('internal_notes')) {
    await addColumn(`ALTER TABLE tenants ADD COLUMN internal_notes TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('contact_name')) {
    await addColumn(`ALTER TABLE tenants ADD COLUMN contact_name TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('enterprise_segment')) {
    await addColumn(`ALTER TABLE tenants ADD COLUMN enterprise_segment TEXT NOT NULL DEFAULT ''`)
  }
}

