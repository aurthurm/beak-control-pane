import { randomUUID } from 'node:crypto'
import type { Client } from '@libsql/client'
import type { SubscriptionRow } from '../db/schema'

export const PRODUCT_TYPE_KEYS = ['saas', 'on_prem', 'hybrid', 'offline_capable'] as const
export type ProductTypeKey = (typeof PRODUCT_TYPE_KEYS)[number]

export const PRODUCT_STATUS = ['active', 'draft', 'archived'] as const

export const DEFAULT_BILLING_MODES = ['subscription', 'usage', 'license', 'manual', 'hybrid_billing'] as const
export type DefaultBillingMode = (typeof DEFAULT_BILLING_MODES)[number]

export function productTypeLabel(key: string): string {
  switch (key) {
    case 'saas':
      return 'SaaS'
    case 'on_prem':
      return 'On-prem'
    case 'hybrid':
      return 'Hybrid'
    case 'offline_capable':
      return 'Offline-capable'
    default:
      return key
  }
}

export function defaultBillingModeLabel(key: string): string {
  switch (key) {
    case 'subscription':
      return 'Subscription'
    case 'usage':
      return 'Usage-based'
    case 'license':
      return 'License / perpetual'
    case 'manual':
      return 'Manual / contract'
    case 'hybrid_billing':
      return 'Hybrid billing'
    default:
      return key
  }
}

export function slugifyKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'product'
}

export function newProductId(): string {
  return `prd_${randomUUID().replace(/-/g, '').slice(0, 24)}`
}

export async function migrateProductsTable(client: Client) {
  const info = await client.execute('PRAGMA table_info(products)')
  const columns = new Set<string>()
  for (const row of info.rows) {
    const r = row as unknown
    if (r && typeof r === 'object' && 'name' in r && typeof (r as { name: unknown }).name === 'string') {
      columns.add((r as { name: string }).name)
    } else if (Array.isArray(r) && r.length > 1) {
      columns.add(String(r[1]))
    }
  }

  const addColumn = async (sql: string) => {
    await client.execute(sql)
  }

  if (!columns.has('updated_at')) {
    await addColumn('ALTER TABLE products ADD COLUMN updated_at TEXT')
    await client.execute(`UPDATE products SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''`)
  }

  if (!columns.has('product_type')) {
    await addColumn(`ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'saas'`)
  }

  if (!columns.has('default_billing_mode')) {
    await addColumn(`ALTER TABLE products ADD COLUMN default_billing_mode TEXT NOT NULL DEFAULT 'subscription'`)
  }

  if (!columns.has('offline_licenses_supported')) {
    await addColumn('ALTER TABLE products ADD COLUMN offline_licenses_supported INTEGER NOT NULL DEFAULT 0')
  }

  if (!columns.has('activations_required')) {
    await addColumn('ALTER TABLE products ADD COLUMN activations_required INTEGER NOT NULL DEFAULT 1')
  }

  if (!columns.has('usage_tracking_enabled')) {
    await addColumn('ALTER TABLE products ADD COLUMN usage_tracking_enabled INTEGER NOT NULL DEFAULT 1')
  }

  if (!columns.has('extra_details')) {
    await addColumn(`ALTER TABLE products ADD COLUMN extra_details TEXT NOT NULL DEFAULT ''`)
  }

  await client.execute(
    `UPDATE products SET updated_at = created_at WHERE updated_at IS NULL OR TRIM(COALESCE(updated_at, '')) = ''`,
  )
}

export function isSubscriptionBillingActive(status: string) {
  const normalized = status.toLowerCase()
  return normalized === 'active' || normalized === 'trialing'
}

export function monthlyNormalizedMrr(priceCents: number, billingCycle: string) {
  const cycle = billingCycle.toLowerCase()
  if (cycle === 'one-time' || cycle === 'one_time' || cycle === 'manual') {
    return 0
  }

  if (cycle === 'annual') {
    return Math.round(priceCents / 12)
  }

  return priceCents
}

export function subscriberIdsForProduct(
  productId: string,
  planIds: Set<string>,
  subscriptions: SubscriptionRow[],
  entitlementProductRows: Array<{ subscriberId: string; productId: string }>,
  licenseRows: Array<{ subscriberId: string; productId: string }>,
): Set<string> {
  const tenants = new Set<string>()
  for (const sub of subscriptions) {
    if (planIds.has(sub.planId)) {
      tenants.add(sub.subscriberId)
    }
  }
  for (const row of entitlementProductRows) {
    if (row.productId === productId) {
      tenants.add(row.subscriberId)
    }
  }
  for (const row of licenseRows) {
    if (row.productId === productId) {
      tenants.add(row.subscriberId)
    }
  }
  return tenants
}
