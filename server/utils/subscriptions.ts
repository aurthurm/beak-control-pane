import type { Client } from '@libsql/client'
import type { PlanRow, SubscriptionRow, TenantRow } from '../db/schema'

export type SubscriptionAddOn = { id: string; name: string; amountCents: number }

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'expired',
] as const

export function parseAddOns(json: string): SubscriptionAddOn[] {
  try {
    const v = JSON.parse(json) as unknown
    if (!Array.isArray(v)) return []
    return v
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const r = row as Record<string, unknown>
        const id = typeof r.id === 'string' ? r.id : ''
        const name = typeof r.name === 'string' ? r.name : ''
        const amountCents = typeof r.amountCents === 'number' ? r.amountCents : Number(r.amountCents)
        if (!id || !name || !Number.isFinite(amountCents)) return null
        return { id, name, amountCents: Math.round(amountCents) }
      })
      .filter((x): x is SubscriptionAddOn => x !== null)
  } catch {
    return []
  }
}

export function parseProviderMetadata(json: string): Record<string, string> {
  try {
    const v = JSON.parse(json) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'string') out[k] = val
      else out[k] = JSON.stringify(val)
    }
    return out
  } catch {
    return {}
  }
}

export function effectiveSubscriptionPricing(
  sub: {
    amountOverrideCents: number | null
    currencyOverride: string
    addOnsJson: string
    licenseCount: number
    activationsPerLicense: number
  },
  plan: Pick<PlanRow, 'priceCents' | 'currency' | 'billingCycle'>,
) {
  const addOns = parseAddOns(sub.addOnsJson)
  const addOnTotal = addOns.reduce((s, a) => s + a.amountCents, 0)
  const base = sub.amountOverrideCents != null ? sub.amountOverrideCents : plan.priceCents
  const licenseCount = Math.max(1, Math.floor(Number(sub.licenseCount) || 1))
  const activationsPerLicense = Math.max(1, Math.floor(Number(sub.activationsPerLicense) || 1))
  const currency = sub.currencyOverride?.trim() ? sub.currencyOverride : plan.currency
  const unitAmountCents = base + addOnTotal
  return {
    amountCents: unitAmountCents * licenseCount,
    baseCents: base,
    addOnTotalCents: addOnTotal,
    unitAmountCents,
    licenseCount,
    activationsPerLicense,
    currency,
    billingInterval: plan.billingCycle,
  }
}

export async function migrateSubscriptionsTable(client: Client) {
  const info = await client.execute('PRAGMA table_info(subscriptions)')
  const nameIdx = info.columns.indexOf('name')
  const columns = new Set(
    info.rows.map((r) => (nameIdx >= 0 ? String(r[nameIdx]) : String((r as Record<string, unknown>).name ?? ''))),
  )

  const addColumn = async (sql: string) => {
    await client.execute(sql)
  }

  if (!columns.has('grace_ends_at')) {
    await addColumn(`ALTER TABLE subscriptions ADD COLUMN grace_ends_at TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('auto_renew')) {
    await addColumn(`ALTER TABLE subscriptions ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 1`)
  }

  if (!columns.has('license_count')) {
    await addColumn(`ALTER TABLE subscriptions ADD COLUMN license_count INTEGER NOT NULL DEFAULT 1`)
  }

  if (!columns.has('activations_per_license')) {
    await addColumn(`ALTER TABLE subscriptions ADD COLUMN activations_per_license INTEGER NOT NULL DEFAULT 1`)
  }

  if (!columns.has('amount_override_cents')) {
    await addColumn('ALTER TABLE subscriptions ADD COLUMN amount_override_cents INTEGER')
  }

  if (!columns.has('currency_override')) {
    await addColumn(`ALTER TABLE subscriptions ADD COLUMN currency_override TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('add_ons_json')) {
    await addColumn(`ALTER TABLE subscriptions ADD COLUMN add_ons_json TEXT NOT NULL DEFAULT '[]'`)
  }

  if (!columns.has('manual_contract')) {
    await addColumn(`ALTER TABLE subscriptions ADD COLUMN manual_contract INTEGER NOT NULL DEFAULT 0`)
  }

  if (!columns.has('paused_at')) {
    await addColumn(`ALTER TABLE subscriptions ADD COLUMN paused_at TEXT NOT NULL DEFAULT ''`)
  }

  if (!columns.has('provider_metadata_json')) {
    await addColumn(`ALTER TABLE subscriptions ADD COLUMN provider_metadata_json TEXT NOT NULL DEFAULT '{}'`)
  }
}

export async function migrateLicensesTable(client: Client) {
  const info = await client.execute('PRAGMA table_info(licenses)')
  const nameIdx = info.columns.indexOf('name')
  const columns = new Set(
    info.rows.map((r) => (nameIdx >= 0 ? String(r[nameIdx]) : String((r as Record<string, unknown>).name ?? ''))),
  )

  if (!columns.has('subscription_id')) {
    await client.execute('ALTER TABLE licenses ADD COLUMN subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL')
  }
}

export async function migrateBillingEventsSubscriptionId(client: Client) {
  const info = await client.execute('PRAGMA table_info(billing_events)')
  const nameIdx = info.columns.indexOf('name')
  const columns = new Set(
    info.rows.map((r) => (nameIdx >= 0 ? String(r[nameIdx]) : String((r as Record<string, unknown>).name ?? ''))),
  )

  if (!columns.has('subscription_id')) {
    await client.execute('ALTER TABLE billing_events ADD COLUMN subscription_id TEXT')
  }
}

export async function migrateBillingEventsProcessingFields(client: Client) {
  const info = await client.execute('PRAGMA table_info(billing_events)')
  const nameIdx = info.columns.indexOf('name')
  const columns = new Set(
    info.rows.map((r) => (nameIdx >= 0 ? String(r[nameIdx]) : String((r as Record<string, unknown>).name ?? ''))),
  )

  if (!columns.has('processing_status')) {
    await client.execute(
      `ALTER TABLE billing_events ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'processed'`,
    )
  }
  if (!columns.has('processed_at')) {
    await client.execute(`ALTER TABLE billing_events ADD COLUMN processed_at TEXT NOT NULL DEFAULT ''`)
  }
  if (!columns.has('retry_count')) {
    await client.execute(`ALTER TABLE billing_events ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`)
  }
  if (!columns.has('normalized_json')) {
    await client.execute(`ALTER TABLE billing_events ADD COLUMN normalized_json TEXT NOT NULL DEFAULT '{}'`)
  }
  if (!columns.has('processing_logs_json')) {
    await client.execute(`ALTER TABLE billing_events ADD COLUMN processing_logs_json TEXT NOT NULL DEFAULT '[]'`)
  }
  if (!columns.has('error_json')) {
    await client.execute(`ALTER TABLE billing_events ADD COLUMN error_json TEXT NOT NULL DEFAULT ''`)
  }
  if (!columns.has('impacted_records_json')) {
    await client.execute(`ALTER TABLE billing_events ADD COLUMN impacted_records_json TEXT NOT NULL DEFAULT '[]'`)
  }
}

export function subscriptionListItem(
  subscription: SubscriptionRow,
  plan: PlanRow | undefined,
  productName: string,
  productId: string,
  subscriber: TenantRow | undefined,
) {
  const pricing = plan
    ? effectiveSubscriptionPricing(subscription, plan)
    : {
        amountCents: subscription.amountOverrideCents ?? 0,
        baseCents: subscription.amountOverrideCents ?? 0,
        addOnTotalCents: parseAddOns(subscription.addOnsJson).reduce((s, a) => s + a.amountCents, 0),
        unitAmountCents: subscription.amountOverrideCents ?? 0,
        licenseCount: Math.max(1, Math.floor(Number((subscription as { licenseCount?: number }).licenseCount) || 1)),
        activationsPerLicense: Math.max(
          1,
          Math.floor(Number((subscription as { activationsPerLicense?: number }).activationsPerLicense) || 1),
        ),
        currency: subscription.currencyOverride?.trim() ? subscription.currencyOverride : 'USD',
        billingInterval: '—',
      }

  return {
    id: subscription.id,
    subscriberId: subscription.subscriberId,
    subscriberName: subscriber?.name ?? subscription.subscriberId,
    productId,
    productName,
    planId: subscription.planId,
    planName: plan?.name ?? subscription.planId,
    provider: subscription.provider,
    providerRef: subscription.providerRef,
    providerMetadata: parseProviderMetadata(subscription.providerMetadataJson),
    status: subscription.status,
    startsAt: subscription.startsAt,
    renewalAt: subscription.renewalAt,
    endsAt: subscription.endsAt,
    graceEndsAt: subscription.graceEndsAt,
    autoRenew: subscription.autoRenew,
    manualContract: subscription.manualContract,
    pausedAt: subscription.pausedAt,
    billingInterval: pricing.billingInterval,
    amountCents: pricing.amountCents,
    unitAmountCents: pricing.unitAmountCents,
    licenseCount: pricing.licenseCount,
    activationsPerLicense: pricing.activationsPerLicense,
    currency: pricing.currency,
    basePlanAmountCents: plan?.priceCents ?? 0,
    addOns: parseAddOns(subscription.addOnsJson),
    isPaused: Boolean(subscription.pausedAt?.trim()),
  }
}

export function nextRenewalFromPlan(start: Date, billingCycle: string) {
  const d = new Date(start.getTime())
  if (billingCycle === 'annual') {
    d.setUTCFullYear(d.getUTCFullYear() + 1)
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return d
}

export function defaultContractEnd(start: Date) {
  const d = new Date(start.getTime())
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d
}
