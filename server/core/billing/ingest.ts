import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { BillingEventRow } from '../../db/schema'
import { billingEventsTable, plansTable, subscriptionsTable, tenantsTable } from '../../db/schema'
import { insertAuditLog } from '../../utils/audit-log'
import { recomputeEntitlementForTenantProduct } from '../../utils/entitlement-by-product'
import { reissueLicensesForTenantProduct } from '../licensing/reissue'
import type { BillingReconcileOp, NormalizedBillingEvent } from './domain'
import { createSubscriptionRecord } from './create-subscription-record'

export type IngestResult = {
  ok: boolean
  billingEventId: string
  skipped?: boolean
  reason?: string
  error?: string
}

function appendLog(
  existing: string,
  entry: { at: string; level: string; message: string },
): string {
  let logs: Array<{ at: string; level: string; message: string }> = []
  try {
    const parsed = JSON.parse(existing) as unknown
    logs = Array.isArray(parsed) ? (parsed as typeof logs) : []
  } catch {
    logs = []
  }
  logs.push(entry)
  return JSON.stringify(logs)
}

async function applyReconcileOp(
  db: LibSQLDatabase<any>,
  op: BillingReconcileOp,
): Promise<{ tenantId: string; productId: string } | null> {
  if (op.op === 'none') {
    return null
  }

  const stripeSubId = op.stripeSubscriptionId
  const [existing] = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.provider, 'stripe'), eq(subscriptionsTable.providerRef, stripeSubId)))
    .limit(1)

  const renewalAt = op.currentPeriodEndIso ?? undefined
  const status = op.status

  if (existing) {
    await db
      .update(subscriptionsTable)
      .set({
        status,
        ...(renewalAt ? { renewalAt } : {}),
        ...(renewalAt ? { endsAt: renewalAt } : {}),
        providerMetadataJson: JSON.stringify({
          ...safeJson(existing.providerMetadataJson),
          stripe_customer_id: op.stripeCustomerId,
        }),
      })
      .where(eq(subscriptionsTable.id, existing.id))

    const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, existing.tenantId)).limit(1)
    if (t) {
      await db
        .update(tenantsTable)
        .set({
          billingProvider: 'stripe',
          billingMode: t.billingMode?.trim() ? t.billingMode : 'online',
        })
        .where(eq(tenantsTable.id, t.id))
    }

    await insertAuditLog(db, {
      tenantId: existing.tenantId,
      actor: 'billing.ingest',
      action: 'subscription.updated',
      resourceType: 'subscription',
      resourceId: existing.id,
      details: { provider: 'stripe', stripeSubscriptionId: stripeSubId, status },
    })

    const { productId } = await getProductIdForPlan(db, existing.planId)
    return productId ? { tenantId: existing.tenantId, productId } : null
  }

  const tenantId = op.tenantId?.trim()
  const planId = op.planId?.trim()
  if (!tenantId || !planId) {
    return null
  }

  await createSubscriptionRecord(db, {
    tenantId,
    planId,
    provider: 'stripe',
    providerRef: stripeSubId,
    status,
    renewalAt,
    endsAt: renewalAt,
    manualContract: false,
    providerMetadataJson: JSON.stringify({ stripe_customer_id: op.stripeCustomerId }),
  })

  const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1)
  if (t) {
    await db
      .update(tenantsTable)
      .set({
        billingProvider: 'stripe',
        billingMode: t.billingMode?.trim() ? t.billingMode : 'online',
      })
      .where(eq(tenantsTable.id, tenantId))
  }

  const { productId } = await getProductIdForPlan(db, planId)
  return productId ? { tenantId, productId } : null
}

async function getProductIdForPlan(db: LibSQLDatabase<any>, planId: string) {
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, planId)).limit(1)
  return { productId: plan?.productId ?? null }
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Idempotent billing pipeline: persist event, reconcile subscription, recompute entitlements, re-sign licenses.
 */
export async function ingestNormalizedBillingEvent(
  db: LibSQLDatabase<any>,
  normalized: NormalizedBillingEvent,
  rawPayloadJson: string,
): Promise<IngestResult> {
  const billingEventId = normalized.id
  const now = new Date().toISOString()

  const [tenantRow] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, normalized.tenantId))
    .limit(1)
  if (!tenantRow) {
    return { ok: true, billingEventId, skipped: true, reason: 'unknown_or_missing_tenant' }
  }

  const [existing] = await db
    .select()
    .from(billingEventsTable)
    .where(eq(billingEventsTable.id, billingEventId))
    .limit(1)

  if (existing?.processingStatus === 'processed') {
    return { ok: true, billingEventId, skipped: true, reason: 'already_processed' }
  }

  if (!existing) {
    await db.insert(billingEventsTable).values({
      id: billingEventId,
      provider: normalized.provider,
      tenantId: normalized.tenantId,
      subscriptionId: normalized.subscriptionId,
      eventType: normalized.eventType,
      amountCents: normalized.amountCents,
      currency: normalized.currency,
      occurredAt: normalized.occurredAt,
      payloadJson: rawPayloadJson,
      processingStatus: 'received',
      processedAt: '',
      retryCount: 0,
      normalizedJson: JSON.stringify(normalized),
      processingLogsJson: JSON.stringify([{ at: now, level: 'info', message: 'received' }]),
      errorJson: '',
      impactedRecordsJson: '[]',
    })
  }

  try {
    const impacted = await applyReconcileOp(db, normalized.reconcile)
    const impactedJson: Array<{ tenantId: string; productId: string }> = []
    if (impacted) {
      impactedJson.push(impacted)
      const ent = await recomputeEntitlementForTenantProduct(db, impacted.tenantId, impacted.productId)
      if (ent) {
        await reissueLicensesForTenantProduct(db, impacted.tenantId, impacted.productId, 'billing.ingest')
      }
    }

    const prev = existing?.processingLogsJson ?? '[]'
    const logs = appendLog(prev, { at: now, level: 'info', message: 'processed' })

    await db
      .update(billingEventsTable)
      .set({
        processingStatus: 'processed',
        processedAt: new Date().toISOString(),
        normalizedJson: JSON.stringify(normalized),
        processingLogsJson: logs,
        impactedRecordsJson: JSON.stringify(impactedJson),
        errorJson: '',
      })
      .where(eq(billingEventsTable.id, billingEventId))

    await insertAuditLog(db, {
      tenantId: normalized.tenantId,
      actor: 'billing.ingest',
      action: 'billing_event.processed',
      resourceType: 'billing_event',
      resourceId: billingEventId,
      details: { eventType: normalized.eventType, provider: normalized.provider },
    })

    return { ok: true, billingEventId }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    const prev = existing?.processingLogsJson ?? '[]'
    const logs = appendLog(prev, { at: new Date().toISOString(), level: 'error', message: err })

    await db
      .update(billingEventsTable)
      .set({
        processingStatus: 'failed',
        errorJson: JSON.stringify({ message: err }),
        processingLogsJson: logs,
        retryCount: (existing?.retryCount ?? 0) + 1,
      })
      .where(eq(billingEventsTable.id, billingEventId))

    return { ok: false, billingEventId, error: err }
  }
}

/**
 * Replay processing from an existing billing_events row (manual retry).
 */
export async function replayBillingEventFromRow(
  db: LibSQLDatabase<any>,
  row: BillingEventRow,
): Promise<IngestResult> {
  let normalized: NormalizedBillingEvent
  try {
    normalized = JSON.parse(row.normalizedJson || '{}') as NormalizedBillingEvent
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid normalized_json on billing event' })
  }

  if (!normalized?.id || !normalized.reconcile || !normalized.provider) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'Billing event missing normalized payload (re-ingest from provider or replay only works for events stored after Phase 2)',
    })
  }

  /** Reset to received for retry */
  await db
    .update(billingEventsTable)
    .set({
      processingStatus: 'received',
      errorJson: '',
    })
    .where(eq(billingEventsTable.id, row.id))

  return ingestNormalizedBillingEvent(db, normalized, row.payloadJson)
}
