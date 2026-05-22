import { describe, expect, it } from 'vitest'
import { buildPlanDerived, addOnFeatureKeys, enrichEntitlementRow } from '../server/utils/entitlement-enrichment'
import { getLimitFromEntitlementPayload, parseEntitlementLimitMap } from '../server/utils/entitlement-limits'
import { deriveUsageUiStatus, latestUsagePeriodKey, usageMetricLabel } from '../server/utils/usage-dashboard'
import { mapBillingEventDetail, mapBillingEventRow } from '../server/utils/billing-events-map'
import type { AuditLogRow, BillingEventRow } from '../server/db/schema'

describe('entitlement plan derivation', () => {
  it('builds module and limit snapshots from plan rows', () => {
    const derived = buildPlanDerived(
      'plan_1',
      'Pro',
      'prd_1',
      [
        { planId: 'plan_1', featureKey: 'reports', enabled: true },
        { planId: 'plan_1', featureKey: 'hl7', enabled: false },
      ],
      [
        { planId: 'plan_1', limitKey: 'api_calls', limitValue: 1000, limitUnit: 'calls', enforcement: 'soft', notes: 'API' },
      ],
    )

    expect(derived.modules).toEqual({ reports: true, hl7: false })
    expect(derived.limits).toEqual({ api_calls: 1000 })
    expect(derived.limitRows[0]).toMatchObject({
      metricKey: 'api_calls',
      value: 1000,
      unit: 'calls',
      enforcementMode: 'soft',
      source: 'plan',
    })
  })

  it('detects add-on feature keys', () => {
    expect(addOnFeatureKeys([{ name: 'HL7 connector' }, { name: 'Other' }])).toEqual(new Set(['hl7']))
  })
})

describe('entitlement enrichment', () => {
  it('merges payload, subscription, and audit history', () => {
    const row = enrichEntitlementRow({
      id: 'ent_1',
      subscriberId: 'sub_1',
      subscriberName: 'Subscriber 1',
      productId: 'prd_1',
      productName: 'Product 1',
      computedAt: '2026-05-01T00:00:00Z',
      payloadJson: JSON.stringify({
        modules: { hl7: true },
        limits: { api_calls: 1000 },
      }),
      subscription: {
        id: 'sub_1',
        status: 'active',
        provider: 'stripe',
        providerRef: 'ref_1',
        planId: 'plan_1',
        planName: 'Pro',
        startsAt: '2026-04-01T00:00:00Z',
        renewalAt: '2026-05-01T00:00:00Z',
        endsAt: '2026-05-01T00:00:00Z',
        manualContract: false,
        addOns: [{ name: 'HL7 connector' }],
      },
      planDerived: {
        planId: 'plan_1',
        planName: 'Pro',
        productId: 'prd_1',
        modules: { hl7: false },
        limits: { api_calls: 500 },
        limitRows: [{ metricKey: 'api_calls', value: 500, unit: 'calls', enforcementMode: 'soft', source: 'plan', notes: '' }],
      },
      license: {
        id: 'lic_1',
        licenseKey: 'LIC-1',
        mode: 'offline',
        status: 'active',
        validFrom: '2026-04-01T00:00:00Z',
        validTo: '2026-05-01T00:00:00Z',
        graceUntil: '2026-05-08T00:00:00Z',
        payloadSummary: { plan: 'marketing-plan', signatureVersion: 1 },
      },
      featureFlagInteractions: [{ featureKey: 'hl7', name: 'HL7', enabledInEntitlement: true, enabledOnPlan: false, notes: 'override' }],
      auditLogs: [
        {
          id: 'aud_1',
          subscriberId: 'sub_1',
          actor: 'ops',
          action: 'entitlement.recomputed',
          resourceType: 'entitlement',
          resourceId: 'ent_1',
          resourceName: 'Entitlement 1',
          source: 'job',
          result: 'success',
          detailsJson: '{}',
          createdAt: '2026-05-01T00:00:00Z',
        } as AuditLogRow,
      ],
    })

    expect(row.primarySource).toBe('plan + add-on')
    expect(row.sources).toEqual(['plan', 'add-on'])
    expect(row.moduleRows).toEqual([
      { key: 'hl7', enabled: true, source: 'add-on', notes: '' },
    ])
    expect(row.limitRows).toEqual([
      { metricKey: 'api_calls', value: 1000, unit: 'calls', enforcementMode: 'soft', source: 'plan', notes: '' },
    ])
    expect(row.subscriptionCompare.aligned).toBe(false)
    expect(row.licenseCompare.notes[0]).toContain('live subscription plan')
    expect(row.recomputeHistory).toHaveLength(1)
  })
})

describe('usage and billing mappers', () => {
  it('derives ui status and latest period keys', () => {
    expect(usageMetricLabel('api_calls_per_month')).toBe('API calls (period)')
    expect(deriveUsageUiStatus({ value: 80, limitValue: 100, status: 'normal', warningThresholdPercent: 80 })).toBe('warning')
    expect(deriveUsageUiStatus({ value: 101, limitValue: 100, status: 'normal', warningThresholdPercent: 80 })).toBe('exceeded')
    expect(latestUsagePeriodKey([{ periodKey: '2026-03' }, { periodKey: '2026-05' }, { periodKey: '2026-04' }])).toBe('2026-05')
  })

  it('maps billing event rows into list and detail shapes', () => {
    const row = {
      id: 'bevt_1',
      provider: 'stripe',
      subscriberId: 'sub_1',
      subscriptionId: 'subscription_1',
      eventType: 'invoice.paid',
      amountCents: 1000,
      currency: 'USD',
      occurredAt: '2026-05-01T00:00:00Z',
      payloadJson: '{"ok":true}',
      processingStatus: 'processed',
      processedAt: '2026-05-01T00:01:00Z',
      retryCount: 0,
      normalizedJson: '{"normalized":true}',
      processingLogsJson: '[]',
      errorJson: '',
      impactedRecordsJson: '[]',
    } as BillingEventRow

    expect(mapBillingEventRow(row, 'Subscriber 1', 'Subscription 1')).toEqual({
      id: 'bevt_1',
      provider: 'stripe',
      eventType: 'invoice.paid',
      subscriberId: 'sub_1',
      subscriberName: 'Subscriber 1',
      subscriptionId: 'subscription_1',
      subscriptionLabel: 'Subscription 1',
      status: 'processed',
      amountCents: 1000,
      currency: 'USD',
      occurredAt: '2026-05-01T00:00:00Z',
      processedAt: '2026-05-01T00:01:00Z',
      retryCount: 0,
    })
    expect(mapBillingEventDetail(row, 'Subscriber 1', 'Subscription 1').normalizedJson).toBe('{"normalized":true}')
  })

  it('parses entitlement limit payloads defensively', () => {
    expect(parseEntitlementLimitMap('{"limits":{"users":12,"bad":"x"}}')).toEqual({ users: 12 })
    expect(getLimitFromEntitlementPayload('{"limits":{"users":12}}', 'users')).toBe(12)
    expect(getLimitFromEntitlementPayload('{"limits":{"users":12}}', 'api_calls')).toBeNull()
  })
})
