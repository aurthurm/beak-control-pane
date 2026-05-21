import type { Client } from '@libsql/client'

async function tableColumnNames(client: Client, table: string) {
  const result = await client.execute({ sql: `PRAGMA table_info(${table})`, args: [] })
  const nameIdx = result.columns.indexOf('name')
  return result.rows.map((row) => (nameIdx >= 0 ? String(row[nameIdx] ?? '') : ''))
}

async function ensureColumn(client: Client, table: string, column: string, ddl: string) {
  const columns = await tableColumnNames(client, table)
  if (!columns.includes(column)) {
    await client.execute(ddl)
  }
}

export async function migrateActivationsTable(client: Client) {
  await ensureColumn(
    client,
    'activations',
    'activation_type',
    `ALTER TABLE activations ADD COLUMN activation_type TEXT NOT NULL DEFAULT 'machine'`,
  )
  await ensureColumn(
    client,
    'activations',
    'activated_at',
    `ALTER TABLE activations ADD COLUMN activated_at TEXT NOT NULL DEFAULT ''`,
  )
  await ensureColumn(
    client,
    'activations',
    'environment_json',
    `ALTER TABLE activations ADD COLUMN environment_json TEXT NOT NULL DEFAULT '{}'`,
  )
  await ensureColumn(
    client,
    'activations',
    'heartbeats_json',
    `ALTER TABLE activations ADD COLUMN heartbeats_json TEXT NOT NULL DEFAULT '[]'`,
  )
  await ensureColumn(
    client,
    'activations',
    'violations_json',
    `ALTER TABLE activations ADD COLUMN violations_json TEXT NOT NULL DEFAULT '[]'`,
  )
  await ensureColumn(
    client,
    'activations',
    'user_binding',
    `ALTER TABLE activations ADD COLUMN user_binding TEXT NOT NULL DEFAULT ''`,
  )

  await client.execute({
    sql: `UPDATE activations SET activated_at = last_seen_at WHERE trim(COALESCE(activated_at, '')) = ''`,
    args: [],
  })

  await client.execute({
    sql: `UPDATE activations SET status = 'released' WHERE lower(status) = 'revoked'`,
    args: [],
  })
}
