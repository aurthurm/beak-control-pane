import { createClient, type Client } from '@libsql/client'
import { existsSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { migrateActivationsTable } from '../utils/activations-migrate'
import { migrateProductsTable } from '../utils/products'
import {
  migrateBillingEventsProcessingFields,
  migrateBillingEventsSubscriptionId,
  migrateLicensesTable,
  migrateSubscriptionsTable,
} from '../utils/subscriptions'
import { migrateEnterpriseContractsTable } from '../utils/enterprise-migrate'
import { migrateSubscribersTable } from '../utils/subscriber-migrate'
import { migrateOrganizationsTable } from '../utils/organizations'
import { migrateAuthTables } from '../utils/auth-migrate'

const sqlQuote = (value: string | number | boolean | null | undefined) => {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }

  return `'${value.replace(/'/g, "''")}'`
}

const insertRows = (
  table: string,
  columns: string[],
  rows: Array<Record<string, string | number | boolean | null | undefined>>,
) => {
  const values = rows
    .map((row) => `(${columns.map((column) => sqlQuote(row[column])).join(', ')})`)
    .join(',\n')

  return `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES ${values};`
}

const limsStarterMetadata = JSON.stringify({
  billingMappings: { stripe: 'price_lims_starter', paddle: 'pri_01limsstarter' },
  trial: { days: 14, requiresPaymentMethod: false },
  gracePeriodDays: 7,
  enterpriseOverrideCompatible: false,
})

const limsProMetadata = JSON.stringify({
  billingMappings: { stripe: 'price_lims_pro', paddle: 'pri_01limspro' },
  trial: { days: 14, requiresPaymentMethod: true },
  gracePeriodDays: 14,
  enterpriseOverrideCompatible: true,
})

const posProMetadata = JSON.stringify({
  billingMappings: { stripe: 'price_pos_pro', manual: 'contract-pos-pro' },
  trial: { days: 7, requiresPaymentMethod: false },
  gracePeriodDays: 5,
  enterpriseOverrideCompatible: false,
})

const posEnterpriseMetadata = JSON.stringify({
  billingMappings: { stripe: 'price_pos_ent', paddle: 'pri_01posent' },
  trial: { days: 30, requiresPaymentMethod: true },
  gracePeriodDays: 21,
  enterpriseOverrideCompatible: true,
})

const bitlimbsMetadata = JSON.stringify({
  billingMappings: { stripe: 'price_bitlimbs_foundation' },
  trial: { days: 0, requiresPaymentMethod: false },
  gracePeriodDays: 30,
  enterpriseOverrideCompatible: true,
})

const seedLicenseSignatureHeader = Buffer.from(
  JSON.stringify({
    alg: 'ES256',
    typ: 'JWT',
    kid: 'bcp-1',
  }),
).toString('base64url')

function makeSeedLicenseSignature(input: {
  id: string
  subscriberId: string
  productId: string
  subscriptionId?: string
  licenseKey: string
  mode: string
  status: string
  validFrom: string
  validTo: string
}) {
  const payload = Buffer.from(
    JSON.stringify({
        seed: true,
        licenseId: input.id,
        licenseKey: input.licenseKey,
        subscriberId: input.subscriberId,
        productId: input.productId,
        subscriptionId: input.subscriptionId ?? '',
        mode: input.mode,
        status: input.status,
        validFrom: input.validFrom,
        validTo: input.validTo,
      }),
    ).toString('base64url')
  const signature = Buffer.from(`${input.id}:${input.licenseKey}:${input.subscriberId}:${input.subscriptionId ?? ''}`).toString('base64url')
  return `${seedLicenseSignatureHeader}.${payload}.${signature}`
}

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

async function migrateDatabaseSchema(client: Client) {
  await ensureColumn(client, 'plans', 'edition', `ALTER TABLE plans ADD COLUMN edition TEXT NOT NULL DEFAULT ''`)
  await ensureColumn(client, 'plans', 'updated_at', `ALTER TABLE plans ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`)
  await ensureColumn(
    client,
    'plans',
    'trial_supported',
    `ALTER TABLE plans ADD COLUMN trial_supported INTEGER NOT NULL DEFAULT 0`,
  )
  await ensureColumn(client, 'plans', 'visibility', `ALTER TABLE plans ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`)
  await ensureColumn(client, 'plans', 'is_default', `ALTER TABLE plans ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`)
  await ensureColumn(
    client,
    'plans',
    'is_recommended',
    `ALTER TABLE plans ADD COLUMN is_recommended INTEGER NOT NULL DEFAULT 0`,
  )
  await ensureColumn(
    client,
    'plans',
    'metadata_json',
    `ALTER TABLE plans ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'`,
  )

  await ensureColumn(client, 'plan_limits', 'limit_unit', `ALTER TABLE plan_limits ADD COLUMN limit_unit TEXT NOT NULL DEFAULT ''`)
  await ensureColumn(
    client,
    'plan_limits',
    'enforcement',
    `ALTER TABLE plan_limits ADD COLUMN enforcement TEXT NOT NULL DEFAULT 'hard'`,
  )
  await ensureColumn(client, 'plan_limits', 'notes', `ALTER TABLE plan_limits ADD COLUMN notes TEXT NOT NULL DEFAULT ''`)
  await ensureColumn(
    client,
    'plan_limits',
    'value_kind',
    `ALTER TABLE plan_limits ADD COLUMN value_kind TEXT NOT NULL DEFAULT 'number'`,
  )

  await client.execute({
    sql: `UPDATE plans SET updated_at = created_at WHERE trim(COALESCE(updated_at, '')) = ''`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE plans SET edition = name WHERE trim(COALESCE(edition, '')) = ''`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE plan_limits SET enforcement = 'hard' WHERE trim(COALESCE(enforcement, '')) = ''`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE plan_limits SET value_kind = 'number' WHERE trim(COALESCE(value_kind, '')) = ''`,
    args: [],
  })

  await ensureColumn(
    client,
    'audit_logs',
    'resource_name',
    `ALTER TABLE audit_logs ADD COLUMN resource_name TEXT NOT NULL DEFAULT ''`,
  )
  await ensureColumn(
    client,
    'audit_logs',
    'source',
    `ALTER TABLE audit_logs ADD COLUMN source TEXT NOT NULL DEFAULT 'job'`,
  )
  await ensureColumn(
    client,
    'audit_logs',
    'result',
    `ALTER TABLE audit_logs ADD COLUMN result TEXT NOT NULL DEFAULT 'success'`,
  )

  await ensureColumn(
    client,
    'usage_records',
    'product_id',
    `ALTER TABLE usage_records ADD COLUMN product_id TEXT REFERENCES products(id) ON DELETE SET NULL`,
  )
  await ensureColumn(
    client,
    'usage_records',
    'period_key',
    `ALTER TABLE usage_records ADD COLUMN period_key TEXT NOT NULL DEFAULT ''`,
  )
  await ensureColumn(
    client,
    'usage_records',
    'warning_threshold_percent',
    `ALTER TABLE usage_records ADD COLUMN warning_threshold_percent INTEGER NOT NULL DEFAULT 80`,
  )
  await ensureColumn(
    client,
    'usage_records',
    'enforcement',
    `ALTER TABLE usage_records ADD COLUMN enforcement TEXT NOT NULL DEFAULT 'hard'`,
  )
  await ensureColumn(
    client,
    'usage_records',
    'source',
    `ALTER TABLE usage_records ADD COLUMN source TEXT NOT NULL DEFAULT ''`,
  )

  await client.execute({
    sql: `UPDATE usage_records SET period_key = '2026-04' WHERE trim(COALESCE(period_key, '')) = '' AND lower(trim(period)) LIKE '%april%'`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE usage_records SET period_key = '2026-04' WHERE trim(COALESCE(period_key, '')) = '' AND lower(trim(period)) LIKE '%this month%'`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE usage_records SET enforcement = 'hard' WHERE trim(COALESCE(enforcement, '')) = ''`,
    args: [],
  })

  await ensureColumn(
    client,
    'runtime_feature_flags',
    'plan_assignments_json',
    `ALTER TABLE runtime_feature_flags ADD COLUMN plan_assignments_json TEXT NOT NULL DEFAULT '[]'`,
  )
  await migrateRuntimeFlagPlanAssignments(client)

  await ensureColumn(
    client,
    'features',
    'product_id',
    `ALTER TABLE features ADD COLUMN product_id TEXT REFERENCES products(id) ON DELETE SET NULL`,
  )
  await ensureColumn(
    client,
    'features',
    'feature_type',
    `ALTER TABLE features ADD COLUMN feature_type TEXT NOT NULL DEFAULT 'module'`,
  )
  await ensureColumn(
    client,
    'features',
    'is_billable',
    `ALTER TABLE features ADD COLUMN is_billable INTEGER NOT NULL DEFAULT 1`,
  )
  await ensureColumn(
    client,
    'features',
    'default_enabled',
    `ALTER TABLE features ADD COLUMN default_enabled INTEGER NOT NULL DEFAULT 1`,
  )
  await ensureColumn(client, 'features', 'status', `ALTER TABLE features ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`)
  await ensureColumn(
    client,
    'features',
    'visibility',
    `ALTER TABLE features ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`,
  )
  await ensureColumn(
    client,
    'features',
    'visibility_rules_json',
    `ALTER TABLE features ADD COLUMN visibility_rules_json TEXT NOT NULL DEFAULT '{}'`,
  )
  await ensureColumn(
    client,
    'features',
    'dependencies_json',
    `ALTER TABLE features ADD COLUMN dependencies_json TEXT NOT NULL DEFAULT '[]'`,
  )
  await ensureColumn(
    client,
    'features',
    'mutually_exclusive_json',
    `ALTER TABLE features ADD COLUMN mutually_exclusive_json TEXT NOT NULL DEFAULT '[]'`,
  )
  await ensureColumn(
    client,
    'features',
    'tags_json',
    `ALTER TABLE features ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'`,
  )
  await ensureColumn(client, 'features', 'updated_at', `ALTER TABLE features ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`)

  await client.execute({
    sql: `UPDATE features SET updated_at = '2026-04-01T09:00:00Z' WHERE trim(COALESCE(updated_at, '')) = ''`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET feature_type = 'module' WHERE trim(COALESCE(feature_type, '')) = ''`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET status = 'active' WHERE trim(COALESCE(status, '')) = ''`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET visibility = 'public' WHERE trim(COALESCE(visibility, '')) = ''`,
    args: [],
  })

  await client.execute({
    sql: `UPDATE features SET category = 'reports' WHERE id IN ('feat_reports', 'feat_reports_adv')`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET category = 'inventory' WHERE id = 'feat_inventory'`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET category = 'customers' WHERE id = 'feat_customers'`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET category = 'integrations' WHERE id = 'feat_hl7'`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET product_id = 'prd_beak_lims', is_billable = 1, default_enabled = 1 WHERE id IN ('feat_reports', 'feat_reports_adv', 'feat_hl7')`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET product_id = 'prd_beak_pos', is_billable = 1, default_enabled = 1 WHERE id IN ('feat_inventory', 'feat_customers')`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET product_id = 'prd_bitlimbs', feature_type = 'toggle', visibility = 'beta', is_billable = 0 WHERE id = 'feat_beta'`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET dependencies_json = '["feat_reports"]' WHERE id = 'feat_reports_adv'`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET tags_json = '["exports","regulated"]' WHERE id = 'feat_reports_adv'`,
    args: [],
  })
  await client.execute({
    sql: `UPDATE features SET tags_json = '["stock","reorder"]' WHERE id = 'feat_inventory'`,
    args: [],
  })

  await migrateProductLimitKeysTable(client)
  await migrateProductAddonKeysFromLegacyMetadata(client)
  await migratePlanMetadataLegacyCleanup(client)
}

async function migrateRuntimeFlagPlanAssignments(client: Client) {
  const rows = await client.execute({
    sql: `SELECT id, product_id, linked_feature_id, plan_assignments_json
          FROM runtime_feature_flags`,
    args: [],
  })

  for (const row of rows.rows) {
    const r = row as unknown as Record<string, string | bigint | null>
    const id = String(r.id ?? '')
    if (!id) continue

    const existing = String(r.plan_assignments_json ?? '').trim()
    if (existing && existing !== '[]') continue

    const linkedFeatureId = String(r.linked_feature_id ?? '').trim()
    const productId = String(r.product_id ?? '').trim()

    let planIds: string[] = []
    if (linkedFeatureId) {
      const coverage = await client.execute({
        sql: `SELECT pf.plan_id
              FROM plan_features pf
              INNER JOIN plans p ON p.id = pf.plan_id
              WHERE pf.feature_id = ?
              ORDER BY p.created_at, p.id`,
        args: [linkedFeatureId],
      })
      planIds = coverage.rows
        .map((coverageRow) => String((coverageRow as unknown as Record<string, string | bigint | null>).plan_id ?? ''))
        .filter(Boolean)
    }

    if (!planIds.length && productId) {
      const productPlans = await client.execute({
        sql: `SELECT id FROM plans WHERE product_id = ? ORDER BY created_at, id`,
        args: [productId],
      })
      planIds = productPlans.rows
        .map((planRow) => String((planRow as unknown as Record<string, string | bigint | null>).id ?? ''))
        .filter(Boolean)
    }

    await client.execute({
      sql: `UPDATE runtime_feature_flags SET plan_assignments_json = ? WHERE id = ?`,
      args: [JSON.stringify([...new Set(planIds)]), id],
    })
  }
}

async function migrateProductAddonKeysFromLegacyMetadata(client: Client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS product_addon_keys (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    addon_key TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(product_id, addon_key)
  );`)
  await client.execute(`CREATE TABLE IF NOT EXISTS plan_addons (
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    addon_key TEXT NOT NULL,
    PRIMARY KEY (plan_id, addon_key)
  );`)

  const plansRows = await client.execute({ sql: 'SELECT id, product_id, metadata_json FROM plans', args: [] })
  const keysByProduct = new Map<string, Set<string>>()
  const attachedByPlan = new Map<string, string[]>()

  for (const row of plansRows.rows) {
    const r = row as unknown as Record<string, string | bigint | null>
    const planId = String(r.id ?? '')
    const productId = String(r.product_id ?? '')
    let meta: Record<string, unknown> = {}
    try {
      meta = JSON.parse(String(r.metadata_json ?? '{}')) as Record<string, unknown>
    } catch {
      meta = {}
    }
    const allowed = Array.isArray(meta.addOnsAllowed) ? meta.addOnsAllowed.map((x) => String(x)).filter(Boolean) : []
    const attached = Array.isArray(meta.attachedAddOns)
      ? meta.attachedAddOns.map((x) => String(x)).filter(Boolean)
      : []
    const union = [...new Set([...allowed, ...attached])]
    if (!keysByProduct.has(productId)) {
      keysByProduct.set(productId, new Set())
    }
    const ks = keysByProduct.get(productId)!
    for (const k of union) {
      ks.add(k)
    }
    attachedByPlan.set(planId, [...new Set(attached)])
  }

  const nowIso = new Date().toISOString()
  for (const [productId, keys] of keysByProduct) {
    for (const addonKey of keys) {
      const pakId = `pak_${randomUUID().replace(/-/g, '').slice(0, 12)}`
      await client.execute({
        sql: `INSERT OR IGNORE INTO product_addon_keys (id, product_id, addon_key, display_name, notes, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [pakId, productId, addonKey, addonKey, '', nowIso],
      })
    }
  }

  for (const [planId, keys] of attachedByPlan) {
    for (const addonKey of keys) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO plan_addons (plan_id, addon_key) VALUES (?, ?)`,
        args: [planId, addonKey],
      })
    }
  }
}

async function migratePlanMetadataLegacyCleanup(client: Client) {
  const rows = await client.execute({ sql: 'SELECT id, metadata_json FROM plans', args: [] })
  for (const row of rows.rows) {
    const r = row as unknown as Record<string, string | bigint | null>
    const id = String(r.id ?? '')
    let meta: Record<string, unknown> = {}
    try {
      meta = JSON.parse(String(r.metadata_json ?? '{}')) as Record<string, unknown>
    } catch {
      meta = {}
    }
    delete meta.excludedFeatureIds
    delete meta.addOnsAllowed
    delete meta.attachedAddOns
    await client.execute({
      sql: 'UPDATE plans SET metadata_json = ? WHERE id = ?',
      args: [JSON.stringify(meta), id],
    })
  }
}

async function normalizeSeedLicenseSignatures(client: Client) {
  const rows = await client.execute({
    sql: `SELECT id, subscriber_id, product_id, license_key, mode, status, valid_from, valid_to
          FROM licenses
          WHERE signature NOT LIKE '%.%.%'`,
    args: [],
  })

  for (const row of rows.rows) {
    const r = row as unknown as Record<string, string | bigint | null>
    const id = String(r.id ?? '')
    if (!id) continue
    const signature = makeSeedLicenseSignature({
      id,
      subscriberId: String(r.subscriber_id ?? ''),
      productId: String(r.product_id ?? ''),
      licenseKey: String(r.license_key ?? ''),
      mode: String(r.mode ?? ''),
      status: String(r.status ?? ''),
      validFrom: String(r.valid_from ?? ''),
      validTo: String(r.valid_to ?? ''),
    })
    await client.execute({
      sql: `UPDATE licenses SET signature = ? WHERE id = ?`,
      args: [signature, id],
    })
  }
}

async function migrateProductLimitKeysTable(client: Client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS product_limit_keys (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    limit_key TEXT NOT NULL,
    reset_period TEXT NOT NULL DEFAULT 'monthly',
    limit_unit TEXT NOT NULL DEFAULT '',
    value_kind TEXT NOT NULL DEFAULT 'number',
    enforcement TEXT NOT NULL DEFAULT 'hard',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(product_id, limit_key)
  );`)

  const grouped = await client.execute({
    sql: `SELECT p.product_id AS product_id, pl.limit_key AS limit_key, MIN(pl.id) AS sample_id
          FROM plan_limits pl
          INNER JOIN plans p ON p.id = pl.plan_id
          GROUP BY p.product_id, pl.limit_key`,
    args: [],
  })

  const nowIso = new Date().toISOString()
  for (const row of grouped.rows) {
    const ro = row as unknown as Record<string, string | bigint | null>
    const productId = String(ro.product_id ?? '')
    const limitKey = String(ro.limit_key ?? '')
    const sampleId = String(ro.sample_id ?? '')
    if (!productId || !limitKey || !sampleId) {
      continue
    }

    const sample = await client.execute({
      sql: `SELECT reset_period, limit_unit, value_kind, enforcement, notes FROM plan_limits WHERE id = ?`,
      args: [sampleId],
    })
    const s0 = sample.rows[0] as unknown as Record<string, string | bigint | null> | undefined
    const resetPeriod = s0 ? String(s0.reset_period ?? 'monthly') : 'monthly'
    const limitUnit = s0 ? String(s0.limit_unit ?? '') : ''
    const valueKindRaw = s0 ? String(s0.value_kind ?? 'number') : 'number'
    const valueKind = valueKindRaw === 'boolean' ? 'boolean' : 'number'
    const enforcementRaw = s0 ? String(s0.enforcement ?? 'hard') : 'hard'
    const enforcement = enforcementRaw === 'soft' ? 'soft' : 'hard'
    const notes = s0 ? String(s0.notes ?? '') : ''

    const plkId = `plk_${randomUUID().replace(/-/g, '').slice(0, 12)}`
    await client.execute({
      sql: `INSERT OR IGNORE INTO product_limit_keys (id, product_id, limit_key, reset_period, limit_unit, value_kind, enforcement, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [plkId, productId, limitKey, resetPeriod, limitUnit, valueKind, enforcement, notes, nowIso],
    })
  }
}

const bootstrapStatements: string[] = [
  `PRAGMA foreign_keys = ON;`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT '',
    product_type TEXT NOT NULL DEFAULT 'saas',
    default_billing_mode TEXT NOT NULL DEFAULT 'subscription',
    offline_licenses_supported INTEGER NOT NULL DEFAULT 0,
    activations_required INTEGER NOT NULL DEFAULT 1,
    usage_tracking_enabled INTEGER NOT NULL DEFAULT 1,
    extra_details TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    billing_cycle TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    edition TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    trial_supported INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'public',
    is_default INTEGER NOT NULL DEFAULT 0,
    is_recommended INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  );`,
  `CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    feature_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    feature_type TEXT NOT NULL DEFAULT 'module',
    is_billable INTEGER NOT NULL DEFAULT 1,
    default_enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    visibility TEXT NOT NULL DEFAULT 'public',
    visibility_rules_json TEXT NOT NULL DEFAULT '{}',
    dependencies_json TEXT NOT NULL DEFAULT '[]',
    mutually_exclusive_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS plan_features (
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (plan_id, feature_id)
  );`,
  `CREATE TABLE IF NOT EXISTS plan_limits (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    limit_key TEXT NOT NULL,
    limit_value INTEGER NOT NULL,
    reset_period TEXT NOT NULL,
    limit_unit TEXT NOT NULL DEFAULT '',
    enforcement TEXT NOT NULL DEFAULT 'hard',
    notes TEXT NOT NULL DEFAULT '',
    value_kind TEXT NOT NULL DEFAULT 'number'
  );`,
  `CREATE TABLE IF NOT EXISTS product_limit_keys (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    limit_key TEXT NOT NULL,
    reset_period TEXT NOT NULL DEFAULT 'monthly',
    limit_unit TEXT NOT NULL DEFAULT '',
    value_kind TEXT NOT NULL DEFAULT 'number',
    enforcement TEXT NOT NULL DEFAULT 'hard',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(product_id, limit_key)
  );`,
  `CREATE TABLE IF NOT EXISTS product_addon_keys (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    addon_key TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(product_id, addon_key)
  );`,
  `CREATE TABLE IF NOT EXISTS plan_addons (
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    addon_key TEXT NOT NULL,
    PRIMARY KEY (plan_id, addon_key)
  );`,
  `CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    industry TEXT NOT NULL,
    status TEXT NOT NULL,
    seats INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    legal_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    billing_mode TEXT NOT NULL DEFAULT '',
    billing_provider TEXT NOT NULL DEFAULT '',
    support_tier TEXT NOT NULL DEFAULT '',
    internal_notes TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    subscriber_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_ref TEXT NOT NULL,
    status TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    renewal_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    grace_ends_at TEXT NOT NULL DEFAULT '',
    auto_renew INTEGER NOT NULL DEFAULT 1,
    license_count INTEGER NOT NULL DEFAULT 1,
    amount_override_cents INTEGER,
    currency_override TEXT NOT NULL DEFAULT '',
    add_ons_json TEXT NOT NULL DEFAULT '[]',
    manual_contract INTEGER NOT NULL DEFAULT 0,
    activations_per_license INTEGER NOT NULL DEFAULT 1,
    paused_at TEXT NOT NULL DEFAULT '',
    provider_metadata_json TEXT NOT NULL DEFAULT '{}'
  );`,
  `CREATE TABLE IF NOT EXISTS entitlements (
    id TEXT PRIMARY KEY,
    subscriber_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    payload_json TEXT NOT NULL,
    computed_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    subscriber_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
    license_key TEXT NOT NULL UNIQUE,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    valid_from TEXT NOT NULL,
    valid_to TEXT NOT NULL,
    grace_until TEXT NOT NULL,
    signature TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    offline_allowed INTEGER NOT NULL DEFAULT 0,
    max_activations INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS activations (
    id TEXT PRIMARY KEY,
    license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    status TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    activation_type TEXT NOT NULL DEFAULT 'machine',
    activated_at TEXT NOT NULL DEFAULT '',
    environment_json TEXT NOT NULL DEFAULT '{}',
    heartbeats_json TEXT NOT NULL DEFAULT '[]',
    violations_json TEXT NOT NULL DEFAULT '[]',
    user_binding TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY,
    subscriber_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    metric TEXT NOT NULL,
    value INTEGER NOT NULL,
    limit_value INTEGER NOT NULL,
    period TEXT NOT NULL,
    period_key TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    warning_threshold_percent INTEGER NOT NULL DEFAULT 80,
    enforcement TEXT NOT NULL DEFAULT 'hard',
    source TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS billing_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    subscriber_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'processed',
    processed_at TEXT NOT NULL DEFAULT '',
    retry_count INTEGER NOT NULL DEFAULT 0,
    normalized_json TEXT NOT NULL DEFAULT '{}',
    processing_logs_json TEXT NOT NULL DEFAULT '[]',
    error_json TEXT NOT NULL DEFAULT '',
    impacted_records_json TEXT NOT NULL DEFAULT '[]'
  );`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    subscriber_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    resource_name TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'job',
    result TEXT NOT NULL DEFAULT 'success',
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS runtime_feature_flags (
    id TEXT PRIMARY KEY,
    flag_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    linked_feature_id TEXT REFERENCES features(id) ON DELETE SET NULL,
    plan_assignments_json TEXT NOT NULL DEFAULT '[]',
    flag_type TEXT NOT NULL DEFAULT 'release',
    status TEXT NOT NULL DEFAULT 'active',
    scope TEXT NOT NULL DEFAULT 'global',
    default_value TEXT NOT NULL DEFAULT 'false',
    rollout_strategy TEXT NOT NULL DEFAULT 'full_rollout',
    rollout_percent INTEGER NOT NULL DEFAULT 100,
    globally_enabled INTEGER NOT NULL DEFAULT 1,
    rules_json TEXT NOT NULL DEFAULT '{}',
    target_subscriber_ids_json TEXT NOT NULL DEFAULT '[]',
    environment_values_json TEXT NOT NULL DEFAULT '{}',
    evaluation_history_json TEXT NOT NULL DEFAULT '[]',
    expires_at TEXT NOT NULL DEFAULT '',
    archived_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  insertRows(
    'organizations',
    ['id', 'slug', 'name', 'status', 'created_at', 'updated_at'],
    [
      {
        id: 'org_default',
        slug: 'beak',
        name: 'Beak',
        status: 'active',
        created_at: '2026-04-01T08:00:00Z',
        updated_at: '2026-04-19T09:00:00Z',
      },
    ],
  ),
  insertRows(
    'products',
    [
      'id',
      'organization_id',
      'slug',
      'name',
      'description',
      'status',
      'created_at',
      'updated_at',
      'product_type',
      'default_billing_mode',
      'offline_licenses_supported',
      'activations_required',
      'usage_tracking_enabled',
      'extra_details',
    ],
    [
      {
        id: 'prd_beak_lims',
        organization_id: 'org_default',
        slug: 'beak-lims',
        name: 'Beak LIMS',
        description: 'Laboratory workflows, sample tracking, and compliance-heavy reporting.',
        status: 'active',
        created_at: '2026-04-01T09:00:00Z',
        updated_at: '2026-04-19T09:00:00Z',
        product_type: 'hybrid',
        default_billing_mode: 'subscription',
        offline_licenses_supported: true,
        activations_required: true,
        usage_tracking_enabled: true,
        extra_details: 'HL7 and regulated reporting workflows; typical deployment is hybrid with occasional offline grace.',
      },
      {
        id: 'prd_beak_pos',
        organization_id: 'org_default',
        slug: 'beak-pos',
        name: 'Beak POS',
        description: 'Point of sale, inventory, and branch-level operations.',
        status: 'active',
        created_at: '2026-04-01T09:00:00Z',
        updated_at: '2026-04-19T09:00:00Z',
        product_type: 'offline_capable',
        default_billing_mode: 'subscription',
        offline_licenses_supported: true,
        activations_required: true,
        usage_tracking_enabled: true,
        extra_details: 'Branches may run offline; sync and activation policies apply per plan.',
      },
      {
        id: 'prd_bitlimbs',
        organization_id: 'org_default',
        slug: 'bitlimbs-core',
        name: 'Bitlimbs Core',
        description: 'Core platform modules shared across the Beak ecosystem.',
        status: 'active',
        created_at: '2026-04-01T09:00:00Z',
        updated_at: '2026-04-18T12:00:00Z',
        product_type: 'saas',
        default_billing_mode: 'subscription',
        offline_licenses_supported: false,
        activations_required: true,
        usage_tracking_enabled: true,
        extra_details: '',
      },
      {
        id: 'prd_bitcos',
        organization_id: 'org_default',
        slug: 'bitcos',
        name: 'Bitcos Service',
        description: 'Commerce integrations, pricing sync, and partner-facing APIs.',
        status: 'draft',
        created_at: '2026-04-05T09:00:00Z',
        updated_at: '2026-04-05T09:00:00Z',
        product_type: 'saas',
        default_billing_mode: 'usage',
        offline_licenses_supported: false,
        activations_required: false,
        usage_tracking_enabled: true,
        extra_details: 'Planned product — billing model TBD with finance.',
      },
    ],
  ),
  insertRows(
    'plans',
    [
      'id',
      'product_id',
      'slug',
      'name',
      'billing_cycle',
      'price_cents',
      'currency',
      'status',
      'created_at',
      'edition',
      'updated_at',
      'trial_supported',
      'visibility',
      'is_default',
      'is_recommended',
      'metadata_json',
    ],
    [
      {
        id: 'plan_lims_starter',
        product_id: 'prd_beak_lims',
        slug: 'lims-starter',
        name: 'Starter',
        billing_cycle: 'monthly',
        price_cents: 35000,
        currency: 'USD',
        status: 'active',
        created_at: '2026-04-01T09:00:00Z',
        edition: 'Starter',
        updated_at: '2026-04-18T14:20:00Z',
        trial_supported: true,
        visibility: 'public',
        is_default: true,
        is_recommended: false,
        metadata_json: limsStarterMetadata,
      },
      {
        id: 'plan_lims_pro',
        product_id: 'prd_beak_lims',
        slug: 'lims-pro',
        name: 'Pro',
        billing_cycle: 'monthly',
        price_cents: 85000,
        currency: 'USD',
        status: 'active',
        created_at: '2026-04-01T09:00:00Z',
        edition: 'Professional',
        updated_at: '2026-04-19T09:15:00Z',
        trial_supported: true,
        visibility: 'public',
        is_default: false,
        is_recommended: true,
        metadata_json: limsProMetadata,
      },
      {
        id: 'plan_pos_pro',
        product_id: 'prd_beak_pos',
        slug: 'pos-pro',
        name: 'Pro',
        billing_cycle: 'monthly',
        price_cents: 64000,
        currency: 'USD',
        status: 'active',
        created_at: '2026-04-01T09:00:00Z',
        edition: 'Professional',
        updated_at: '2026-04-17T11:00:00Z',
        trial_supported: true,
        visibility: 'public',
        is_default: true,
        is_recommended: true,
        metadata_json: posProMetadata,
      },
      {
        id: 'plan_pos_enterprise',
        product_id: 'prd_beak_pos',
        slug: 'pos-enterprise',
        name: 'Enterprise',
        billing_cycle: 'annual',
        price_cents: 720000,
        currency: 'USD',
        status: 'active',
        created_at: '2026-04-01T09:00:00Z',
        edition: 'Enterprise',
        updated_at: '2026-04-16T08:45:00Z',
        trial_supported: true,
        visibility: 'custom',
        is_default: false,
        is_recommended: false,
        metadata_json: posEnterpriseMetadata,
      },
      {
        id: 'plan_bitlimbs_foundation',
        product_id: 'prd_bitlimbs',
        slug: 'bitlimbs-foundation',
        name: 'Foundation',
        billing_cycle: 'annual',
        price_cents: 120000,
        currency: 'USD',
        status: 'active',
        created_at: '2026-04-01T09:00:00Z',
        edition: 'Foundation',
        updated_at: '2026-04-12T10:30:00Z',
        trial_supported: false,
        visibility: 'private',
        is_default: true,
        is_recommended: false,
        metadata_json: bitlimbsMetadata,
      },
    ],
  ),
  insertRows(
    'product_addon_keys',
    ['id', 'product_id', 'addon_key', 'display_name', 'notes', 'created_at'],
    [
      {
        id: 'pak_lims_storage',
        product_id: 'prd_beak_lims',
        addon_key: 'addon_storage',
        display_name: 'Extra storage',
        notes: '',
        created_at: '2026-04-01T09:00:00Z',
      },
      {
        id: 'pak_lims_api',
        product_id: 'prd_beak_lims',
        addon_key: 'addon_api_pack',
        display_name: 'API pack',
        notes: '',
        created_at: '2026-04-01T09:00:00Z',
      },
      {
        id: 'pak_lims_hl7',
        product_id: 'prd_beak_lims',
        addon_key: 'addon_hl7_connector',
        display_name: 'HL7 connector',
        notes: '',
        created_at: '2026-04-01T09:00:00Z',
      },
      {
        id: 'pak_pos_branch',
        product_id: 'prd_beak_pos',
        addon_key: 'addon_extra_branch',
        display_name: 'Extra branch',
        notes: '',
        created_at: '2026-04-01T09:00:00Z',
      },
      {
        id: 'pak_pos_priority',
        product_id: 'prd_beak_pos',
        addon_key: 'addon_priority_support',
        display_name: 'Priority support',
        notes: '',
        created_at: '2026-04-01T09:00:00Z',
      },
      {
        id: 'pak_pos_wholesale',
        product_id: 'prd_beak_pos',
        addon_key: 'addon_wholesale',
        display_name: 'Wholesale',
        notes: '',
        created_at: '2026-04-01T09:00:00Z',
      },
      {
        id: 'pak_bitlimbs_gov',
        product_id: 'prd_bitlimbs',
        addon_key: 'addon_governance_pack',
        display_name: 'Governance pack',
        notes: '',
        created_at: '2026-04-01T09:00:00Z',
      },
    ],
  ),
  insertRows(
    'plan_addons',
    ['plan_id', 'addon_key'],
    [
      { plan_id: 'plan_lims_pro', addon_key: 'addon_storage' },
      { plan_id: 'plan_pos_enterprise', addon_key: 'addon_priority_support' },
    ],
  ),
  insertRows(
    'features',
    [
      'id',
      'feature_key',
      'name',
      'description',
      'category',
      'product_id',
      'feature_type',
      'is_billable',
      'default_enabled',
      'status',
      'visibility',
      'visibility_rules_json',
      'dependencies_json',
      'mutually_exclusive_json',
      'tags_json',
      'updated_at',
    ],
    [
      {
        id: 'feat_reports',
        feature_key: 'reports',
        name: 'Reports',
        description: 'Standard reporting and exports.',
        category: 'reports',
        product_id: 'prd_beak_lims',
        feature_type: 'module',
        is_billable: 1,
        default_enabled: 1,
        status: 'active',
        visibility: 'public',
        visibility_rules_json: '{}',
        dependencies_json: '[]',
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['exports']),
        updated_at: '2026-04-18T10:00:00Z',
      },
      {
        id: 'feat_reports_adv',
        feature_key: 'reports_advanced',
        name: 'Advanced reports',
        description: 'Cross-subscriber and regulated reporting.',
        category: 'reports',
        product_id: 'prd_beak_lims',
        feature_type: 'module',
        is_billable: 1,
        default_enabled: 0,
        status: 'active',
        visibility: 'enterprise',
        visibility_rules_json: JSON.stringify({ minPlan: 'pro', contractAddendum: true }),
        dependencies_json: JSON.stringify(['feat_reports']),
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['exports', 'regulated']),
        updated_at: '2026-04-19T09:20:00Z',
      },
      {
        id: 'feat_inventory',
        feature_key: 'inventory',
        name: 'Inventory',
        description: 'Stock tracking and reorder thresholds.',
        category: 'inventory',
        product_id: 'prd_beak_pos',
        feature_type: 'module',
        is_billable: 1,
        default_enabled: 1,
        status: 'active',
        visibility: 'public',
        visibility_rules_json: '{}',
        dependencies_json: '[]',
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['stock', 'reorder']),
        updated_at: '2026-04-17T14:00:00Z',
      },
      {
        id: 'feat_customers',
        feature_key: 'customers',
        name: 'Customer records',
        description: 'Customer records and billing contacts.',
        category: 'customers',
        product_id: 'prd_beak_pos',
        feature_type: 'module',
        is_billable: 1,
        default_enabled: 1,
        status: 'active',
        visibility: 'public',
        visibility_rules_json: '{}',
        dependencies_json: '[]',
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['crm']),
        updated_at: '2026-04-16T11:30:00Z',
      },
      {
        id: 'feat_hl7',
        feature_key: 'hl7',
        name: 'HL7 integration',
        description: 'Lab integrations and external messaging.',
        category: 'integrations',
        product_id: 'prd_beak_lims',
        feature_type: 'integration',
        is_billable: 1,
        default_enabled: 0,
        status: 'active',
        visibility: 'public',
        visibility_rules_json: '{}',
        dependencies_json: '[]',
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['interop', 'regulated']),
        updated_at: '2026-04-15T08:00:00Z',
      },
      {
        id: 'feat_beta',
        feature_key: 'beta_rollout',
        name: 'Beta rollout',
        description: 'Feature flags and gradual rollout controls.',
        category: 'feature-flags',
        product_id: 'prd_bitlimbs',
        feature_type: 'toggle',
        is_billable: 0,
        default_enabled: 0,
        status: 'active',
        visibility: 'beta',
        visibility_rules_json: JSON.stringify({ audience: 'internal_and_design_partners' }),
        dependencies_json: '[]',
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['rollout']),
        updated_at: '2026-04-14T16:45:00Z',
      },
      {
        id: 'feat_core_workspace',
        feature_key: 'workspace_core',
        name: 'Workspace core',
        description: 'Shared authentication, org hierarchy, and navigation shell.',
        category: 'core',
        product_id: 'prd_bitlimbs',
        feature_type: 'module',
        is_billable: 0,
        default_enabled: 1,
        status: 'active',
        visibility: 'public',
        visibility_rules_json: '{}',
        dependencies_json: '[]',
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['platform']),
        updated_at: '2026-04-10T12:00:00Z',
      },
      {
        id: 'feat_commerce_sync',
        feature_key: 'commerce_catalog_sync',
        name: 'Commerce catalog sync',
        description: 'Partner SKU and price synchronization for Bitcos.',
        category: 'commerce',
        product_id: 'prd_bitcos',
        feature_type: 'integration',
        is_billable: 1,
        default_enabled: 0,
        status: 'active',
        visibility: 'internal',
        visibility_rules_json: JSON.stringify({ launchStage: 'design' }),
        dependencies_json: '[]',
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['partner', 'experimental']),
        updated_at: '2026-04-05T09:00:00Z',
      },
      {
        id: 'feat_lab_qc',
        feature_key: 'lab_quality_control',
        name: 'Laboratory QC',
        description: 'QC lots, Westgard rules, and instrument calibration tracking.',
        category: 'laboratory',
        product_id: 'prd_beak_lims',
        feature_type: 'module',
        is_billable: 1,
        default_enabled: 0,
        status: 'active',
        visibility: 'beta',
        visibility_rules_json: '{}',
        dependencies_json: JSON.stringify(['feat_reports']),
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['qc', 'instruments']),
        updated_at: '2026-04-19T07:00:00Z',
      },
      {
        id: 'feat_ai_copilot',
        feature_key: 'ai_copilot',
        name: 'AI copilot',
        description: 'Contextual assistance for workflows and documentation.',
        category: 'ai',
        product_id: 'prd_beak_lims',
        feature_type: 'experimental',
        is_billable: 1,
        default_enabled: 0,
        status: 'active',
        visibility: 'beta',
        visibility_rules_json: JSON.stringify({ dataResidency: 'us_only' }),
        dependencies_json: '[]',
        mutually_exclusive_json: JSON.stringify(['feat_legacy_assist']),
        tags_json: JSON.stringify(['llm', 'assist']),
        updated_at: '2026-04-19T06:30:00Z',
      },
      {
        id: 'feat_legacy_assist',
        feature_key: 'legacy_assist_rules',
        name: 'Legacy assist rules',
        description: 'Deterministic rule-based assistant (pre-LLM).',
        category: 'ai',
        product_id: 'prd_beak_lims',
        feature_type: 'module',
        is_billable: 0,
        default_enabled: 1,
        status: 'deprecated',
        visibility: 'deprecated',
        visibility_rules_json: '{}',
        dependencies_json: '[]',
        mutually_exclusive_json: JSON.stringify(['feat_ai_copilot']),
        tags_json: JSON.stringify(['legacy']),
        updated_at: '2026-03-01T00:00:00Z',
      },
      {
        id: 'feat_admin_roles',
        feature_key: 'admin_rbac',
        name: 'Advanced RBAC',
        description: 'Custom roles, scoped permissions, and segregation of duties.',
        category: 'admin',
        product_id: 'prd_bitlimbs',
        feature_type: 'permission',
        is_billable: 1,
        default_enabled: 0,
        status: 'active',
        visibility: 'enterprise',
        visibility_rules_json: JSON.stringify({ minSeats: 50 }),
        dependencies_json: JSON.stringify(['feat_core_workspace']),
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['security', 'governance']),
        updated_at: '2026-04-11T15:00:00Z',
      },
      {
        id: 'feat_security_mfa',
        feature_key: 'security_mfa_enforce',
        name: 'MFA enforcement',
        description: 'Require MFA for privileged operations and break-glass accounts.',
        category: 'security',
        product_id: 'prd_bitlimbs',
        feature_type: 'permission',
        is_billable: 0,
        default_enabled: 1,
        status: 'active',
        visibility: 'public',
        visibility_rules_json: '{}',
        dependencies_json: '[]',
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['auth']),
        updated_at: '2026-04-09T10:00:00Z',
      },
      {
        id: 'feat_billing_usage',
        feature_key: 'billing_usage_meters',
        name: 'Usage meters',
        description: 'Metered billing dimensions and invoice line aggregation.',
        category: 'billing',
        product_id: 'prd_bitlimbs',
        feature_type: 'module',
        is_billable: 1,
        default_enabled: 0,
        status: 'active',
        visibility: 'public',
        visibility_rules_json: '{}',
        dependencies_json: '[]',
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['stripe', 'paddle']),
        updated_at: '2026-04-08T13:20:00Z',
      },
      {
        id: 'feat_pos_offline',
        feature_key: 'pos_offline_mode',
        name: 'POS offline mode',
        description: 'Branch-local queueing when uplink is unavailable.',
        category: 'pos',
        product_id: 'prd_beak_pos',
        feature_type: 'module',
        is_billable: 1,
        default_enabled: 0,
        status: 'active',
        visibility: 'enterprise',
        visibility_rules_json: '{}',
        dependencies_json: JSON.stringify(['feat_inventory']),
        mutually_exclusive_json: '[]',
        tags_json: JSON.stringify(['offline', 'branch']),
        updated_at: '2026-04-18T09:00:00Z',
      },
    ],
  ),
  insertRows('plan_features', ['plan_id', 'feature_id', 'enabled'], [
    { plan_id: 'plan_lims_starter', feature_id: 'feat_reports', enabled: true },
    { plan_id: 'plan_lims_pro', feature_id: 'feat_reports', enabled: true },
    { plan_id: 'plan_lims_pro', feature_id: 'feat_reports_adv', enabled: true },
    { plan_id: 'plan_lims_pro', feature_id: 'feat_inventory', enabled: true },
    { plan_id: 'plan_lims_pro', feature_id: 'feat_lab_qc', enabled: true },
    { plan_id: 'plan_lims_pro', feature_id: 'feat_ai_copilot', enabled: true },
    { plan_id: 'plan_lims_starter', feature_id: 'feat_legacy_assist', enabled: true },
    { plan_id: 'plan_pos_pro', feature_id: 'feat_inventory', enabled: true },
    { plan_id: 'plan_pos_pro', feature_id: 'feat_customers', enabled: true },
    { plan_id: 'plan_pos_enterprise', feature_id: 'feat_inventory', enabled: true },
    { plan_id: 'plan_pos_enterprise', feature_id: 'feat_customers', enabled: true },
    { plan_id: 'plan_pos_enterprise', feature_id: 'feat_beta', enabled: true },
    { plan_id: 'plan_pos_enterprise', feature_id: 'feat_pos_offline', enabled: true },
    { plan_id: 'plan_bitlimbs_foundation', feature_id: 'feat_hl7', enabled: true },
    { plan_id: 'plan_bitlimbs_foundation', feature_id: 'feat_beta', enabled: true },
    { plan_id: 'plan_bitlimbs_foundation', feature_id: 'feat_core_workspace', enabled: true },
    { plan_id: 'plan_bitlimbs_foundation', feature_id: 'feat_admin_roles', enabled: true },
    { plan_id: 'plan_bitlimbs_foundation', feature_id: 'feat_security_mfa', enabled: true },
    { plan_id: 'plan_bitlimbs_foundation', feature_id: 'feat_billing_usage', enabled: true },
  ]),
  insertRows(
    'plan_limits',
    [
      'id',
      'plan_id',
      'limit_key',
      'limit_value',
      'reset_period',
      'limit_unit',
      'enforcement',
      'notes',
      'value_kind',
    ],
    [
      {
        id: 'limit_lims_users',
        plan_id: 'plan_lims_starter',
        limit_key: 'max_users',
        limit_value: 12,
        reset_period: 'monthly',
        limit_unit: 'users',
        enforcement: 'hard',
        notes: 'Named seats; SSO users count toward cap.',
        value_kind: 'number',
      },
      {
        id: 'limit_lims_labs',
        plan_id: 'plan_lims_starter',
        limit_key: 'max_labs',
        limit_value: 2,
        reset_period: 'monthly',
        limit_unit: 'labs',
        enforcement: 'soft',
        notes: 'Soft cap during onboarding; hard block at renewal.',
        value_kind: 'number',
      },
      {
        id: 'limit_lims_pro_users',
        plan_id: 'plan_lims_pro',
        limit_key: 'max_users',
        limit_value: 45,
        reset_period: 'monthly',
        limit_unit: 'users',
        enforcement: 'hard',
        notes: '',
        value_kind: 'number',
      },
      {
        id: 'limit_lims_pro_tests',
        plan_id: 'plan_lims_pro',
        limit_key: 'max_monthly_tests',
        limit_value: 25000,
        reset_period: 'monthly',
        limit_unit: 'tests',
        enforcement: 'soft',
        notes: 'Burst allowance negotiated in enterprise appendix.',
        value_kind: 'number',
      },
      {
        id: 'limit_pos_users',
        plan_id: 'plan_pos_pro',
        limit_key: 'max_users',
        limit_value: 25,
        reset_period: 'monthly',
        limit_unit: 'users',
        enforcement: 'hard',
        notes: '',
        value_kind: 'number',
      },
      {
        id: 'limit_pos_branches',
        plan_id: 'plan_pos_pro',
        limit_key: 'max_branches',
        limit_value: 4,
        reset_period: 'monthly',
        limit_unit: 'branches',
        enforcement: 'hard',
        notes: '',
        value_kind: 'number',
      },
      {
        id: 'limit_pos_products',
        plan_id: 'plan_pos_pro',
        limit_key: 'max_products',
        limit_value: 5000,
        reset_period: 'none',
        limit_unit: 'SKU',
        enforcement: 'soft',
        notes: '',
        value_kind: 'number',
      },
      {
        id: 'limit_pos_devices',
        plan_id: 'plan_pos_pro',
        limit_key: 'max_device_activations',
        limit_value: 12,
        reset_period: 'monthly',
        limit_unit: 'devices',
        enforcement: 'hard',
        notes: 'Per branch cap inherited from license pool.',
        value_kind: 'number',
      },
      {
        id: 'limit_pos_orders',
        plan_id: 'plan_pos_pro',
        limit_key: 'max_monthly_orders',
        limit_value: 40000,
        reset_period: 'monthly',
        limit_unit: 'orders',
        enforcement: 'soft',
        notes: '',
        value_kind: 'number',
      },
      {
        id: 'limit_pos_enterprise_users',
        plan_id: 'plan_pos_enterprise',
        limit_key: 'max_users',
        limit_value: 250,
        reset_period: 'annual',
        limit_unit: 'users',
        enforcement: 'hard',
        notes: '',
        value_kind: 'number',
      },
      {
        id: 'limit_pos_ent_storage',
        plan_id: 'plan_pos_enterprise',
        limit_key: 'max_storage_gb',
        limit_value: 5000,
        reset_period: 'none',
        limit_unit: 'GB',
        enforcement: 'soft',
        notes: 'Object storage + database footprint.',
        value_kind: 'number',
      },
      {
        id: 'limit_pos_ent_api',
        plan_id: 'plan_pos_enterprise',
        limit_key: 'max_api_calls',
        limit_value: 5_000_000,
        reset_period: 'monthly',
        limit_unit: 'calls',
        enforcement: 'soft',
        notes: '',
        value_kind: 'number',
      },
      {
        id: 'limit_pos_ent_wholesale',
        plan_id: 'plan_pos_enterprise',
        limit_key: 'wholesale_module_enabled',
        limit_value: 1,
        reset_period: 'none',
        limit_unit: '',
        enforcement: 'hard',
        notes: 'Boolean gate for wholesale pricing engine.',
        value_kind: 'boolean',
      },
      {
        id: 'limit_bitlimbs_requests',
        plan_id: 'plan_bitlimbs_foundation',
        limit_key: 'max_api_calls',
        limit_value: 100000,
        reset_period: 'monthly',
        limit_unit: 'calls',
        enforcement: 'hard',
        notes: '',
        value_kind: 'number',
      },
    ],
  ),
  insertRows(
    'tenants',
    [
      'id',
      'organization_id',
      'slug',
      'name',
      'industry',
      'status',
      'seats',
      'created_at',
      'legal_name',
      'email',
      'phone',
      'country',
      'billing_mode',
      'billing_provider',
      'support_tier',
      'internal_notes',
      'contact_name',
    ],
    [
      {
        id: 'tenant_central_lab',
        organization_id: 'org_default',
        slug: 'central-lab',
        name: 'Central Lab Group',
        industry: 'Diagnostics',
        status: 'active',
        seats: 42,
        created_at: '2026-04-02T08:30:00Z',
        legal_name: 'Central Lab Group Holdings Inc.',
        email: 'ops@centrallab.example',
        phone: '+1 555 0101',
        country: 'United States',
        billing_mode: 'subscription',
        billing_provider: 'stripe',
        support_tier: 'premium',
        internal_notes: 'Primary diagnostics reference customer.',
        contact_name: 'Alex Morgan',
      },
      {
        id: 'tenant_city_hospital',
        organization_id: 'org_default',
        slug: 'city-hospital',
        name: 'City Hospital Network',
        industry: 'Healthcare',
        status: 'active',
        seats: 180,
        created_at: '2026-04-02T08:30:00Z',
        legal_name: 'City Hospital Network Authority',
        email: 'procurement@cityhospital.example',
        phone: '+1 555 0102',
        country: 'Canada',
        billing_mode: 'manual_contract',
        billing_provider: 'manual',
        support_tier: 'enterprise',
        internal_notes: 'Annual invoicing; legal review on changes.',
        contact_name: 'Jordan Lee',
      },
      {
        id: 'tenant_north_pharmacy',
        organization_id: 'org_default',
        slug: 'north-pharmacy',
        name: 'North Pharmacy',
        industry: 'Retail pharmacy',
        status: 'trial',
        seats: 18,
        created_at: '2026-04-03T08:30:00Z',
        legal_name: 'North Pharmacy Co.',
        email: 'owner@northpharm.example',
        phone: '+1 555 0103',
        country: 'United States',
        billing_mode: 'subscription',
        billing_provider: 'paynow',
        support_tier: 'standard',
        internal_notes: 'Trial ending Jul 2026.',
        contact_name: 'Sam Rivera',
      },
      {
        id: 'tenant_beta_workshop',
        organization_id: 'org_default',
        slug: 'beta-workshop',
        name: 'Beta Workshop',
        industry: 'Internal',
        status: 'active',
        seats: 9,
        created_at: '2026-04-04T08:30:00Z',
        legal_name: 'Beak Insights Internal',
        email: 'platform@beak.local',
        phone: '—',
        country: 'United States',
        billing_mode: 'license',
        billing_provider: 'manual',
        support_tier: 'internal',
        internal_notes: 'Dogfood subscriber for Bitlimbs.',
        contact_name: 'Beak Platform Team',
      },
      {
        id: 'tenant_sunset_boutique',
        organization_id: 'org_default',
        slug: 'sunset-boutique',
        name: 'Sunset Boutique',
        industry: 'Retail',
        status: 'churned',
        seats: 0,
        created_at: '2025-11-10T08:30:00Z',
        legal_name: 'Sunset Boutique LLC',
        email: 'former@sunset.example',
        phone: '+1 555 0199',
        country: 'United States',
        billing_mode: 'subscription',
        billing_provider: 'stripe',
        support_tier: 'standard',
        internal_notes: 'Churned Q1 2026 — POS consolidation.',
        contact_name: 'Taylor Kim',
      },
      {
        id: 'tenant_paused_franchise',
        organization_id: 'org_default',
        slug: 'paused-franchise',
        name: 'Paused Franchise Co.',
        industry: 'Franchise',
        status: 'suspended',
        seats: 32,
        created_at: '2026-03-01T08:30:00Z',
        legal_name: 'Paused Franchise Holdings',
        email: 'finance@pausedfr.example',
        phone: '+44 20 7946 0958',
        country: 'United Kingdom',
        billing_mode: 'subscription',
        billing_provider: 'stripe',
        support_tier: 'standard',
        internal_notes: 'Suspended for non-payment — reactivation pending.',
        contact_name: 'Chris Patel',
      },
      {
        id: 'tenant_lapsed_clinic',
        organization_id: 'org_default',
        slug: 'lapsed-clinic',
        name: 'Lapsed Clinic',
        industry: 'Outpatient',
        status: 'expired',
        seats: 6,
        created_at: '2025-08-15T08:30:00Z',
        legal_name: 'Lapsed Clinic PLLC',
        email: 'admin@lapsedclinic.example',
        phone: '+1 555 0144',
        country: 'United States',
        billing_mode: 'subscription',
        billing_provider: 'paynow',
        support_tier: 'standard',
        internal_notes: 'Contract lapsed; data retention window active.',
        contact_name: 'Morgan Avery',
      },
    ],
  ),
  insertRows(
    'runtime_feature_flags',
    [
      'id',
      'flag_key',
      'name',
      'description',
      'product_id',
      'linked_feature_id',
      'plan_assignments_json',
      'flag_type',
      'status',
      'scope',
      'default_value',
      'rollout_strategy',
      'rollout_percent',
      'globally_enabled',
      'rules_json',
      'target_subscriber_ids_json',
      'environment_values_json',
      'evaluation_history_json',
      'expires_at',
      'archived_at',
      'created_at',
      'updated_at',
    ],
    [
      {
        id: 'rf_lims_ui_refresh',
        flag_key: 'lims_ui_refresh_v2',
        name: 'LIMS UI refresh (v2)',
        description: 'Staged rollout of the redesigned specimen workflow shell. Not a commercial entitlement — runtime gate only.',
        product_id: 'prd_beak_lims',
        linked_feature_id: 'feat_reports',
        plan_assignments_json: JSON.stringify(['plan_lims_starter', 'plan_lims_pro']),
        flag_type: 'release',
        status: 'active',
        scope: 'product',
        default_value: 'false',
        rollout_strategy: 'percentage',
        rollout_percent: 30,
        globally_enabled: 1,
        rules_json: JSON.stringify({
          precedence: ['globally_disabled', 'subscriber_allowlist', 'environment_map', 'percentage', 'default'],
          notes: 'Tenant allowlist wins. Production uses env map until percentage applies.',
        }),
        target_subscriber_ids_json: JSON.stringify(['tenant_central_lab', 'tenant_beta_workshop']),
        environment_values_json: JSON.stringify({ development: true, staging: true, production: false }),
        evaluation_history_json: JSON.stringify([
          {
            at: '2026-04-19T08:12:00Z',
            subscriberId: 'tenant_central_lab',
            environment: 'production',
            result: 'true',
            reason: 'Tenant allowlist match',
          },
          {
            at: '2026-04-19T08:11:22Z',
            subscriberId: 'tenant_city_hospital',
            environment: 'production',
            result: 'false',
            reason: 'Percentage bucket 0.84 > 0.30',
          },
        ]),
        expires_at: '',
        archived_at: '',
        created_at: '2026-04-10T10:00:00Z',
        updated_at: '2026-04-19T08:12:00Z',
      },
      {
        id: 'rf_pos_api_kill',
        flag_key: 'pos_public_api_writes',
        name: 'POS public API writes',
        description: 'Operational kill switch for mutating POS partner API traffic.',
        product_id: 'prd_beak_pos',
        linked_feature_id: null,
        plan_assignments_json: JSON.stringify(['plan_pos_pro', 'plan_pos_enterprise']),
        flag_type: 'ops',
        status: 'active',
        scope: 'global',
        default_value: 'true',
        rollout_strategy: 'full_rollout',
        rollout_percent: 100,
        globally_enabled: 1,
        rules_json: JSON.stringify({
          precedence: ['globally_disabled', 'default'],
          notes: 'Flip globally off to deny writes everywhere regardless of subscriber.',
        }),
        target_subscriber_ids_json: '[]',
        environment_values_json: JSON.stringify({ production: true, staging: true }),
        evaluation_history_json: JSON.stringify([
          {
            at: '2026-04-18T22:05:00Z',
            subscriberId: null,
            environment: 'production',
            result: 'true',
            reason: 'Global ops flag on; default true',
          },
        ]),
        expires_at: '',
        archived_at: '',
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-18T22:05:00Z',
      },
      {
        id: 'rf_ai_copilot_exp',
        flag_key: 'ai_copilot_lab_assist',
        name: 'AI copilot (lab assist)',
        description: 'Experiment: expose copilot entry points to a percentage of LIMS tenants.',
        product_id: 'prd_beak_lims',
        linked_feature_id: 'feat_ai_copilot',
        plan_assignments_json: JSON.stringify(['plan_lims_pro']),
        flag_type: 'experiment',
        status: 'active',
        scope: 'subscriber',
        default_value: 'false',
        rollout_strategy: 'percentage',
        rollout_percent: 12,
        globally_enabled: 1,
        rules_json: JSON.stringify({
          precedence: ['globally_disabled', 'percentage', 'default'],
          cohort: 'stable_hash_by_subscriber_id',
        }),
        target_subscriber_ids_json: '[]',
        environment_values_json: JSON.stringify({ staging: true, production: false }),
        evaluation_history_json: JSON.stringify([
          {
            at: '2026-04-19T06:40:00Z',
            subscriberId: 'tenant_north_pharmacy',
            environment: 'staging',
            result: 'true',
            reason: 'Environment map: staging forced on',
          },
        ]),
        expires_at: '2026-06-30T23:59:59Z',
        archived_at: '',
        created_at: '2026-04-15T14:00:00Z',
        updated_at: '2026-04-19T06:40:00Z',
      },
      {
        id: 'rf_legacy_checkout',
        flag_key: 'legacy_checkout_flow',
        name: 'Legacy checkout flow',
        description: 'Deprecated POS checkout path kept for rollback; archived.',
        product_id: 'prd_beak_pos',
        linked_feature_id: null,
        plan_assignments_json: JSON.stringify(['plan_pos_pro', 'plan_pos_enterprise']),
        flag_type: 'release',
        status: 'archived',
        scope: 'product',
        default_value: 'false',
        rollout_strategy: 'subscriber_targeted',
        rollout_percent: 0,
        globally_enabled: 0,
        rules_json: JSON.stringify({ notes: 'Archived — do not re-enable without product sign-off.' }),
        target_subscriber_ids_json: '[]',
        environment_values_json: '{}',
        evaluation_history_json: '[]',
        expires_at: '2026-01-15T00:00:00Z',
        archived_at: '2026-03-01T15:00:00Z',
        created_at: '2025-06-01T09:00:00Z',
        updated_at: '2026-03-01T15:00:00Z',
      },
      {
        id: 'rf_rbac_override',
        flag_key: 'enforce_stricter_rbac',
        name: 'Stricter RBAC enforcement',
        description: 'Permission override: tighten role checks platform-wide for a subset of tenants.',
        product_id: 'prd_bitlimbs',
        linked_feature_id: 'feat_admin_roles',
        plan_assignments_json: JSON.stringify(['plan_bitlimbs_foundation']),
        flag_type: 'permission_override',
        status: 'active',
        scope: 'subscriber',
        default_value: 'false',
        rollout_strategy: 'subscriber_targeted',
        rollout_percent: 100,
        globally_enabled: 1,
        rules_json: JSON.stringify({ precedence: ['subscriber_allowlist', 'default'] }),
        target_subscriber_ids_json: JSON.stringify(['tenant_city_hospital', 'tenant_central_lab']),
        environment_values_json: JSON.stringify({ production: true }),
        evaluation_history_json: JSON.stringify([
          {
            at: '2026-04-17T11:02:00Z',
            subscriberId: 'tenant_city_hospital',
            environment: 'production',
            result: 'true',
            reason: 'Tenant targeted override',
          },
        ]),
        expires_at: '',
        archived_at: '',
        created_at: '2026-04-12T00:00:00Z',
        updated_at: '2026-04-17T11:02:00Z',
      },
    ],
  ),
  insertRows(
    'subscriptions',
    [
      'id',
      'subscriber_id',
      'plan_id',
      'provider',
      'provider_ref',
      'status',
      'starts_at',
      'renewal_at',
      'ends_at',
      'grace_ends_at',
      'auto_renew',
      'amount_override_cents',
      'currency_override',
      'add_ons_json',
      'manual_contract',
      'paused_at',
      'provider_metadata_json',
    ],
    [
      {
        id: 'sub_central_lab',
        subscriber_id: 'tenant_central_lab',
        plan_id: 'plan_lims_pro',
        provider: 'stripe',
        provider_ref: 'sub_stripe_001',
        status: 'active',
        starts_at: '2026-04-01T00:00:00Z',
        renewal_at: '2026-05-01T00:00:00Z',
        ends_at: '2027-04-01T00:00:00Z',
        grace_ends_at: '',
        auto_renew: 1,
        amount_override_cents: null,
        currency_override: '',
        add_ons_json: JSON.stringify([{ id: 'addon_hl7', name: 'HL7 connector', amountCents: 12000 }]),
        manual_contract: 0,
        paused_at: '',
        provider_metadata_json: JSON.stringify({
          stripe_customer_id: 'cus_central_01',
          stripe_subscription_item_id: 'si_lims_pro',
        }),
      },
      {
        id: 'sub_city_hospital',
        subscriber_id: 'tenant_city_hospital',
        plan_id: 'plan_pos_enterprise',
        provider: 'manual',
        provider_ref: 'contract_ch_009',
        status: 'active',
        starts_at: '2026-04-01T00:00:00Z',
        renewal_at: '2027-04-01T00:00:00Z',
        ends_at: '2027-04-01T00:00:00Z',
        grace_ends_at: '2027-04-15T00:00:00Z',
        auto_renew: 1,
        amount_override_cents: null,
        currency_override: '',
        add_ons_json: '[]',
        manual_contract: 1,
        paused_at: '',
        provider_metadata_json: JSON.stringify({ contract_version: '2026-Q1', signatory: 'CFO' }),
      },
      {
        id: 'sub_north_pharmacy',
        subscriber_id: 'tenant_north_pharmacy',
        plan_id: 'plan_pos_pro',
        provider: 'paynow',
        provider_ref: 'pn_44102',
        status: 'trialing',
        starts_at: '2026-04-10T00:00:00Z',
        renewal_at: '2026-05-10T00:00:00Z',
        ends_at: '2026-07-10T00:00:00Z',
        grace_ends_at: '2026-05-24T00:00:00Z',
        auto_renew: 1,
        amount_override_cents: null,
        currency_override: '',
        add_ons_json: '[]',
        manual_contract: 0,
        paused_at: '',
        provider_metadata_json: JSON.stringify({ paynow_agreement: 'agr_np_12' }),
      },
      {
        id: 'sub_beta_workshop',
        subscriber_id: 'tenant_beta_workshop',
        plan_id: 'plan_bitlimbs_foundation',
        provider: 'manual',
        provider_ref: 'beta_internal',
        status: 'active',
        starts_at: '2026-04-01T00:00:00Z',
        renewal_at: '2027-04-01T00:00:00Z',
        ends_at: '2027-04-01T00:00:00Z',
        grace_ends_at: '',
        auto_renew: 0,
        amount_override_cents: null,
        currency_override: '',
        add_ons_json: '[]',
        manual_contract: 1,
        paused_at: '',
        provider_metadata_json: '{}',
      },
      {
        id: 'sub_city_hospital_lims',
        subscriber_id: 'tenant_city_hospital',
        plan_id: 'plan_lims_starter',
        provider: 'stripe',
        provider_ref: 'sub_stripe_ch_lims',
        status: 'past_due',
        starts_at: '2025-10-01T00:00:00Z',
        renewal_at: '2026-04-12T00:00:00Z',
        ends_at: '2026-10-01T00:00:00Z',
        grace_ends_at: '2026-04-26T00:00:00Z',
        auto_renew: 1,
        amount_override_cents: null,
        currency_override: '',
        add_ons_json: '[]',
        manual_contract: 0,
        paused_at: '',
        provider_metadata_json: JSON.stringify({ stripe_customer_id: 'cus_ch_77' }),
      },
      {
        id: 'sub_sunset_boutique',
        subscriber_id: 'tenant_sunset_boutique',
        plan_id: 'plan_pos_pro',
        provider: 'stripe',
        provider_ref: 'sub_sunset_old',
        status: 'canceled',
        starts_at: '2025-11-15T00:00:00Z',
        renewal_at: '2026-02-15T00:00:00Z',
        ends_at: '2026-02-15T00:00:00Z',
        grace_ends_at: '',
        auto_renew: 0,
        amount_override_cents: null,
        currency_override: '',
        add_ons_json: '[]',
        manual_contract: 0,
        paused_at: '',
        provider_metadata_json: '{}',
      },
      {
        id: 'sub_paused_franchise',
        subscriber_id: 'tenant_paused_franchise',
        plan_id: 'plan_pos_pro',
        provider: 'stripe',
        provider_ref: 'sub_pf_pastdue',
        status: 'past_due',
        starts_at: '2026-03-01T00:00:00Z',
        renewal_at: '2026-04-01T00:00:00Z',
        ends_at: '2027-03-01T00:00:00Z',
        grace_ends_at: '2026-04-15T00:00:00Z',
        auto_renew: 1,
        amount_override_cents: null,
        currency_override: '',
        add_ons_json: '[]',
        manual_contract: 0,
        paused_at: '2026-04-10T12:00:00Z',
        provider_metadata_json: '{}',
      },
      {
        id: 'sub_lapsed_clinic',
        subscriber_id: 'tenant_lapsed_clinic',
        plan_id: 'plan_lims_starter',
        provider: 'paynow',
        provider_ref: 'pn_lapsed_01',
        status: 'expired',
        starts_at: '2025-09-01T00:00:00Z',
        renewal_at: '2026-03-01T00:00:00Z',
        ends_at: '2026-03-01T00:00:00Z',
        grace_ends_at: '',
        auto_renew: 0,
        amount_override_cents: null,
        currency_override: '',
        add_ons_json: '[]',
        manual_contract: 0,
        paused_at: '',
        provider_metadata_json: '{}',
      },
    ],
  ),
  insertRows('entitlements', ['id', 'subscriber_id', 'product_id', 'payload_json', 'computed_at'], [
    {
      id: 'ent_central_lab_lims',
      subscriber_id: 'tenant_central_lab',
      product_id: 'prd_beak_lims',
      payload_json: JSON.stringify({
        modules: { reports: true, reports_advanced: true, inventory: true, customers: true, hl7: false },
        limits: { users: 45, branches: 2, api_calls_per_month: 100000 },
      }),
      computed_at: '2026-04-19T08:00:00Z',
    },
    {
      id: 'ent_city_hospital_pos',
      subscriber_id: 'tenant_city_hospital',
      product_id: 'prd_beak_pos',
      payload_json: JSON.stringify({
        modules: { reports: true, inventory: true, customers: true, hl7: false },
        limits: { users: 250, branches: 8 },
      }),
      computed_at: '2026-04-19T08:00:00Z',
    },
    {
      id: 'ent_city_hospital_lims',
      subscriber_id: 'tenant_city_hospital',
      product_id: 'prd_beak_lims',
      payload_json: JSON.stringify({
        modules: { reports: true, inventory: true, customers: true, hl7: false },
        limits: { users: 30, branches: 1, api_calls_per_month: 50000 },
      }),
      computed_at: '2026-04-19T08:00:00Z',
    },
    {
      id: 'ent_north_pharmacy_pos',
      subscriber_id: 'tenant_north_pharmacy',
      product_id: 'prd_beak_pos',
      payload_json: JSON.stringify({
        modules: { inventory: true, customers: true, reports_advanced: false },
        limits: { users: 25, branches: 4 },
      }),
      computed_at: '2026-04-19T08:00:00Z',
    },
    {
      id: 'ent_beta_workshop_core',
      subscriber_id: 'tenant_beta_workshop',
      product_id: 'prd_bitlimbs',
      payload_json: JSON.stringify({
        modules: { hl7: true, beta_rollout: true },
        limits: { api_calls_per_month: 100000 },
      }),
      computed_at: '2026-04-19T08:00:00Z',
    },
  ]),
  insertRows('licenses', ['id', 'subscriber_id', 'product_id', 'subscription_id', 'license_key', 'mode', 'status', 'valid_from', 'valid_to', 'grace_until', 'signature', 'payload_json', 'offline_allowed', 'max_activations'], [
    {
      id: 'lic_central_lab_001',
      subscriber_id: 'tenant_central_lab',
      product_id: 'prd_beak_lims',
      subscription_id: 'sub_central_lab',
      license_key: 'BCP-LIMS-PRO-CLG-001',
      mode: 'hybrid',
      status: 'active',
      valid_from: '2026-04-01T00:00:00Z',
      valid_to: '2027-03-31T23:59:59Z',
      grace_until: '2027-04-15T23:59:59Z',
      signature: makeSeedLicenseSignature({
        id: 'lic_central_lab_001',
        subscriberId: 'tenant_central_lab',
        productId: 'prd_beak_lims',
        subscriptionId: 'sub_central_lab',
        licenseKey: 'BCP-LIMS-PRO-CLG-001',
        mode: 'hybrid',
        status: 'active',
        validFrom: '2026-04-01T00:00:00Z',
        validTo: '2027-03-31T23:59:59Z',
      }),
      payload_json: JSON.stringify({
        schemaVersion: '2026.04',
        subscriberId: 'tenant_central_lab',
        productId: 'prd_beak_lims',
        subscriptionId: 'sub_central_lab',
        subscriptionLicenseCount: 1,
        mode: 'hybrid',
        maxActivations: 3,
        planSlug: 'lims-pro',
        edition: 'pro',
        constraints: { offlineCapable: true, connectivity: 'hybrid', activationCap: 3, telemetryRequired: true },
        issue: {
          issuedBy: 'license-issuer',
          issuedAt: '2026-04-01T00:00:00Z',
          reason: 'subscription_provisioned',
          revision: 2,
        },
        binding: {},
      }),
      offline_allowed: true,
      max_activations: 3,
    },
    {
      id: 'lic_city_hospital_001',
      subscriber_id: 'tenant_city_hospital',
      product_id: 'prd_beak_pos',
      subscription_id: 'sub_city_hospital',
      license_key: 'BCP-POS-ENT-CHN-001',
      mode: 'offline',
      status: 'active',
      valid_from: '2026-04-01T00:00:00Z',
      valid_to: '2027-03-31T23:59:59Z',
      grace_until: '2027-04-15T23:59:59Z',
      signature: makeSeedLicenseSignature({
        id: 'lic_city_hospital_001',
        subscriberId: 'tenant_city_hospital',
        productId: 'prd_beak_pos',
        subscriptionId: 'sub_city_hospital',
        licenseKey: 'BCP-POS-ENT-CHN-001',
        mode: 'offline',
        status: 'active',
        validFrom: '2026-04-01T00:00:00Z',
        validTo: '2027-03-31T23:59:59Z',
      }),
      payload_json: JSON.stringify({
        schemaVersion: '2026.04',
        subscriberId: 'tenant_city_hospital',
        productId: 'prd_beak_pos',
        subscriptionId: 'sub_city_hospital',
        subscriptionLicenseCount: 1,
        mode: 'offline',
        maxActivations: 6,
        planSlug: 'pos-enterprise',
        edition: 'enterprise',
        constraints: { offlineCapable: true, connectivity: 'offline', activationCap: 6, telemetryRequired: false },
        issue: {
          issuedBy: 'license-issuer',
          issuedAt: '2026-04-01T00:00:00Z',
          reason: 'enterprise_contract',
          revision: 1,
        },
        binding: {},
      }),
      offline_allowed: true,
      max_activations: 6,
    },
    {
      id: 'lic_north_pharmacy_001',
      subscriber_id: 'tenant_north_pharmacy',
      product_id: 'prd_beak_pos',
      subscription_id: 'sub_north_pharmacy',
      license_key: 'BCP-POS-PRO-NPH-001',
      mode: 'online',
      status: 'grace',
      valid_from: '2026-04-10T00:00:00Z',
      valid_to: '2026-07-10T23:59:59Z',
      grace_until: '2026-07-25T23:59:59Z',
      signature: makeSeedLicenseSignature({
        id: 'lic_north_pharmacy_001',
        subscriberId: 'tenant_north_pharmacy',
        productId: 'prd_beak_pos',
        subscriptionId: 'sub_north_pharmacy',
        licenseKey: 'BCP-POS-PRO-NPH-001',
        mode: 'online',
        status: 'grace',
        validFrom: '2026-04-10T00:00:00Z',
        validTo: '2026-07-10T23:59:59Z',
      }),
      payload_json: JSON.stringify({
        schemaVersion: '2026.04',
        subscriberId: 'tenant_north_pharmacy',
        productId: 'prd_beak_pos',
        subscriptionId: 'sub_north_pharmacy',
        subscriptionLicenseCount: 1,
        mode: 'online',
        maxActivations: 2,
        planSlug: 'pos-pro',
        edition: 'pro',
        constraints: { offlineCapable: false, connectivity: 'online', activationCap: 2, telemetryRequired: true },
        issue: {
          issuedBy: 'billing-gateway',
          issuedAt: '2026-04-10T00:00:00Z',
          reason: 'trial_conversion',
          revision: 1,
        },
        binding: {},
      }),
      offline_allowed: false,
      max_activations: 2,
    },
    {
      id: 'lic_beta_workshop_001',
      subscriber_id: 'tenant_beta_workshop',
      product_id: 'prd_bitlimbs',
      subscription_id: 'sub_beta_workshop',
      license_key: 'BCP-BITLIMBS-FND-BW-001',
      mode: 'online',
      status: 'active',
      valid_from: '2026-04-01T00:00:00Z',
      valid_to: '2027-03-31T23:59:59Z',
      grace_until: '2027-04-15T23:59:59Z',
      signature: makeSeedLicenseSignature({
        id: 'lic_beta_workshop_001',
        subscriberId: 'tenant_beta_workshop',
        productId: 'prd_bitlimbs',
        subscriptionId: 'sub_beta_workshop',
        licenseKey: 'BCP-BITLIMBS-FND-BW-001',
        mode: 'online',
        status: 'active',
        validFrom: '2026-04-01T00:00:00Z',
        validTo: '2027-03-31T23:59:59Z',
      }),
      payload_json: JSON.stringify({
        schemaVersion: '2026.04',
        subscriberId: 'tenant_beta_workshop',
        productId: 'prd_bitlimbs',
        subscriptionId: 'sub_beta_workshop',
        subscriptionLicenseCount: 1,
        mode: 'online',
        maxActivations: 3,
        planSlug: 'bitlimbs-foundation',
        edition: 'foundation',
        constraints: { offlineCapable: false, connectivity: 'online', activationCap: 3, telemetryRequired: true },
        issue: {
          issuedBy: 'license-issuer',
          issuedAt: '2026-04-01T00:00:00Z',
          reason: 'beta_program',
          revision: 1,
        },
        binding: {},
      }),
      offline_allowed: false,
      max_activations: 3,
    },
  ]),
  insertRows(
    'activations',
    [
      'id',
      'license_id',
      'device_id',
      'site_id',
      'installation_id',
      'status',
      'last_seen_at',
      'activation_type',
      'activated_at',
      'environment_json',
      'heartbeats_json',
      'violations_json',
      'user_binding',
    ],
    [
      {
        id: 'act_001',
        license_id: 'lic_central_lab_001',
        device_id: 'device-cl-01',
        site_id: 'site-central-01',
        installation_id: 'inst-9011',
        status: 'active',
        last_seen_at: '2026-04-19T07:14:00Z',
        activation_type: 'machine',
        activated_at: '2026-04-10T12:00:00Z',
        environment_json: JSON.stringify({ ip: '10.20.1.44', hostname: 'lims-bench-01', os: 'Linux 6.6' }),
        heartbeats_json: JSON.stringify([
          { at: '2026-04-19T07:14:00Z', ip: '10.20.1.44' },
          { at: '2026-04-18T22:01:00Z', ip: '10.20.1.44' },
        ]),
        violations_json: JSON.stringify([]),
        user_binding: '',
      },
      {
        id: 'act_002',
        license_id: 'lic_central_lab_001',
        device_id: 'device-cl-01',
        site_id: 'site-central-02',
        installation_id: 'inst-9012',
        status: 'active',
        last_seen_at: '2026-04-19T06:40:00Z',
        activation_type: 'machine',
        activated_at: '2026-04-12T09:30:00Z',
        environment_json: JSON.stringify({ ip: '10.20.2.10', hostname: 'lims-bench-02' }),
        heartbeats_json: JSON.stringify([{ at: '2026-04-19T06:40:00Z', ip: '10.20.2.10' }]),
        violations_json: JSON.stringify([
          {
            at: '2026-04-19T06:41:00Z',
            kind: 'duplicate_machine',
            detail: 'Same machine fingerprint as act_001 (device-cl-01) on this license',
          },
        ]),
        user_binding: '',
      },
      {
        id: 'act_003',
        license_id: 'lic_city_hospital_001',
        device_id: 'device-ch-01',
        site_id: 'site-hospital-west',
        installation_id: 'inst-4010',
        status: 'active',
        last_seen_at: '2026-04-19T05:22:00Z',
        activation_type: 'server',
        activated_at: '2026-03-28T15:00:00Z',
        environment_json: JSON.stringify({ ip: '192.168.40.2', hostname: 'pos-core-west' }),
        heartbeats_json: JSON.stringify([
          { at: '2026-04-19T05:22:00Z', ip: '192.168.40.2' },
          { at: '2026-04-18T05:20:00Z', ip: '192.168.40.2' },
        ]),
        violations_json: JSON.stringify([]),
        user_binding: '',
      },
      {
        id: 'act_004',
        license_id: 'lic_north_pharmacy_001',
        device_id: 'device-np-01',
        site_id: 'site-pharmacy-east',
        installation_id: 'inst-7710',
        status: 'active',
        last_seen_at: '2026-03-20T18:00:00Z',
        activation_type: 'installation',
        activated_at: '2026-03-01T10:00:00Z',
        environment_json: JSON.stringify({ ip: '172.16.8.5', hostname: 'rx-counter-1' }),
        heartbeats_json: JSON.stringify([{ at: '2026-03-20T18:00:00Z', ip: '172.16.8.5' }]),
        violations_json: JSON.stringify([
          {
            at: '2026-04-01T00:00:00Z',
            kind: 'stale_checkin',
            detail: 'No heartbeat in 30+ days while status is active',
          },
        ]),
        user_binding: '',
      },
      {
        id: 'act_005',
        license_id: 'lic_beta_workshop_001',
        device_id: 'device-bw-01',
        site_id: 'site-bw-lab',
        installation_id: 'inst-3012',
        status: 'active',
        last_seen_at: '2026-04-19T07:45:00Z',
        activation_type: 'user',
        activated_at: '2026-04-16T09:18:00Z',
        environment_json: JSON.stringify({ ip: '10.99.0.3', client: 'BitLimbs CLI' }),
        heartbeats_json: JSON.stringify([{ at: '2026-04-19T07:45:00Z', ip: '10.99.0.3' }]),
        violations_json: JSON.stringify([]),
        user_binding: 'dev@beta-workshop.local',
      },
      {
        id: 'act_006',
        license_id: 'lic_central_lab_001',
        device_id: 'device-cl-mobile',
        site_id: 'site-roaming',
        installation_id: 'inst-roam-1',
        status: 'active',
        last_seen_at: '2026-04-19T04:10:00Z',
        activation_type: 'site',
        activated_at: '2026-04-18T20:00:00Z',
        environment_json: JSON.stringify({ ip: '203.0.113.10', note: 'VPN egress' }),
        heartbeats_json: JSON.stringify([{ at: '2026-04-19T04:10:00Z', ip: '203.0.113.10' }]),
        violations_json: JSON.stringify([]),
        user_binding: '',
      },
      {
        id: 'act_007',
        license_id: 'lic_north_pharmacy_001',
        device_id: 'device-np-02',
        site_id: 'site-pharmacy-north',
        installation_id: 'inst-7711',
        status: 'exceeded',
        last_seen_at: '2026-04-19T01:00:00Z',
        activation_type: 'machine',
        activated_at: '2026-04-19T00:55:00Z',
        environment_json: JSON.stringify({ ip: '172.16.8.6' }),
        heartbeats_json: JSON.stringify([{ at: '2026-04-19T01:00:00Z', ip: '172.16.8.6' }]),
        violations_json: JSON.stringify([
          {
            at: '2026-04-19T00:56:00Z',
            kind: 'exceeded_cap',
            detail: 'License max activations is 2; this seat was flagged when a third binding was attempted',
          },
        ]),
        user_binding: '',
      },
    ],
  ),
  insertRows(
    'usage_records',
    [
      'id',
      'subscriber_id',
      'product_id',
      'metric',
      'value',
      'limit_value',
      'period',
      'period_key',
      'status',
      'recorded_at',
      'warning_threshold_percent',
      'enforcement',
      'source',
    ],
    [
      {
        id: 'usage_001',
        subscriber_id: 'tenant_central_lab',
        product_id: 'prd_beak_lims',
        metric: 'users',
        value: 38,
        limit_value: 45,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'hard',
        source: 'identity_provider.daily_active_users',
      },
      {
        id: 'usage_002',
        subscriber_id: 'tenant_central_lab',
        product_id: 'prd_beak_lims',
        metric: 'api_calls_per_month',
        value: 71250,
        limit_value: 100000,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 85,
        enforcement: 'hard',
        source: 'api_gateway.request_count',
      },
      {
        id: 'usage_003',
        subscriber_id: 'tenant_central_lab',
        product_id: 'prd_beak_lims',
        metric: 'storage_gb',
        value: 420,
        limit_value: 600,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'advisory',
        source: 'object_store.bucket_metrics',
      },
      {
        id: 'usage_004',
        subscriber_id: 'tenant_central_lab',
        product_id: 'prd_beak_lims',
        metric: 'lab_tests_per_month',
        value: 118_200,
        limit_value: 150_000,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'hard',
        source: 'lims.pipeline.completed_tests',
      },
      {
        id: 'usage_005',
        subscriber_id: 'tenant_city_hospital',
        product_id: 'prd_beak_pos',
        metric: 'users',
        value: 211,
        limit_value: 250,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'hard',
        source: 'pos.cloud_seat_allocations',
      },
      {
        id: 'usage_006',
        subscriber_id: 'tenant_city_hospital',
        product_id: 'prd_beak_pos',
        metric: 'branches',
        value: 6,
        limit_value: 8,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 75,
        enforcement: 'hard',
        source: 'license.branch_entitlements',
      },
      {
        id: 'usage_007',
        subscriber_id: 'tenant_city_hospital',
        product_id: 'prd_beak_pos',
        metric: 'sites',
        value: 14,
        limit_value: 20,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'advisory',
        source: 'activation.registry.site_ids',
      },
      {
        id: 'usage_008',
        subscriber_id: 'tenant_city_hospital',
        product_id: 'prd_beak_pos',
        metric: 'api_calls_per_month',
        value: 402_000,
        limit_value: 500000,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 85,
        enforcement: 'hard',
        source: 'api_gateway.request_count',
      },
      {
        id: 'usage_009',
        subscriber_id: 'tenant_city_hospital',
        product_id: 'prd_beak_pos',
        metric: 'pos_orders_per_month',
        value: 890_400,
        limit_value: 1_000_000,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'hard',
        source: 'pos.sync.order_ledger',
      },
      {
        id: 'usage_010',
        subscriber_id: 'tenant_city_hospital',
        product_id: 'prd_beak_lims',
        metric: 'storage_gb',
        value: 5200,
        limit_value: 5000,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'critical',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'hard',
        source: 'object_store.bucket_metrics',
      },
      {
        id: 'usage_011',
        subscriber_id: 'tenant_north_pharmacy',
        product_id: 'prd_beak_pos',
        metric: 'users',
        value: 22,
        limit_value: 25,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'warning',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'hard',
        source: 'identity_provider.daily_active_users',
      },
      {
        id: 'usage_012',
        subscriber_id: 'tenant_north_pharmacy',
        product_id: 'prd_beak_pos',
        metric: 'branches',
        value: 3,
        limit_value: 5,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'hard',
        source: 'license.branch_entitlements',
      },
      {
        id: 'usage_013',
        subscriber_id: 'tenant_north_pharmacy',
        product_id: 'prd_beak_pos',
        metric: 'api_calls_per_month',
        value: 18_200,
        limit_value: 25000,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 85,
        enforcement: 'hard',
        source: 'api_gateway.request_count',
      },
      {
        id: 'usage_014',
        subscriber_id: 'tenant_beta_workshop',
        product_id: 'prd_bitlimbs',
        metric: 'api_calls_per_month',
        value: 84200,
        limit_value: 100000,
        period: 'April 2026',
        period_key: '2026-04',
        status: 'healthy',
        recorded_at: '2026-04-19T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'advisory',
        source: 'platform.telemetry.ingest',
      },
      {
        id: 'usage_hist_001',
        subscriber_id: 'tenant_central_lab',
        product_id: 'prd_beak_lims',
        metric: 'users',
        value: 35,
        limit_value: 45,
        period: 'March 2026',
        period_key: '2026-03',
        status: 'healthy',
        recorded_at: '2026-03-31T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'hard',
        source: 'identity_provider.daily_active_users',
      },
      {
        id: 'usage_hist_002',
        subscriber_id: 'tenant_central_lab',
        product_id: 'prd_beak_lims',
        metric: 'api_calls_per_month',
        value: 68_100,
        limit_value: 100000,
        period: 'March 2026',
        period_key: '2026-03',
        status: 'healthy',
        recorded_at: '2026-03-31T08:00:00Z',
        warning_threshold_percent: 85,
        enforcement: 'hard',
        source: 'api_gateway.request_count',
      },
      {
        id: 'usage_hist_003',
        subscriber_id: 'tenant_city_hospital',
        product_id: 'prd_beak_pos',
        metric: 'pos_orders_per_month',
        value: 812_000,
        limit_value: 1_000_000,
        period: 'March 2026',
        period_key: '2026-03',
        status: 'healthy',
        recorded_at: '2026-03-31T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'hard',
        source: 'pos.sync.order_ledger',
      },
      {
        id: 'usage_hist_004',
        subscriber_id: 'tenant_city_hospital',
        product_id: 'prd_beak_lims',
        metric: 'storage_gb',
        value: 4100,
        limit_value: 5000,
        period: 'March 2026',
        period_key: '2026-03',
        status: 'warning',
        recorded_at: '2026-03-31T08:00:00Z',
        warning_threshold_percent: 80,
        enforcement: 'hard',
        source: 'object_store.bucket_metrics',
      },
    ],
  ),
  insertRows(
    'billing_events',
    [
      'id',
      'provider',
      'subscriber_id',
      'subscription_id',
      'event_type',
      'amount_cents',
      'currency',
      'occurred_at',
      'payload_json',
      'processing_status',
      'processed_at',
      'retry_count',
      'normalized_json',
      'processing_logs_json',
      'error_json',
      'impacted_records_json',
    ],
    [
      {
        id: 'bevt_001',
        provider: 'stripe',
        subscriber_id: 'tenant_central_lab',
        subscription_id: 'sub_central_lab',
        event_type: 'invoice_paid',
        amount_cents: 85000,
        currency: 'USD',
        occurred_at: '2026-04-18T10:00:00Z',
        payload_json: JSON.stringify({
          id: 'evt_stripe_001',
          type: 'invoice.paid',
          data: { object: { id: 'inv_8821', amount_paid: 85000, currency: 'usd' } },
        }),
        processing_status: 'processed',
        processed_at: '2026-04-18T10:00:12Z',
        retry_count: 0,
        normalized_json: JSON.stringify({
          kind: 'invoice_paid',
          providerRef: 'inv_8821',
          amountCents: 85000,
          currency: 'USD',
          subscriptionProviderRef: 'sub_stripe_central',
        }),
        processing_logs_json: JSON.stringify([
          { at: '2026-04-18T10:00:05Z', level: 'info', message: 'Webhook signature verified' },
          { at: '2026-04-18T10:00:12Z', level: 'info', message: 'Subscription renewal_at bumped; entitlement sync queued' },
        ]),
        error_json: '',
        impacted_records_json: JSON.stringify([
          { type: 'subscription', id: 'sub_central_lab', label: 'Central Lab · LIMS Pro' },
          { type: 'entitlement', id: 'ent_central_lab_lims', label: 'tenant_central_lab / prd_beak_lims' },
        ]),
      },
      {
        id: 'bevt_002',
        provider: 'manual',
        subscriber_id: 'tenant_city_hospital',
        subscription_id: 'sub_city_hospital',
        event_type: 'contract_renewed',
        amount_cents: 720000,
        currency: 'USD',
        occurred_at: '2026-04-17T10:00:00Z',
        payload_json: JSON.stringify({ contract: 'contract_ch_009', signedBy: 'finance@cityhospital.org' }),
        processing_status: 'processed',
        processed_at: '2026-04-17T10:02:00Z',
        retry_count: 0,
        normalized_json: JSON.stringify({
          kind: 'contract_renewed',
          contractId: 'contract_ch_009',
          amountCents: 720000,
          currency: 'USD',
        }),
        processing_logs_json: JSON.stringify([
          { at: '2026-04-17T10:01:40Z', level: 'info', message: 'Manual renewal recorded from CRM export' },
        ]),
        error_json: '',
        impacted_records_json: JSON.stringify([
          { type: 'subscription', id: 'sub_city_hospital', label: 'City Hospital · Enterprise bundle' },
        ]),
      },
      {
        id: 'bevt_003',
        provider: 'paynow',
        subscriber_id: 'tenant_north_pharmacy',
        subscription_id: 'sub_north_pharmacy',
        event_type: 'trial_started',
        amount_cents: 0,
        currency: 'USD',
        occurred_at: '2026-04-10T10:00:00Z',
        payload_json: JSON.stringify({ trial_days: 30, checkout_session: 'cs_pn_9a2' }),
        processing_status: 'processed',
        processed_at: '2026-04-10T10:00:04Z',
        retry_count: 0,
        normalized_json: JSON.stringify({
          kind: 'trial_started',
          trialDays: 30,
          subscriptionProviderRef: 'sub_paynow_np',
        }),
        processing_logs_json: JSON.stringify([
          { at: '2026-04-10T10:00:04Z', level: 'info', message: 'Trial window applied to subscription' },
        ]),
        error_json: '',
        impacted_records_json: JSON.stringify([{ type: 'subscription', id: 'sub_north_pharmacy', label: 'North Pharmacy' }]),
      },
      {
        id: 'bevt_004',
        provider: 'manual',
        subscriber_id: 'tenant_beta_workshop',
        subscription_id: 'sub_beta_workshop',
        event_type: 'license_issued',
        amount_cents: 120000,
        currency: 'USD',
        occurred_at: '2026-04-01T10:00:00Z',
        payload_json: JSON.stringify({ license: 'lic_beta_workshop_001', sku: 'pos_pro_offline' }),
        processing_status: 'ignored',
        processed_at: '2026-04-01T10:00:01Z',
        retry_count: 0,
        normalized_json: JSON.stringify({ kind: 'license_issued', licenseKey: 'lic_beta_workshop_001' }),
        processing_logs_json: JSON.stringify([
          {
            at: '2026-04-01T10:00:01Z',
            level: 'warn',
            message: 'Ignored: license lifecycle is owned by license-service, not billing ingest',
          },
        ]),
        error_json: '',
        impacted_records_json: JSON.stringify([]),
      },
      {
        id: 'bevt_005',
        provider: 'stripe',
        subscriber_id: 'tenant_city_hospital',
        subscription_id: 'sub_city_hospital_lims',
        event_type: 'invoice_payment_failed',
        amount_cents: 35000,
        currency: 'USD',
        occurred_at: '2026-04-12T09:00:00Z',
        payload_json: JSON.stringify({
          id: 'evt_stripe_fail_1',
          type: 'invoice.payment_failed',
          data: { object: { id: 'inv_ch_lims_04', attempt_count: 2, next_payment_attempt: null } },
        }),
        processing_status: 'failed',
        processed_at: '',
        retry_count: 2,
        normalized_json: JSON.stringify({
          kind: 'invoice_payment_failed',
          providerRef: 'inv_ch_lims_04',
          amountCents: 35000,
          currency: 'USD',
        }),
        processing_logs_json: JSON.stringify([
          { at: '2026-04-12T09:00:02Z', level: 'info', message: 'Mapped subscriber via customer metadata' },
          {
            at: '2026-04-12T09:00:03Z',
            level: 'error',
            message: 'Entitlement recompute failed: plan limit row locked',
          },
        ]),
        error_json: JSON.stringify({
          code: 'ENTITLEMENT_RECOMPUTE_DEADLOCK',
          message: 'SQLite busy: entitlement write blocked',
          stack: 'EntitlementService.applyInvoiceFailure (synthetic)',
        }),
        impacted_records_json: JSON.stringify([
          { type: 'subscription', id: 'sub_city_hospital_lims', label: 'City Hospital · LIMS Starter' },
        ]),
      },
      {
        id: 'bevt_006',
        provider: 'stripe',
        subscriber_id: 'tenant_north_pharmacy',
        subscription_id: 'sub_north_pharmacy',
        event_type: 'customer.subscription.updated',
        amount_cents: 0,
        currency: 'USD',
        occurred_at: '2026-04-19T11:15:00Z',
        payload_json: JSON.stringify({
          id: 'evt_stripe_pending_1',
          type: 'customer.subscription.updated',
          pending_webhooks: true,
        }),
        processing_status: 'received',
        processed_at: '',
        retry_count: 0,
        normalized_json: JSON.stringify({}),
        processing_logs_json: JSON.stringify([
          { at: '2026-04-19T11:15:00Z', level: 'info', message: 'Persisted raw event; normalization queued' },
        ]),
        error_json: '',
        impacted_records_json: JSON.stringify([]),
      },
    ],
  ),
  insertRows(
    'audit_logs',
    [
      'id',
      'subscriber_id',
      'actor',
      'action',
      'resource_type',
      'resource_id',
      'resource_name',
      'source',
      'result',
      'details_json',
      'created_at',
    ],
    [
      {
        id: 'aud_001',
        subscriber_id: null,
        actor: 'admin@beak.local',
        action: 'product.created',
        resource_type: 'product',
        resource_id: 'prd_beak_lims',
        resource_name: 'Beak LIMS',
        source: 'ui',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'New hybrid LIMS product registered in the catalog with subscription default billing.',
          before: null,
          after: { slug: 'beak-lims', status: 'active', product_type: 'hybrid' },
          request: {
            method: 'POST',
            path: '/api/products',
            requestId: 'req_prod_7f3a',
            ip: '10.0.4.12',
            userAgent: 'Mozilla/5.0 (ControlPlane/1.2)',
          },
        }),
        created_at: '2026-04-19T10:12:00Z',
      },
      {
        id: 'aud_002',
        subscriber_id: null,
        actor: 'ops-api@beak.local',
        action: 'plan.updated',
        resource_type: 'plan',
        resource_id: 'plan_pos_enterprise',
        resource_name: 'Enterprise',
        source: 'api',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Enterprise POS annual list price adjusted after contract renewal terms.',
          before: { price_cents: 690000, billing_cycle: 'annual', currency: 'USD' },
          after: { price_cents: 720000, billing_cycle: 'annual', currency: 'USD' },
          changedFields: [{ path: 'price_cents', before: 690000, after: 720000 }],
          request: {
            method: 'PATCH',
            path: '/api/plans/plan_pos_enterprise',
            requestId: 'req_plan_91bc',
            ip: '10.0.1.88',
          },
        }),
        created_at: '2026-04-19T09:40:00Z',
      },
      {
        id: 'aud_003',
        subscriber_id: null,
        actor: 'catalog-worker',
        action: 'plan.feature_added',
        resource_type: 'plan',
        resource_id: 'plan_lims_pro',
        resource_name: 'Pro',
        source: 'job',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Feature “Advanced reports” attached to LIMS Pro with default enabled state.',
          before: { featureIds: ['feat_reports', 'feat_inventory'] },
          after: { featureIds: ['feat_reports', 'feat_inventory', 'feat_reports_adv'] },
          changedFields: [
            { path: 'featureIds', before: ['feat_reports', 'feat_inventory'], after: ['feat_reports', 'feat_inventory', 'feat_reports_adv'] },
          ],
          request: { job: 'plan-feature-sync', runId: 'run_8ccd' },
        }),
        created_at: '2026-04-19T09:05:00Z',
      },
      {
        id: 'aud_feat_001',
        subscriber_id: null,
        actor: 'admin@beak.local',
        action: 'catalog.feature_updated',
        resource_type: 'feature',
        resource_id: 'feat_ai_copilot',
        resource_name: 'AI copilot',
        source: 'ui',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Visibility set to beta; mutually exclusive with legacy assist.',
          featureId: 'feat_ai_copilot',
          changedFields: [{ path: 'visibility', before: 'internal', after: 'beta' }],
        }),
        created_at: '2026-04-19T08:50:00Z',
      },
      {
        id: 'aud_feat_002',
        subscriber_id: null,
        actor: 'catalog-worker',
        action: 'catalog.feature_created',
        resource_type: 'feature',
        resource_id: 'feat_pos_offline',
        resource_name: 'POS offline mode',
        source: 'job',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'New POS module registered with enterprise visibility.',
          featureId: 'feat_pos_offline',
        }),
        created_at: '2026-04-18T20:15:00Z',
      },
      {
        id: 'aud_004',
        subscriber_id: 'tenant_sunset_boutique',
        actor: 'stripe',
        action: 'subscription.canceled',
        resource_type: 'subscription',
        resource_id: 'sub_sunset_boutique',
        resource_name: 'Sunset Boutique · POS Pro',
        source: 'webhook',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Subscription canceled at period end per organization workspace request.',
          before: { status: 'active', cancel_at_period_end: false },
          after: { status: 'canceled', cancel_at_period_end: true, ended_at: '2026-04-18T23:59:59Z' },
          changedFields: [
            { path: 'status', before: 'active', after: 'canceled' },
            { path: 'cancel_at_period_end', before: false, after: true },
          ],
          request: { webhookId: 'whk_44aa', eventType: 'customer.subscription.deleted', stripeEventId: 'evt_02sunset' },
        }),
        created_at: '2026-04-18T18:22:00Z',
      },
      {
        id: 'aud_005',
        subscriber_id: 'tenant_city_hospital',
        actor: 'license-issuer',
        action: 'license.generated',
        resource_type: 'license',
        resource_id: 'lic_city_hospital_001',
        resource_name: 'City Hospital offline seat pack',
        source: 'job',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Offline license issued with six activations for regulated deployment.',
          before: null,
          after: { mode: 'offline', maxActivations: 6, productId: 'prd_beak_lims' },
          request: { job: 'license-batch', batchId: 'batch_19fa' },
        }),
        created_at: '2026-04-18T14:10:00Z',
      },
      {
        id: 'aud_ent_hist_001',
        subscriber_id: 'tenant_central_lab',
        actor: 'entitlement-engine',
        action: 'entitlement.recomputed',
        resource_type: 'entitlement',
        resource_id: 'ent_central_lab_lims',
        resource_name: 'Central Lab · LIMS',
        source: 'job',
        result: 'success',
        details_json: JSON.stringify({ reason: 'subscription_cycle', planId: 'plan_lims_pro' }),
        created_at: '2026-04-19T08:05:00Z',
      },
      {
        id: 'aud_ent_hist_002',
        subscriber_id: 'tenant_city_hospital',
        actor: 'entitlement-engine',
        action: 'entitlement.recomputed',
        resource_type: 'entitlement',
        resource_id: 'ent_city_hospital_pos',
        resource_name: 'City Hospital · POS',
        source: 'job',
        result: 'success',
        details_json: JSON.stringify({ reason: 'plan_catalog_sync', planId: 'plan_pos_enterprise' }),
        created_at: '2026-04-18T22:40:00Z',
      },
      {
        id: 'aud_ent_hist_003',
        subscriber_id: 'tenant_north_pharmacy',
        actor: 'entitlement-engine',
        action: 'entitlement.recomputed',
        resource_type: 'entitlement',
        resource_id: 'ent_north_pharmacy_pos',
        resource_name: 'North Pharmacy · POS',
        source: 'job',
        result: 'success',
        details_json: JSON.stringify({ reason: 'trial_conversion_check', planId: 'plan_pos_pro' }),
        created_at: '2026-04-17T09:12:00Z',
      },
      {
        id: 'aud_006',
        subscriber_id: 'tenant_beta_workshop',
        actor: 'device-admin@beta.workshop',
        action: 'activation.released',
        resource_type: 'activation',
        resource_id: 'act_005',
        resource_name: 'device-bw-01',
        source: 'api',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Activation slot released after decommissioned kiosk teardown.',
          before: { status: 'active', deviceId: 'device-bw-01' },
          after: { status: 'released', deviceId: 'device-bw-01', releasedReason: 'hardware_retired' },
          changedFields: [{ path: 'status', before: 'active', after: 'released' }],
          request: {
            method: 'POST',
            path: '/api/licenses/lic_beta_workshop_001/activations/release',
            requestId: 'req_act_2201',
            ip: '192.168.44.2',
          },
        }),
        created_at: '2026-04-17T16:45:00Z',
      },
      {
        id: 'aud_007',
        subscriber_id: 'tenant_central_lab',
        actor: 'admin@beak.local',
        action: 'entitlement.override_applied',
        resource_type: 'entitlement',
        resource_id: 'ent_central_lab_lims',
        resource_name: 'Central Lab · LIMS',
        source: 'ui',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Temporary module override granted for HL7 connector during migration window.',
          before: { modules: { hl7: false }, limits: { api_calls: 10000 } },
          after: { modules: { hl7: true }, limits: { api_calls: 10000 } },
          changedFields: [{ path: 'modules.hl7', before: false, after: true }],
          request: {
            method: 'PUT',
            path: '/api/subscribers/tenant_central_lab/entitlements/override',
            requestId: 'req_ent_9931',
            ip: '10.0.4.12',
          },
        }),
        created_at: '2026-04-17T11:05:00Z',
      },
      {
        id: 'aud_008',
        subscriber_id: 'tenant_north_pharmacy',
        actor: 'integrations@beak.local',
        action: 'billing.sync',
        resource_type: 'billing_event',
        resource_id: 'bevt_003',
        resource_name: 'PayNow trial_started',
        source: 'api',
        result: 'failure',
        details_json: JSON.stringify({
          summary: 'Idempotent replay rejected: billing event fingerprint already processed.',
          before: null,
          after: null,
          request: { method: 'POST', path: '/internal/billing/events', requestId: 'req_bill_fail_01' },
          error: { code: 'DUPLICATE_EVENT', message: 'Event bevt_003 was applied at 2026-04-10T10:00:00Z' },
        }),
        created_at: '2026-04-16T20:01:00Z',
      },
      {
        id: 'aud_lic_dl_001',
        subscriber_id: 'tenant_central_lab',
        actor: 'admin@beak.local',
        action: 'license.payload_downloaded',
        resource_type: 'license',
        resource_id: 'lic_central_lab_001',
        resource_name: 'BCP-LIMS-PRO-CLG-001',
        source: 'ui',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Operator exported signed JSON for air-gapped verifier.',
          format: 'json',
          bytes: 2140,
        }),
        created_at: '2026-04-18T14:22:00Z',
      },
      {
        id: 'aud_lic_regen_001',
        subscriber_id: 'tenant_central_lab',
        actor: 'license-issuer',
        action: 'license.regenerated',
        resource_type: 'license',
        resource_id: 'lic_central_lab_001',
        resource_name: 'BCP-LIMS-PRO-CLG-001',
        source: 'job',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Cryptographic material rotated; payload revision incremented.',
          before: { revision: 1 },
          after: { revision: 2 },
        }),
        created_at: '2026-04-15T09:00:00Z',
      },
      {
        id: 'aud_lic_dl_002',
        subscriber_id: 'tenant_north_pharmacy',
        actor: 'integrations@beak.local',
        action: 'license.payload_downloaded',
        resource_type: 'license',
        resource_id: 'lic_north_pharmacy_001',
        resource_name: 'BCP-POS-PRO-NPH-001',
        source: 'api',
        result: 'success',
        details_json: JSON.stringify({ summary: 'POS bundle pulled by edge updater.', format: 'json' }),
        created_at: '2026-04-17T08:30:00Z',
      },
      {
        id: 'aud_sub_001',
        subscriber_id: 'tenant_central_lab',
        actor: 'billing-gateway',
        action: 'subscription.status_changed',
        resource_type: 'subscription',
        resource_id: 'sub_central_lab',
        resource_name: 'Central Lab subscription',
        source: 'webhook',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Subscription moved from trialing to active after first invoice paid.',
          before: { status: 'trialing' },
          after: { status: 'active' },
          changedFields: [{ path: 'status', before: 'trialing', after: 'active' }],
          request: { eventType: 'invoice.paid', provider: 'stripe' },
        }),
        created_at: '2026-04-02T14:00:00Z',
      },
      {
        id: 'aud_sub_002',
        subscriber_id: 'tenant_city_hospital',
        actor: 'admin@beak.local',
        action: 'subscription.plan_assigned',
        resource_type: 'subscription',
        resource_id: 'sub_city_hospital_lims',
        resource_name: 'City Hospital LIMS',
        source: 'ui',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Starter plan pinned for pilot department before enterprise renewal.',
          planId: 'plan_lims_starter',
          note: 'Pilot department rollout',
        }),
        created_at: '2025-10-01T11:00:00Z',
      },
      {
        id: 'aud_sub_003',
        subscriber_id: 'tenant_city_hospital',
        actor: 'stripe',
        action: 'subscription.past_due',
        resource_type: 'subscription',
        resource_id: 'sub_city_hospital_lims',
        resource_name: 'City Hospital LIMS',
        source: 'webhook',
        result: 'success',
        details_json: JSON.stringify({
          summary: 'Invoice payment failed; subscription marked past_due.',
          reason: 'card_declined',
          invoice: 'inv_ch_lims_04',
        }),
        created_at: '2026-04-12T09:05:00Z',
      },
    ],
  ),
]

let bootstrapPromise: Promise<void> | null = null
let databaseClient: Client | null = null

export function getDatabaseClient() {
  if (databaseClient) {
    return databaseClient
  }

  const runtimeConfig = useRuntimeConfig()
  const dbFileName = String(runtimeConfig.dbFileName || 'file:./data/beak-control-pane.db')
  const filePath = dbFileName.startsWith('file:') ? dbFileName.slice(5) : null

  if (filePath) {
    const directory = dirname(filePath)

    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
    }
  }

  databaseClient = createClient({ url: dbFileName })

  return databaseClient
}

export async function bootstrapDatabase(client: Client) {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      for (const statement of bootstrapStatements) {
        if (statement.trimStart().startsWith('INSERT')) {
          continue
        }
        await client.execute(statement)
      }

      await migrateOrganizationsTable(client)
      await migrateAuthTables(client)
      await migrateProductsTable(client)
      await migrateDatabaseSchema(client)
      await migrateActivationsTable(client)
      await migrateSubscribersTable(client)
      await migrateEnterpriseContractsTable(client)
      await migrateSubscriptionsTable(client)
      await migrateBillingEventsSubscriptionId(client)
      await migrateBillingEventsProcessingFields(client)
      await migrateLicensesTable(client)
    })().catch((error) => {
      bootstrapPromise = null
      throw error
    })
  }

  return bootstrapPromise
}
