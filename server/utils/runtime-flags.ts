import type { RuntimeFeatureFlagRow } from '../db/schema'

export const RUNTIME_FLAG_TYPES = ['release', 'experiment', 'ops', 'permission_override'] as const
export type RuntimeFlagType = (typeof RUNTIME_FLAG_TYPES)[number]

export const RUNTIME_FLAG_SCOPES = ['global', 'product', 'subscriber', 'environment'] as const
export type RuntimeFlagScope = (typeof RUNTIME_FLAG_SCOPES)[number]

export const RUNTIME_FLAG_STRATEGIES = ['full_rollout', 'percentage', 'subscriber_targeted', 'environment_specific'] as const
export type RuntimeFlagStrategy = (typeof RUNTIME_FLAG_STRATEGIES)[number]

export const RUNTIME_FLAG_STATUSES = ['active', 'scheduled', 'archived'] as const
export type RuntimeFlagStatus = (typeof RUNTIME_FLAG_STATUSES)[number]

export function newRuntimeFlagId(): string {
  const hex =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `rf_${hex.slice(0, 22)}`
}

export function rolloutStrategyLabel(key: string): string {
  switch (key) {
    case 'full_rollout':
      return 'Full rollout'
    case 'percentage':
      return 'Percentage rollout'
    case 'subscriber_targeted':
      return 'Subscriber targeted'
    case 'environment_specific':
      return 'Environment-specific'
    default:
      return key
  }
}

export function flagTypeLabel(key: string): string {
  switch (key) {
    case 'release':
      return 'Release'
    case 'experiment':
      return 'Experiment'
    case 'ops':
      return 'Ops'
    case 'permission_override':
      return 'Permission override'
    default:
      return key
  }
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export type RuntimeFlagListItem = {
  id: string
  key: string
  name: string
  description: string
  productId: string | null
  productName: string | null
  linkedFeatureId: string | null
  linkedFeatureName: string | null
  linkedFeatureKey: string | null
  planIds: string[]
  type: string
  typeLabel: string
  status: string
  scope: string
  defaultValue: string
  rolloutStrategy: string
  rolloutStrategyLabel: string
  rolloutPercent: number
  globallyEnabled: boolean
  targetSubscriberCount: number
  environmentKeys: string[]
  expiresAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  evaluationHistoryCount: number
}

export type RuntimeFlagEvaluationEntry = {
  at: string
  subscriberId: string | null
  environment: string | null
  result: string
  reason: string
}

export type RuntimeFlagDetail = RuntimeFlagListItem & {
  rules: Record<string, unknown>
  targetSubscribers: Array<{ id: string; name: string }>
  environmentValues: Record<string, string | number | boolean>
  evaluationHistory: RuntimeFlagEvaluationEntry[]
}

export function toRuntimeFlagListItem(
  row: RuntimeFeatureFlagRow,
  lookups: {
    productName: (id: string | null) => string | null
    featureMeta: (id: string | null) => { name: string; key: string } | null
    subscriberName: (id: string) => string | null
    planIdsForFeature: (id: string | null) => string[]
    planIdsForProduct: (id: string | null) => string[]
  },
): RuntimeFlagListItem {
  const targetIds = safeJsonParse<string[]>(row.targetSubscriberIdsJson, [])
  const envVals = safeJsonParse<Record<string, string | number | boolean>>(row.environmentValuesJson, {})
  const history = safeJsonParse<RuntimeFlagEvaluationEntry[]>(row.evaluationHistoryJson, [])
  const directPlanIds = safeJsonParse<string[]>(row.planAssignmentsJson, []).filter(Boolean)
  const fmeta = lookups.featureMeta(row.linkedFeatureId)
  const fallbackPlanIds =
    directPlanIds.length > 0
      ? directPlanIds
      : row.linkedFeatureId
        ? lookups.planIdsForFeature(row.linkedFeatureId)
        : lookups.planIdsForProduct(row.productId)

  return {
    id: row.id,
    key: row.flagKey,
    name: row.name,
    description: row.description,
    productId: row.productId,
    productName: lookups.productName(row.productId),
    linkedFeatureId: row.linkedFeatureId,
    linkedFeatureName: fmeta?.name ?? null,
    linkedFeatureKey: fmeta?.key ?? null,
    planIds: [...new Set(fallbackPlanIds)],
    type: row.flagType,
    typeLabel: flagTypeLabel(row.flagType),
    status: row.status,
    scope: row.scope,
    defaultValue: row.defaultValue,
    rolloutStrategy: row.rolloutStrategy,
    rolloutStrategyLabel: rolloutStrategyLabel(row.rolloutStrategy),
    rolloutPercent: row.rolloutPercent,
    globallyEnabled: row.globallyEnabled,
    targetSubscriberCount: targetIds.length,
    environmentKeys: Object.keys(envVals),
    expiresAt: row.expiresAt.trim() || null,
    archivedAt: row.archivedAt.trim() || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    evaluationHistoryCount: history.length,
  }
}

/** Deterministic 0–99 bucket for percentage rollouts (stable per subscriber + flag). */
export function stableRolloutBucket(subscriberId: string, flagKey: string): number {
  const s = `${subscriberId}\0${flagKey}`
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0
  }
  return h % 100
}

export type RuntimeFlagEvalContext = {
  subscriberId: string
  /** e.g. production, staging — matches keys in environmentValuesJson */
  environment?: string | null
  /** Tenant enterprise_segment (standard, enterprise, …) for rulesJson overlays */
  enterpriseSegment?: string | null
}

export type RuntimeFlagEvalResult = {
  key: string
  value: string
  enabled: boolean
  reason: string
}

export function parseDefaultBoolean(defaultValue: string): boolean {
  const v = defaultValue.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

/** Optional overrides from `rules_json` (merged after rollout strategy). */
export function applyRulesJsonOverlay(
  row: RuntimeFeatureFlagRow,
  ctx: RuntimeFlagEvalContext,
  base: RuntimeFlagEvalResult,
): RuntimeFlagEvalResult {
  const rules = safeJsonParse<Record<string, unknown>>(row.rulesJson, {})
  const key = row.flagKey
  const strList = (k: string): string[] => {
    const v = rules[k]
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  }

  if (strList('forceDisabledSubscriberIds').includes(ctx.subscriberId)) {
    return { key, value: 'false', enabled: false, reason: 'rules:force_disabled_subscriber' }
  }
  if (strList('forceEnabledSubscriberIds').includes(ctx.subscriberId)) {
    const defStr = row.defaultValue?.trim() ?? 'true'
    return { key, value: defStr, enabled: parseDefaultBoolean(defStr), reason: 'rules:force_enabled_subscriber' }
  }

  const seg = (ctx.enterpriseSegment ?? '').trim().toLowerCase()
  if (seg) {
    const dis = rules.segmentDisabled
    if (dis && typeof dis === 'object' && dis !== null) {
      const raw = (dis as Record<string, unknown>)[seg]
      if (raw === true || raw === 'true' || raw === 1) {
        return { key, value: 'false', enabled: false, reason: `rules:segment_disabled:${seg}` }
      }
    }
    const en = rules.segmentEnabled
    if (en && typeof en === 'object' && en !== null) {
      const raw = (en as Record<string, unknown>)[seg]
      if (raw === true || raw === 'true' || raw === 1) {
        const defStr = row.defaultValue?.trim() ?? 'true'
        return { key, value: defStr, enabled: parseDefaultBoolean(defStr), reason: `rules:segment_enabled:${seg}` }
      }
    }
  }

  return base
}

/**
 * Evaluate a single runtime flag for a subscriber (and optional environment label).
 */
export function evaluateRuntimeFlagRow(
  row: RuntimeFeatureFlagRow,
  ctx: RuntimeFlagEvalContext,
): RuntimeFlagEvalResult {
  const key = row.flagKey
  const now = Date.now()
  if (row.status !== 'active') {
    return { key, value: 'false', enabled: false, reason: 'flag_not_active' }
  }
  const arch = row.archivedAt?.trim()
  if (arch) {
    return { key, value: 'false', enabled: false, reason: 'archived' }
  }
  const exp = row.expiresAt?.trim()
  if (exp && !Number.isNaN(Date.parse(exp)) && Date.parse(exp) < now) {
    return { key, value: 'false', enabled: false, reason: 'expired' }
  }

  const defStr = row.defaultValue?.trim() ?? 'false'
  const defBool = parseDefaultBoolean(defStr)

  if (!row.globallyEnabled) {
    return { key, value: 'false', enabled: false, reason: 'globally_disabled' }
  }

  const targetIds = safeJsonParse<string[]>(row.targetSubscriberIdsJson, [])
  const envVals = safeJsonParse<Record<string, string | number | boolean>>(row.environmentValuesJson, {})
  const envLabel = (ctx.environment ?? '').trim()

  let base: RuntimeFlagEvalResult
  switch (row.rolloutStrategy) {
    case 'full_rollout': {
      base = { key, value: defStr, enabled: defBool, reason: 'full_rollout' }
      break
    }
    case 'percentage': {
      const pct = Math.min(100, Math.max(0, row.rolloutPercent ?? 0))
      const bucket = stableRolloutBucket(ctx.subscriberId, key)
      const inRollout = bucket < pct
      const enabled = inRollout ? defBool : false
      base = {
        key,
        value: enabled ? defStr : 'false',
        enabled,
        reason: inRollout ? `percentage:${pct}` : `percentage_excluded:${pct}`,
      }
      break
    }
    case 'subscriber_targeted': {
      const hit = targetIds.includes(ctx.subscriberId)
      const enabled = hit ? defBool : false
      base = {
        key,
        value: enabled ? defStr : 'false',
        enabled,
        reason: hit ? 'subscriber_allowlist' : 'subscriber_not_listed',
      }
      break
    }
    case 'environment_specific': {
      if (!envLabel) {
        base = { key, value: defStr, enabled: defBool, reason: 'no_environment_hint_defaults' }
        break
      }
      if (Object.prototype.hasOwnProperty.call(envVals, envLabel)) {
        const raw = envVals[envLabel]
        const str = typeof raw === 'boolean' ? (raw ? 'true' : 'false') : String(raw)
        const enabled = parseDefaultBoolean(str)
        base = { key, value: str, enabled, reason: `environment:${envLabel}` }
        break
      }
      base = { key, value: defStr, enabled: defBool, reason: 'environment_fallback_default' }
      break
    }
    default:
      base = { key, value: defStr, enabled: defBool, reason: 'default' }
  }

  return applyRulesJsonOverlay(row, ctx, base)
}

export function toRuntimeFlagDetail(
  row: RuntimeFeatureFlagRow,
  lookups: {
    productName: (id: string | null) => string | null
    featureMeta: (id: string | null) => { name: string; key: string } | null
    subscriberName: (id: string) => string | null
    planIdsForFeature: (id: string | null) => string[]
    planIdsForProduct: (id: string | null) => string[]
  },
): RuntimeFlagDetail {
  const base = toRuntimeFlagListItem(row, lookups)
  const targetIds = safeJsonParse<string[]>(row.targetSubscriberIdsJson, [])
  const targetSubscribers = targetIds.map((id) => ({
    id,
    name: lookups.subscriberName(id) ?? id,
  }))

  return {
    ...base,
    rules: safeJsonParse<Record<string, unknown>>(row.rulesJson, {}),
    targetSubscribers,
    environmentValues: safeJsonParse<Record<string, string | number | boolean>>(row.environmentValuesJson, {}),
    evaluationHistory: safeJsonParse<RuntimeFlagEvaluationEntry[]>(row.evaluationHistoryJson, []),
  }
}
