import { slugifyKey } from './products'

export const FEATURE_TYPES = ['module', 'toggle', 'permission', 'integration', 'experimental'] as const
export type FeatureTypeKey = (typeof FEATURE_TYPES)[number]

export const FEATURE_STATUSES = ['active', 'archived'] as const
export type FeatureStatusKey = (typeof FEATURE_STATUSES)[number]

export const FEATURE_VISIBILITY = ['public', 'internal', 'beta', 'enterprise', 'deprecated'] as const
export type FeatureVisibilityKey = (typeof FEATURE_VISIBILITY)[number]

export const FEATURE_CATEGORY_ORDER = [
  'core',
  'commerce',
  'inventory',
  'customers',
  'reports',
  'integrations',
  'ai',
  'admin',
  'security',
  'billing',
  'laboratory',
  'pos',
  'analytics',
  'operations',
  'feature-flags',
] as const

export function featureKeyFromInput(input: string): string {
  return slugifyKey(input).replace(/-/g, '_')
}

export function isEntitledSubscriptionStatus(status: string) {
  const s = status.toLowerCase()
  return s === 'active' || s === 'trialing' || s === 'past_due'
}
