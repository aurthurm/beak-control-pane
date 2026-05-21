import { computed, unref, type MaybeRefOrGetter } from 'vue'

export type PortalMembershipItem = {
  organizationId: string
  organizationName: string
  organizationSlug: string
  organizationStatus: string
  membershipRole: string
  counts: {
    productCount: number
    tenantCount: number
    subscriptionCount: number
    activeSubscriptionCount: number
    licenseCount: number
    onlineLicenseCount: number
    expiringLicenseCount: number
    usageRecordCount: number
    entitlementCount: number
  }
}

export type PortalSubscriptionItem = {
  id: string
  tenantName: string
  productName: string
  planName: string
  status: string
  billingInterval: string
  amountCents: number
  unitAmountCents: number
  licenseCount: number
  activationsPerLicense: number
  currency: string
  amountLabel: string
  renewalAt: string
  renewalAtLabel: string
  endsAt: string
  endsAtLabel: string
  autoRenew: boolean
  manualContract: boolean
  pausedAt: string
  tenantId: string
  planId: string
  productId: string
  provider: string
  providerRef: string
  providerMetadata: Record<string, string>
  addOns: Array<{ id: string; name: string; amountCents: number }>
  isPaused: boolean
  basePlanAmountCents: number
}

export type PortalLicenseItem = {
  id: string
  tenantName: string
  productName: string
  licenseKey: string
  mode: string
  status: string
  validTo: string
  validToLabel: string
  graceUntil: string
  graceUntilLabel: string
  remainingDays: number | null
  maxActivations: number
  activeActivations: number
  activationsTotal: number
  latestSeenAt: string
  latestSeenAtLabel: string
}

export type PortalUsageItem = {
  id: string
  tenantName: string
  productName: string
  metric: string
  metricLabel: string
  value: number
  limitValue: number
  period: string
  periodKey: string
  recordedAt: string
  recordedAtLabel: string
  status: string
  uiStatus: 'normal' | 'warning' | 'exceeded'
  warningThresholdPercent: number
}

export type PortalEntitlementItem = {
  id: string
  tenantName: string
  productName: string
  computedAt: string
  computedAtLabel: string
  primarySource: string
  moduleCount: number
  enabledModuleCount: number
  limitCount: number
  modulePreview: string[]
  limitPreview: string[]
}

export type PortalSummaryResponse = {
  account: {
    user: { id: string; email: string; platformRole: string }
    memberships: PortalMembershipItem[]
  }
  activeOrganizationId: string
  activeOrganization: null | {
    id: string
    name: string
    slug: string
    status: string
    createdAt: string
    updatedAt: string
  }
  overview: {
    productCount: number
    tenantCount: number
    subscriptionCount: number
    activeSubscriptionCount: number
    licenseCount: number
    onlineLicenseCount: number
    expiringLicenseCount: number
    usageRecordCount: number
    entitlementCount: number
    planCount: number
    activationCount: number
  }
  entryPoints: Array<{
    key: string
    title: string
    href: string
    description: string
    count: number
  }>
  subscriptions: PortalSubscriptionItem[]
  licenses: PortalLicenseItem[]
  usage: PortalUsageItem[]
  entitlements: PortalEntitlementItem[]
  recent: {
    subscriptions: PortalSubscriptionItem[]
    licenses: PortalLicenseItem[]
    usage: PortalUsageItem[]
    entitlements: PortalEntitlementItem[]
  }
}

export function usePortalSummary(organizationId?: MaybeRefOrGetter<string | null | undefined>) {
  const orgId = computed(() => (organizationId ? unref(organizationId) ?? '' : ''))

  return useAsyncData(
    () => `bcp-portal-summary:${orgId.value || 'default'}`,
    async () => {
      const query = orgId.value ? { organizationId: orgId.value } : undefined
      if (process.server) {
        const requestFetch = useRequestFetch()
        return await requestFetch<PortalSummaryResponse>('/api/portal/summary', { query })
      }
      return await $fetch<PortalSummaryResponse>('/api/portal/summary', { query })
    },
    {
      watch: [orgId],
    },
  )
}
