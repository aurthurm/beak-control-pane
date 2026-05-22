import { describe, expect, it } from 'vitest'
import {
  applyRulesJsonOverlay,
  evaluateRuntimeFlagRow,
  flagTypeLabel,
  rolloutStrategyLabel,
  stableRolloutBucket,
  toRuntimeFlagDetail,
  toRuntimeFlagListItem,
} from '../server/utils/runtime-flags'
import type { RuntimeFeatureFlagRow } from '../server/db/schema'

function baseRow(overrides: Partial<RuntimeFeatureFlagRow>): RuntimeFeatureFlagRow {
  return {
    id: 'rf_test',
    flagKey: 'test_flag',
    name: 'Test',
    description: '',
    productId: null,
    linkedFeatureId: null,
    flagType: 'release',
    status: 'active',
    scope: 'global',
    defaultValue: 'true',
    rolloutStrategy: 'full_rollout',
    rolloutPercent: 100,
    globallyEnabled: true,
    rulesJson: '{}',
    targetSubscriberIdsJson: '[]',
    environmentValuesJson: '{}',
    evaluationHistoryJson: '[]',
    expiresAt: '',
    archivedAt: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('runtime flag labels', () => {
  it('labels strategies and types', () => {
    expect(rolloutStrategyLabel('subscriber_targeted')).toBe('Subscriber targeted')
    expect(flagTypeLabel('permission_override')).toBe('Permission override')
  })
})

describe('stableRolloutBucket', () => {
  it('is stable for same inputs', () => {
    expect(stableRolloutBucket('t1', 'flag_a')).toBe(stableRolloutBucket('t1', 'flag_a'))
  })
  it('differs across subscribers', () => {
    const a = stableRolloutBucket('subscriber-a', 'x')
    const b = stableRolloutBucket('subscriber-b', 'x')
    expect(a).not.toBe(b)
  })
})

describe('applyRulesJsonOverlay', () => {
  it('forces disabled subscriber', () => {
    const row = baseRow({
      rulesJson: JSON.stringify({ forceDisabledSubscriberIds: ['t_bad'] }),
    })
    const base = { key: 'test_flag', value: 'true', enabled: true, reason: 'full_rollout' }
    const out = applyRulesJsonOverlay(row, { subscriberId: 't_bad', enterpriseSegment: '' }, base)
    expect(out.enabled).toBe(false)
    expect(out.reason).toContain('force_disabled')
  })

  it('segment enable overrides', () => {
    const row = baseRow({
      rulesJson: JSON.stringify({ segmentEnabled: { enterprise: true } }),
    })
    const base = { key: 'test_flag', value: 'false', enabled: false, reason: 'x' }
    const out = applyRulesJsonOverlay(row, { subscriberId: 't1', enterpriseSegment: 'enterprise' }, base)
    expect(out.enabled).toBe(true)
    expect(out.reason).toContain('segment_enabled')
  })
})

describe('evaluateRuntimeFlagRow', () => {
  it('respects expired', () => {
    const row = baseRow({
      expiresAt: new Date(Date.now() - 864e5).toISOString(),
    })
    const r = evaluateRuntimeFlagRow(row, { subscriberId: 't1' })
    expect(r.enabled).toBe(false)
    expect(r.reason).toBe('expired')
  })

  it('honors subscriber allowlists and overlays', () => {
    const row = baseRow({
      rolloutStrategy: 'subscriber_targeted',
      defaultValue: 'true',
      targetSubscriberIdsJson: JSON.stringify(['sub_1']),
      rulesJson: JSON.stringify({ forceEnabledSubscriberIds: ['sub_1'] }),
    })
    const r = evaluateRuntimeFlagRow(row, { subscriberId: 'sub_1' })
    expect(r.enabled).toBe(true)
    expect(r.reason).toBe('rules:force_enabled_subscriber')
  })
})

describe('runtime flag mappings', () => {
  it('builds list and detail records from row data', () => {
    const row = baseRow({
      targetSubscriberIdsJson: JSON.stringify(['sub_1', 'sub_2']),
      environmentValuesJson: JSON.stringify({ production: true }),
      evaluationHistoryJson: JSON.stringify([{ at: '2026-05-01T00:00:00Z', subscriberId: 'sub_1', environment: 'production', result: 'true', reason: 'test' }]),
      planAssignmentsJson: JSON.stringify(['plan_a']),
      linkedFeatureId: 'feat_a',
      productId: 'prd_a',
    })
    const list = toRuntimeFlagListItem(row, {
      productName: (id) => (id === 'prd_a' ? 'Product A' : null),
      featureMeta: (id) => (id === 'feat_a' ? { name: 'Feature A', key: 'feature_a' } : null),
      subscriberName: () => null,
      planIdsForFeature: () => ['plan_fallback'],
      planIdsForProduct: () => ['plan_product'],
    })
    expect(list.productName).toBe('Product A')
    expect(list.linkedFeatureName).toBe('Feature A')
    expect(list.targetSubscriberCount).toBe(2)
    expect(list.planIds).toEqual(['plan_a'])
    expect(list.environmentKeys).toEqual(['production'])

    const detail = toRuntimeFlagDetail(row, {
      productName: () => null,
      featureMeta: () => null,
      subscriberName: (id) => (id === 'sub_1' ? 'Subscriber 1' : null),
      planIdsForFeature: () => [],
      planIdsForProduct: () => [],
    })
    expect(detail.targetSubscribers).toEqual([
      { id: 'sub_1', name: 'Subscriber 1' },
      { id: 'sub_2', name: 'sub_2' },
    ])
    expect(detail.evaluationHistory).toHaveLength(1)
  })
})
