import type { Client } from '@libsql/client'

export async function migrateEnterpriseContractsTable(client: Client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS enterprise_contracts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      msa_reference TEXT NOT NULL DEFAULT '',
      account_owner TEXT NOT NULL DEFAULT '',
      entitlement_overrides_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}
