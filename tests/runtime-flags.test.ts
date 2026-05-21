import { describe, expect, it } from 'vitest'
import { applyRulesJsonOverlay, evaluateRuntimeFlagRow, stableRolloutBucket } from '../server/utils/runtime-flags'
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
    targetTenantIdsJson: '[]',
    environmentValuesJson: '{}',
    evaluationHistoryJson: '[]',
    expiresAt: '',
    archivedAt: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('stableRolloutBucket', () => {
  it('is stable for same inputs', () => {
    expect(stableRolloutBucket('t1', 'flag_a')).toBe(stableRolloutBucket('t1', 'flag_a'))
  })
  it('differs across tenants', () => {
    const a = stableRolloutBucket('tenant-a', 'x')
    const b = stableRolloutBucket('tenant-b', 'x')
    expect(a).not.toBe(b)
  })
})

describe('applyRulesJsonOverlay', () => {
  it('forces disabled tenant', () => {
    const row = baseRow({
      rulesJson: JSON.stringify({ forceDisabledTenantIds: ['t_bad'] }),
    })
    const base = { key: 'test_flag', value: 'true', enabled: true, reason: 'full_rollout' }
    const out = applyRulesJsonOverlay(row, { tenantId: 't_bad', enterpriseSegment: '' }, base)
    expect(out.enabled).toBe(false)
    expect(out.reason).toContain('force_disabled')
  })

  it('segment enable overrides', () => {
    const row = baseRow({
      rulesJson: JSON.stringify({ segmentEnabled: { enterprise: true } }),
    })
    const base = { key: 'test_flag', value: 'false', enabled: false, reason: 'x' }
    const out = applyRulesJsonOverlay(row, { tenantId: 't1', enterpriseSegment: 'enterprise' }, base)
    expect(out.enabled).toBe(true)
    expect(out.reason).toContain('segment_enabled')
  })
})

describe('evaluateRuntimeFlagRow', () => {
  it('respects expired', () => {
    const row = baseRow({
      expiresAt: new Date(Date.now() - 864e5).toISOString(),
    })
    const r = evaluateRuntimeFlagRow(row, { tenantId: 't1' })
    expect(r.enabled).toBe(false)
    expect(r.reason).toBe('expired')
  })
})
