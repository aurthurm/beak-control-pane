import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { plansTable, subscriptionsTable, subscribersTable } from '../../db/schema'
import { insertAuditLog } from '../../utils/audit-log'
import { SUBSCRIPTION_STATUSES, defaultContractEnd, nextRenewalFromPlan, parseAddOns } from '../../utils/subscriptions'

export type CreateSubscriptionRecordInput = {
  subscriberId: string
  planId: string
  provider: string
  providerRef: string
  licenseCount?: number
  activationsPerLicense?: number
  status?: string
  startsAt?: string
  renewalAt?: string
  endsAt?: string
  graceEndsAt?: string
  autoRenew?: boolean
  manualContract?: boolean
  amountOverrideCents?: number | null
  currencyOverride?: string
  addOnsJson?: string
  providerMetadataJson?: string
}

/**
 * Persists a subscription row (manual, stripe-linked, etc.).
 */
export async function createSubscriptionRecord(
  db: LibSQLDatabase<any>,
  body: CreateSubscriptionRecordInput,
): Promise<{ id: string }> {
  const subscriberId = body.subscriberId.trim()
  const planId = body.planId.trim()
  const provider = body.provider.trim().toLowerCase()
  let providerRef = body.providerRef.trim()
  if (!providerRef && provider === 'manual') {
    providerRef = `contract_${randomUUID().slice(0, 8)}`
  }

  if (!subscriberId || !planId || !providerRef) {
    throw createError({ statusCode: 400, statusMessage: 'subscriberId, planId, and providerRef are required' })
  }

  const [subscriber] = await db.select().from(subscribersTable).where(eq(subscribersTable.id, subscriberId))
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, planId))

  if (!subscriber || !plan) {
    throw createError({ statusCode: 404, statusMessage: 'Tenant or plan not found' })
  }

  const statusRaw = body.status?.trim().toLowerCase() || 'active'
  const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : 'active'
  const licenseCount = Math.max(1, Math.floor(Number(body.licenseCount) || 1))
  const activationsPerLicense = Math.max(1, Math.floor(Number(body.activationsPerLicense) || 1))

  const start = body.startsAt ? new Date(body.startsAt) : new Date()
  if (Number.isNaN(start.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid startsAt' })
  }

  const renewalAt = body.renewalAt ? new Date(body.renewalAt) : nextRenewalFromPlan(start, plan.billingCycle)
  const endsAt = body.endsAt ? new Date(body.endsAt) : defaultContractEnd(start)
  if (Number.isNaN(renewalAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid renewalAt or endsAt' })
  }

  const manualContract = body.manualContract ?? provider === 'manual'
  const addOnsJson = JSON.stringify(body.addOnsJson?.trim() ? parseAddOns(body.addOnsJson) : [])

  let providerMetadataJson = body.providerMetadataJson?.trim() || '{}'
  try {
    JSON.parse(providerMetadataJson)
  } catch {
    providerMetadataJson = '{}'
  }

  const id = `sub_${randomUUID().replace(/-/g, '').slice(0, 12)}`

  await db.insert(subscriptionsTable).values({
    id,
    subscriberId,
    planId,
    provider,
    providerRef,
    status,
    startsAt: start.toISOString(),
    renewalAt: renewalAt.toISOString(),
    endsAt: endsAt.toISOString(),
    graceEndsAt: body.graceEndsAt?.trim() ?? '',
    autoRenew: body.autoRenew ?? true,
    licenseCount,
    activationsPerLicense,
    amountOverrideCents: body.amountOverrideCents === undefined ? null : body.amountOverrideCents,
    currencyOverride: body.currencyOverride?.trim() ?? '',
    addOnsJson,
    manualContract,
    pausedAt: '',
    providerMetadataJson,
  })

  await insertAuditLog(db, {
    subscriberId,
    actor: 'console',
    action: 'subscription.created',
    resourceType: 'subscription',
    resourceId: id,
    details: { planId, provider, status, providerRef, licenseCount, activationsPerLicense },
  })

  return { id }
}
