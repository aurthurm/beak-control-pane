import type { PlanRow, SubscriptionRow } from '../db/schema'
import type { EntitlementLimitRow, EntitlementModuleRow } from './entitlement-enrichment'
import { addOnFeatureKeys } from './entitlement-enrichment'

export function buildEntitlementStoragePayload(input: {
  subscription: SubscriptionRow
  plan: PlanRow
  featureLinks: Array<{ featureKey: string; enabled: boolean }>
  limitRows: Array<{
    limitKey: string
    limitValue: number
    limitUnit: string
    enforcement: string
    notes: string
  }>
}) {
  const modules: Record<string, boolean> = {}
  for (const f of input.featureLinks) {
    modules[f.featureKey] = f.enabled
  }

  const addOns = JSON.parse(input.subscription.addOnsJson || '[]') as unknown[]
  const addOnKeys = addOnFeatureKeys(addOns)
  for (const k of addOnKeys) {
    modules[k] = true
  }

  const limits: Record<string, number> = {}
  const limitsDetail: EntitlementLimitRow[] = []
  for (const row of input.limitRows) {
    limits[row.limitKey] = row.limitValue
    limitsDetail.push({
      metricKey: row.limitKey,
      value: row.limitValue,
      unit: row.limitUnit || '—',
      enforcementMode: row.enforcement || 'hard',
      source: 'plan',
      notes: row.notes || '',
    })
  }

  const modulesDetail: EntitlementModuleRow[] = Object.keys(modules)
    .sort()
    .map((key) => {
      const fromPlan = input.featureLinks.find((f) => f.featureKey === key)
      const enabled = Boolean(modules[key])
      let source = 'plan'
      if (addOnKeys.has(key)) {
        source = 'add-on'
      } else if (fromPlan && fromPlan.enabled !== enabled) {
        source = 'override'
      } else if (!fromPlan && enabled) {
        source = input.subscription.manualContract ? 'manual grant' : 'override'
      }
      return { key, enabled, source, notes: '' }
    })

  const sources: string[] = ['plan']
  if (addOns.length) {
    sources.push('add-on')
  }
  if (input.subscription.manualContract) {
    sources.push('manual grant')
  }

  return {
    modules,
    limits,
    modulesDetail,
    limitsDetail,
    meta: {
      status: input.subscription.status,
      validFrom: input.subscription.startsAt,
      validTo: input.subscription.endsAt,
      primarySource: input.subscription.manualContract ? 'manual grant' : addOns.length ? 'plan + add-on' : 'plan',
      sources: [...new Set(sources)],
    },
    lineage: {
      plan: { planId: input.plan.id, planName: input.plan.name },
      addOns,
      overrides: [] as unknown[],
      manualGrants: input.subscription.manualContract ? [{ note: 'Subscription.manual_contract' }] : [],
    },
  }
}
