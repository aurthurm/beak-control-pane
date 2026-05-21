import type { Client } from '@libsql/client'

export async function migrateAuthTables(client: Client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    platform_role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT ''
  );`)

  await client.execute(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`)

  await client.execute(`CREATE TABLE IF NOT EXISTS organization_memberships (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    membership_role TEXT NOT NULL,
    PRIMARY KEY (user_id, organization_id)
  );`)

  await client.execute(`CREATE TABLE IF NOT EXISTS org_invites (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );`)

  await client.execute(`CREATE TABLE IF NOT EXISTS admin_invites (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    target_role TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );`)
}
