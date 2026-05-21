import type { BillingEventRow } from '../db/schema'

export type BillingEventListItem = {
  id: string
  provider: string
  eventType: string
  tenantId: string
  tenantName: string
  subscriptionId: string | null
  subscriptionLabel: string | null
  status: string
  amountCents: number
  currency: string
  occurredAt: string
  processedAt: string
  retryCount: number
}

export type BillingEventDetail = BillingEventListItem & {
  payloadJson: string
  normalizedJson: string
  processingLogsJson: string
  errorJson: string
  impactedRecordsJson: string
}

export function mapBillingEventRow(
  row: BillingEventRow,
  tenantName: string,
  subscriptionLabel: string | null,
): BillingEventListItem {
  return {
    id: row.id,
    provider: row.provider,
    eventType: row.eventType,
    tenantId: row.tenantId,
    tenantName,
    subscriptionId: row.subscriptionId,
    subscriptionLabel,
    status: row.processingStatus,
    amountCents: row.amountCents,
    currency: row.currency,
    occurredAt: row.occurredAt,
    processedAt: row.processedAt,
    retryCount: row.retryCount,
  }
}

export function mapBillingEventDetail(
  row: BillingEventRow,
  tenantName: string,
  subscriptionLabel: string | null,
): BillingEventDetail {
  return {
    ...mapBillingEventRow(row, tenantName, subscriptionLabel),
    payloadJson: row.payloadJson,
    normalizedJson: row.normalizedJson,
    processingLogsJson: row.processingLogsJson,
    errorJson: row.errorJson,
    impactedRecordsJson: row.impactedRecordsJson,
  }
}
