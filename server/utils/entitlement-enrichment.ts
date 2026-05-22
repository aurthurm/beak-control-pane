import type { AuditLogRow } from '../db/schema'

export type EntitlementModuleRow = {
  key: string
  enabled: boolean
  source: string
  notes: string
}

export type EntitlementLimitRow = {
  metricKey: string
  value: number
  unit: string
  enforcementMode: string
  source: string
  notes: string
}

export type PlanDerivedSnapshot = {
  planId: string
  planName: string
  productId: string
  modules: Record<string, boolean>
  limits: Record<string, number>
  limitRows: EntitlementLimitRow[]
}

export type SubscriptionSnapshot = {
  id: string
  status: string
  provider: string
  providerRef: string
  planId: string
  planName: string
  startsAt: string
  renewalAt: string
  endsAt: string
  manualContract: boolean
  addOns: unknown[]
}

export type LicenseSnapshot = {
  id: string
  licenseKey: string
  mode: string
  status: string
  validFrom: string
  validTo: string
  graceUntil: string
  payloadSummary: Record<string, unknown>
}

export type FeatureFlagInteraction = {
  featureKey: string
  name: string
  enabledInEntitlement: boolean
  enabledOnPlan: boolean
  notes: string
}

type PayloadShape = {
  modules?: Record<string, boolean>
  limits?: Record<string, number>
  modulesDetail?: EntitlementModuleRow[]
  limitsDetail?: EntitlementLimitRow[]
  meta?: {
    status?: string
    validFrom?: string
    validTo?: string
    primarySource?: string
    sources?: string[]
  }
  lineage?: {
    plan?: Record<string, unknown>
    addOns?: unknown[]
    overrides?: unknown[]
    manualGrants?: unknown[]
  }
  featureFlagInteractions?: FeatureFlagInteraction[]
}

function parsePayload(raw: string): PayloadShape {
  try {
    return JSON.parse(raw) as PayloadShape
  } catch {
    return {}
  }
}

function uniqSources(sources: string[]) {
  return [...new Set(sources.filter(Boolean))]
}

function inferModuleSource(
  key: string,
  enabled: boolean,
  planModules: Record<string, boolean>,
  addOnKeys: Set<string>,
  manualContract: boolean,
): string {
  if (!enabled) {
    return planModules[key] === false || key in planModules ? 'plan' : 'effective'
  }
  if (addOnKeys.has(key)) {
    return 'add-on'
  }
  if (manualContract && !(key in planModules)) {
    return 'manual grant'
  }
  if (planModules[key] === true) {
    return 'plan'
  }
  if (planModules[key] === false && enabled) {
    return 'override'
  }
  return 'override'
}

export function buildPlanDerived(
  planId: string,
  planName: string,
  productId: string,
  planFeatures: Array<{ planId: string; featureKey: string; enabled: boolean }>,
  planLimits: Array<{
    planId: string
    limitKey: string
    limitValue: number
    limitUnit: string
    enforcement: string
    notes: string
  }>,
): PlanDerivedSnapshot {
  const modules: Record<string, boolean> = {}
  for (const row of planFeatures) {
    if (row.planId === planId) {
      modules[row.featureKey] = row.enabled
    }
  }

  const limits: Record<string, number> = {}
  const limitRows: EntitlementLimitRow[] = []
  for (const row of planLimits) {
    if (row.planId === planId) {
      limits[row.limitKey] = row.limitValue
      limitRows.push({
        metricKey: row.limitKey,
        value: row.limitValue,
        unit: row.limitUnit || '—',
        enforcementMode: row.enforcement || 'hard',
        source: 'plan',
        notes: row.notes || '',
      })
    }
  }

  return { planId, planName, productId, modules, limits, limitRows }
}

export function addOnFeatureKeys(addOns: unknown[]): Set<string> {
  const keys = new Set<string>()
  for (const item of addOns) {
    const blob = JSON.stringify(item).toLowerCase()
    if (blob.includes('hl7')) {
      keys.add('hl7')
    }
  }
  return keys
}

export function enrichEntitlementRow(input: {
  id: string
  subscriberId: string
  subscriberName: string
  productId: string
  productName: string
  computedAt: string
  payloadJson: string
  subscription: SubscriptionSnapshot | null
  planDerived: PlanDerivedSnapshot | null
  license: LicenseSnapshot | null
  featureFlagInteractions: FeatureFlagInteraction[]
  auditLogs: AuditLogRow[]
}) {
  const payload = parsePayload(input.payloadJson)
  const modules = payload.modules ?? {}
  const limits = payload.limits ?? {}

  const addOns = input.subscription?.addOns ?? []
  const addOnKeys = addOnFeatureKeys(addOns)
  const manualContract = input.subscription?.manualContract ?? false
  const planModules = input.planDerived?.modules ?? {}

  let moduleRows: EntitlementModuleRow[] =
    payload.modulesDetail?.map((r) => ({
      key: r.key,
      enabled: r.enabled,
      source: r.source,
      notes: r.notes ?? '',
    })) ?? []

  if (!moduleRows.length) {
    const keys = new Set([...Object.keys(modules), ...Object.keys(planModules), ...addOnKeys])
    moduleRows = [...keys].sort().map((key) => {
      const enabled = modules[key] ?? planModules[key] ?? false
      const source = inferModuleSource(key, enabled, planModules, addOnKeys, manualContract)
      return {
        key,
        enabled,
        source,
        notes: '',
      }
    })
  }

  let limitRows: EntitlementLimitRow[] =
    payload.limitsDetail?.map((r) => ({
      metricKey: r.metricKey,
      value: r.value,
      unit: r.unit,
      enforcementMode: r.enforcementMode,
      source: r.source,
      notes: r.notes ?? '',
    })) ?? []

  if (!limitRows.length) {
    const planLimitByKey = new Map(input.planDerived?.limitRows.map((r) => [r.metricKey, r]) ?? [])
    limitRows = Object.entries(limits).map(([metricKey, value]) => {
      const planRow = planLimitByKey.get(metricKey)
      return {
        metricKey,
        value,
        unit: planRow?.unit ?? '—',
        enforcementMode: planRow?.enforcementMode ?? 'unspecified',
        source: planRow ? 'plan' : 'effective',
        notes: planRow?.notes ?? '',
      }
    })
  }

  const sources: string[] = []
  if (input.planDerived) {
    sources.push('plan')
  }
  if (addOns.length) {
    sources.push('add-on')
  }
  if (manualContract) {
    sources.push('manual grant')
  }
  if (moduleRows.some((m) => m.source === 'override')) {
    sources.push('override')
  }

  const mergedSources = uniqSources([...(payload.meta?.sources ?? []), ...sources])
  const primarySource =
    payload.meta?.primarySource ??
    (manualContract ? 'manual grant' : addOns.length ? 'plan + add-on' : mergedSources[0] ?? 'unknown')

  const validFrom = payload.meta?.validFrom ?? input.subscription?.startsAt ?? ''
  const validTo = payload.meta?.validTo ?? input.subscription?.endsAt ?? ''
  const status =
    payload.meta?.status ??
    (input.license?.status && input.license.status !== 'active' ? input.license.status : input.subscription?.status ?? '—')

  const planLimits = input.planDerived?.limits ?? {}

  const subscriptionCompare = {
    aligned: true,
    notes: [] as string[],
    subscription: input.subscription,
    planDerived: input.planDerived,
  }

  if (input.subscription && input.planDerived) {
    for (const [k, v] of Object.entries(modules)) {
      const planV = input.planDerived.modules[k]
      if (planV !== undefined && planV !== v) {
        subscriptionCompare.notes.push(`Module "${k}": entitlement is ${v}, plan baseline is ${planV}.`)
      }
    }
    for (const [k, v] of Object.entries(limits)) {
      const planL = planLimits[k]
      if (planL !== undefined && planL !== v) {
        subscriptionCompare.notes.push(`Limit "${k}": entitlement ${v}, plan catalog ${planL}.`)
      }
    }
    subscriptionCompare.aligned = subscriptionCompare.notes.length === 0
  } else {
    subscriptionCompare.notes.push('No subscription found for this subscriber and product.')
    subscriptionCompare.aligned = false
  }

  const licenseCompare = {
    license: input.license,
    entitlementModuleCount: Object.values(modules).filter(Boolean).length,
    licensePayloadKeys: input.license ? Object.keys(input.license.payloadSummary) : [],
    notes: [] as string[],
  }
  if (input.license) {
    const licPlan = input.license.payloadSummary.plan
    if (typeof licPlan === 'string' && input.planDerived && !licPlan.includes(input.planDerived.planId)) {
      licenseCompare.notes.push(`License payload references plan "${licPlan}" (marketing); live subscription plan is "${input.planDerived.planName}".`)
    }
  }

  const recomputeHistory = input.auditLogs
    .filter((l) => l.action === 'entitlement.recomputed' && l.resourceId === input.id)
    .map((l) => ({
      id: l.id,
      actor: l.actor,
      createdAt: l.createdAt,
      detailsJson: l.detailsJson,
    }))

  const lineage = {
    plan: payload.lineage?.plan ?? input.planDerived,
    addOns: payload.lineage?.addOns ?? addOns,
    overrides: payload.lineage?.overrides ?? [],
    manualGrants: payload.lineage?.manualGrants ?? (manualContract ? [{ type: 'subscription', note: 'manual_contract flag on subscription' }] : []),
  }

  const featureFlagInteractions = payload.featureFlagInteractions?.length
    ? payload.featureFlagInteractions
    : input.featureFlagInteractions

  return {
    id: input.id,
    subscriberId: input.subscriberId,
    subscriberName: input.subscriberName,
    productId: input.productId,
    productName: input.productName,
    computedAt: input.computedAt,
    payloadJson: input.payloadJson,
    modules,
    limits,
    primarySource,
    sources: mergedSources.length ? mergedSources : [primarySource],
    status,
    validFrom,
    validTo,
    moduleRows,
    limitRows,
    planDerived: input.planDerived,
    subscription: input.subscription,
    license: input.license,
    lineage,
    featureFlagInteractions,
    subscriptionCompare,
    licenseCompare,
    recomputeHistory,
  }
}
