import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { plansTable, subscriptionsTable, type SubscriptionRow } from '../../db/schema'
import { insertAuditLog } from '../../utils/audit-log'
import { SUBSCRIPTION_STATUSES, parseAddOns, parseProviderMetadata } from '../../utils/subscriptions'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

type Body = {
  planId?: string
  status?: string
  autoRenew?: boolean
  graceEndsAt?: string | null
  renewalAt?: string
  endsAt?: string
  startsAt?: string
  amountOverrideCents?: number | null
  currencyOverride?: string | null
  licenseCount?: number
  activationsPerLicense?: number
  addOns?: Array<{ id: string; name: string; amountCents: number }>
  manualContract?: boolean
  provider?: string
  providerRef?: string
  providerMetadata?: Record<string, string>
  pause?: boolean
  cancel?: boolean
  syncProvider?: boolean
  attachManualContract?: boolean
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = event.context.params?.id?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Subscription id required' })
  }

  const body = await readBody<Body>(event)
  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id))
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Subscription not found' })
  }

  const [existingPlan] = await db.select().from(plansTable).where(eq(plansTable.id, existing.planId))
  if (!existingPlan) {
    throw createError({ statusCode: 404, statusMessage: 'Current plan not found' })
  }

  const updates: Partial<Omit<SubscriptionRow, 'id'>> = {}
  const auditDetails: Record<string, unknown> = {}

  if (body.planId !== undefined) {
    const planId = body.planId.trim()
    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, planId))
    if (!plan) {
      throw createError({ statusCode: 404, statusMessage: 'Plan not found' })
    }
    if (plan.productId !== existingPlan.productId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Plan must belong to the same product as the current subscription',
      })
    }
    updates.planId = planId
    auditDetails.planId = { from: existing.planId, to: planId }
  }

  if (body.status !== undefined) {
    const s = body.status.trim().toLowerCase()
    if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(s)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid status: ${s}` })
    }
    updates.status = s
    auditDetails.status = { from: existing.status, to: s }
  }

  if (body.autoRenew !== undefined) {
    updates.autoRenew = body.autoRenew
    auditDetails.autoRenew = body.autoRenew
  }

  if (body.graceEndsAt !== undefined) {
    updates.graceEndsAt = body.graceEndsAt === null || body.graceEndsAt === '' ? '' : body.graceEndsAt
    auditDetails.graceEndsAt = updates.graceEndsAt
  }

  if (body.renewalAt !== undefined) {
    const d = new Date(body.renewalAt)
    if (Number.isNaN(d.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid renewalAt' })
    }
    updates.renewalAt = d.toISOString()
    auditDetails.renewalAt = updates.renewalAt
  }

  if (body.endsAt !== undefined) {
    const d = new Date(body.endsAt)
    if (Number.isNaN(d.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid endsAt' })
    }
    updates.endsAt = d.toISOString()
    auditDetails.endsAt = updates.endsAt
  }

  if (body.startsAt !== undefined) {
    const d = new Date(body.startsAt)
    if (Number.isNaN(d.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid startsAt' })
    }
    updates.startsAt = d.toISOString()
    auditDetails.startsAt = updates.startsAt
  }

  if (body.amountOverrideCents !== undefined) {
    updates.amountOverrideCents = body.amountOverrideCents
    auditDetails.amountOverrideCents = body.amountOverrideCents
  }

  if (body.licenseCount !== undefined) {
    const n = Math.max(1, Math.floor(Number(body.licenseCount) || 1))
    updates.licenseCount = n
    auditDetails.licenseCount = n
  }

  if (body.activationsPerLicense !== undefined) {
    const n = Math.max(1, Math.floor(Number(body.activationsPerLicense) || 1))
    updates.activationsPerLicense = n
    auditDetails.activationsPerLicense = n
  }

  if (body.currencyOverride !== undefined) {
    updates.currencyOverride = body.currencyOverride?.trim() ?? ''
    auditDetails.currencyOverride = updates.currencyOverride
  }

  if (body.addOns !== undefined) {
    const normalized = body.addOns
      .map((a) => ({
        id: String(a.id ?? '').trim(),
        name: String(a.name ?? '').trim(),
        amountCents: Math.round(Number(a.amountCents)),
      }))
      .filter((a) => a.id && a.name && Number.isFinite(a.amountCents))
    updates.addOnsJson = JSON.stringify(normalized)
    auditDetails.addOns = normalized
  }

  if (body.attachManualContract) {
    updates.provider = 'manual'
    updates.manualContract = true
    if (body.providerRef?.trim()) {
      updates.providerRef = body.providerRef.trim()
    }
    auditDetails.attachManualContract = true
  }

  if (body.provider !== undefined) {
    updates.provider = body.provider.trim().toLowerCase()
    auditDetails.provider = updates.provider
  }

  if (body.providerRef !== undefined) {
    updates.providerRef = body.providerRef.trim()
    auditDetails.providerRef = updates.providerRef
  }

  if (body.manualContract !== undefined) {
    updates.manualContract = body.manualContract
    auditDetails.manualContract = body.manualContract
  }

  if (body.providerMetadata !== undefined) {
    const current = parseProviderMetadata(existing.providerMetadataJson)
    const merged = { ...current, ...body.providerMetadata }
    updates.providerMetadataJson = JSON.stringify(merged)
    auditDetails.providerMetadata = merged
  }

  if (body.pause === true) {
    updates.pausedAt = new Date().toISOString()
    auditDetails.paused = true
  } else if (body.pause === false) {
    updates.pausedAt = ''
    auditDetails.resumed = true
  }

  if (body.cancel) {
    updates.status = 'canceled'
    updates.autoRenew = false
    auditDetails.canceled = true
  }

  if (body.syncProvider) {
    const meta = parseProviderMetadata(existing.providerMetadataJson)
    meta.last_provider_sync_at = new Date().toISOString()
    meta.last_provider_sync_source = 'console'
    updates.providerMetadataJson = JSON.stringify(meta)
    auditDetails.syncProvider = true
  }

  if (Object.keys(updates).length === 0) {
    return { ok: true, changed: false }
  }

  await db.update(subscriptionsTable).set(updates).where(eq(subscriptionsTable.id, id))

  const action = body.cancel
    ? 'subscription.canceled'
    : body.syncProvider
      ? 'subscription.provider_synced'
      : body.pause === true
        ? 'subscription.paused'
        : body.pause === false
          ? 'subscription.resumed'
          : body.attachManualContract
            ? 'subscription.manual_contract_attached'
            : 'subscription.updated'

  await insertAuditLog(db, {
    tenantId: existing.tenantId,
    actor: 'console',
    action,
    resourceType: 'subscription',
    resourceId: id,
    details: auditDetails,
  })

  return { ok: true, changed: true }
})
