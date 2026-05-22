import { describe, expect, it } from 'vitest'
import { createMockClient } from './helpers/mock-client'
import { migrateProductsTable } from '../server/utils/products'
import { migrateSubscriptionsTable, migrateLicensesTable, migrateBillingEventsSubscriptionId, migrateBillingEventsProcessingFields } from '../server/utils/subscriptions'
import { migrateOrganizationsTable } from '../server/utils/organizations'

describe('schema migrations', () => {
  it('adds product columns and normalization updates', async () => {
    const { client, executed } = createMockClient({
      products: ['id', 'slug', 'name', 'description', 'status', 'created_at'],
    })

    await migrateProductsTable(client)

    expect(executed.map((row) => row.sql)).toEqual([
      'PRAGMA table_info(products)',
      'ALTER TABLE products ADD COLUMN updated_at TEXT',
      'UPDATE products SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = \'\'',
      "ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'saas'",
      "ALTER TABLE products ADD COLUMN default_billing_mode TEXT NOT NULL DEFAULT 'subscription'",
      'ALTER TABLE products ADD COLUMN offline_licenses_supported INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE products ADD COLUMN activations_required INTEGER NOT NULL DEFAULT 1',
      'ALTER TABLE products ADD COLUMN usage_tracking_enabled INTEGER NOT NULL DEFAULT 1',
      "ALTER TABLE products ADD COLUMN extra_details TEXT NOT NULL DEFAULT ''",
      "UPDATE products SET updated_at = created_at WHERE updated_at IS NULL OR TRIM(COALESCE(updated_at, '')) = ''",
    ])
  })

  it('adds subscription and billing columns', async () => {
    const { client, executed } = createMockClient({
      subscriptions: ['id', 'subscriber_id', 'plan_id', 'provider', 'provider_ref', 'status', 'starts_at', 'renewal_at', 'ends_at'],
      licenses: ['id', 'subscriber_id', 'product_id', 'license_key'],
      billing_events: ['id', 'provider', 'subscriber_id', 'event_type', 'amount_cents', 'currency', 'occurred_at', 'payload_json'],
    })

    await migrateSubscriptionsTable(client)
    await migrateLicensesTable(client)
    await migrateBillingEventsSubscriptionId(client)
    await migrateBillingEventsProcessingFields(client)

    expect(executed.map((row) => row.sql)).toContain("ALTER TABLE subscriptions ADD COLUMN grace_ends_at TEXT NOT NULL DEFAULT ''")
    expect(executed.map((row) => row.sql)).toContain('ALTER TABLE licenses ADD COLUMN subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL')
    expect(executed.map((row) => row.sql)).toContain('ALTER TABLE billing_events ADD COLUMN subscription_id TEXT')
    expect(executed.map((row) => row.sql)).toContain("ALTER TABLE billing_events ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'processed'")
  })

  it('adds organization scoping columns and indexes', async () => {
    const { client, executed } = createMockClient({
      products: ['id', 'slug', 'name', 'description', 'status', 'created_at'],
      tenants: ['id', 'slug', 'name', 'industry', 'status', 'seats', 'created_at'],
    })

    await migrateOrganizationsTable(client)

    expect(executed.map((row) => row.sql)).toContain("ALTER TABLE products ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org_default'")
    expect(executed.map((row) => row.sql)).toContain("ALTER TABLE tenants ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org_default'")
    expect(executed.map((row) => row.sql)).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_products_organization_slug ON products(organization_id, slug)')
    expect(executed.map((row) => row.sql)).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_organization_slug ON tenants(organization_id, slug)')
  })
})
