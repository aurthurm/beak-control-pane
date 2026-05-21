export type DashboardAlertSeverity = 'critical' | 'warning' | 'info'

export type DashboardAlert = {
  severity: DashboardAlertSeverity
  title: string
  detail: string
  count: number
  href: string
}

export type ProductOverviewRow = {
  productId: string
  name: string
  slug: string
  status: string
  activeTenants: number
  revenueContributionCents: number
  topModules: Array<{ key: string; name: string; tenantCount: number }>
  avgUsersPerTenant: number
  growthTrend: 'up' | 'flat' | 'down'
}

export type ActivityFeedItem = {
  id: string
  kind: 'billing' | 'audit'
  occurredAt: string
  title: string
  description: string
  severity: 'success' | 'warning' | 'destructive' | 'info'
  href: string
}

export type EntitlementDetailModuleRow = {
  key: string
  enabled: boolean
  source: string
  notes: string
}

export type EntitlementDetailLimitRow = {
  metricKey: string
  value: number
  unit: string
  enforcementMode: string
  source: string
  notes: string
}

export type EntitlementPlanDerivedSnapshot = {
  planId: string
  planName: string
  productId: string
  modules: Record<string, boolean>
  limits: Record<string, number>
  limitRows: EntitlementDetailLimitRow[]
}

export type EntitlementSubscriptionSnapshot = {
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

export type EntitlementLicenseSnapshot = {
  id: string
  licenseKey: string
  mode: string
  status: string
  validFrom: string
  validTo: string
  graceUntil: string
  payloadSummary: Record<string, unknown>
}

export type EntitlementFeatureFlagInteraction = {
  featureKey: string
  name: string
  enabledInEntitlement: boolean
  enabledOnPlan: boolean
  notes: string
}

export type EntitlementsDetailRow = {
  id: string
  tenantId: string
  tenantName: string
  productId: string
  productName: string
  computedAt: string
  payloadJson: string
  modules: Record<string, boolean>
  limits: Record<string, number>
  primarySource: string
  sources: string[]
  status: string
  validFrom: string
  validTo: string
  moduleRows: EntitlementDetailModuleRow[]
  limitRows: EntitlementDetailLimitRow[]
  planDerived: EntitlementPlanDerivedSnapshot | null
  subscription: EntitlementSubscriptionSnapshot | null
  license: EntitlementLicenseSnapshot | null
  lineage: {
    plan: unknown
    addOns: unknown[]
    overrides: unknown[]
    manualGrants: unknown[]
  }
  featureFlagInteractions: EntitlementFeatureFlagInteraction[]
  subscriptionCompare: {
    aligned: boolean
    notes: string[]
    subscription: EntitlementSubscriptionSnapshot | null
    planDerived: EntitlementPlanDerivedSnapshot | null
  }
  licenseCompare: {
    license: EntitlementLicenseSnapshot | null
    entitlementModuleCount: number
    licensePayloadKeys: string[]
    notes: string[]
  }
  recomputeHistory: Array<{
    id: string
    actor: string
    createdAt: string
    detailsJson: string
  }>
}

export type WorkspaceDashboard = {
  summary: {
    products: number
    tenants: number
    plans: number
    licenses: number
    activations: number
    monthlyApiCalls: number
    onlineLicenses: number
    offlineLicenses: number
    expiringSoon: number
  }
  businessHealth: {
    totalCustomers: number
    activeSubscriptions: number
    mrrCents: number
    arrCents: number
    trialTenants: number
    trialingSubscriptions: number
    expiringLicenses30d: number
    failedPayments: number
    offlineLicensesActive: number
  }
  productOverview: ProductOverviewRow[]
  alerts: DashboardAlert[]
  activityFeed: ActivityFeedItem[]
  revenueInsights: {
    mrrCents: number
    monthlyBillingTrend: Array<{ monthKey: string; label: string; totalCents: number }>
    newTenantsByMonth: Array<{ monthKey: string; label: string; count: number }>
    churnRatePercent: number | null
    planDistribution: Array<{ planName: string; productName: string; count: number; mrrCents: number }>
  }
  modules: Array<{
    title: string
    description: string
    status: string
  }>
  api: Array<{
    method: string
    path: string
    purpose: string
  }>
  products: Array<{
    id: string
    name: string
    slug: string
    status: string
    activePlans: number
    productType: string
    productTypeLabel: string
    defaultBillingMode: string
    defaultBillingModeLabel: string
    tenantCount: number
    createdAt: string
    updatedAt: string
    offlineLicensesSupported: boolean
    activationsRequired: boolean
    usageTrackingEnabled: boolean
    description: string
  }>
  tenants: Array<{
    id: string
    slug: string
    legalName: string
    name: string
    industry: string
    status: string
    planName: string
    planSummary: string
    subscribedProducts: string[]
    billingStatus: string
    licenseStatus: string
    country: string
    createdAt: string
    contactName: string
    email: string
    phone: string
    billingMode: string
    billingProvider: string
    supportTier: string
    internalNotes: string
    productCount: number
    seats: number
    enterpriseSegment: string
  }>
  licenses: Array<{
    id: string
    tenantId: string
    productId: string
    licenseKey: string
    tenantName: string
    productName: string
    planName?: string
    planSlug?: string
    planEdition?: string
    subscriptionId?: string | null
    subscriptionStatus?: string | null
    mode: string
    status: string
    validFrom: string
    validTo: string
    graceUntil: string
    maxActivations: number
    activationCount?: number
    lastCheckInAt?: string | null
    lastPayloadDownloadAt?: string | null
    offlineAllowed: boolean
    payloadJson: string
    signature: string
    linkedEntitlement?: {
      id: string
      computedAt: string
      modules: Record<string, boolean> | null
      limits: Record<string, number> | null
    } | null
    versionHistory?: Array<{
      id: string
      actor: string
      action: string
      createdAt: string
      detailsJson: string
    }>
    activationHistory?: Array<{
      id: string
      deviceId: string
      siteId: string
      installationId: string
      status: string
      lastSeenAt: string
    }>
  }>
  activations: Array<{
    id: string
    licenseId: string
    licenseKey: string
    tenantId: string
    tenantName: string
    productName: string
    deviceId: string
    siteId: string
    installationId: string
    userBinding: string
    activationType: string
    bindingLabel: string
    status: string
    activatedAt: string
    lastSeenAt: string
    environment: Record<string, string>
    maxActivations: number
    activeSeatsForLicense: number
    indicators: {
      stale: boolean
      duplicateMachine: boolean
      multiEnvironment: boolean
      licenseAtCap: boolean
      licenseOverCap: boolean
      inactiveConsumingSeat: boolean
      suspicious: boolean
      highUtilization: boolean
    }
  }>
  usage: Array<{
    id: string
    tenantId: string
    tenantName: string
    productId: string
    productName: string
    metric: string
    metricLabel: string
    value: number
    limitValue: number
    utilizationPercent: number
    period: string
    periodKey: string
    status: 'normal' | 'warning' | 'exceeded'
    rawStatus: string
    recordedAt: string
    warningThresholdPercent: number
    enforcement: 'hard' | 'advisory'
    source: string
  }>
  billingEvents: Array<{
    id: string
    tenantId: string
    tenantName: string
    subscriptionId: string | null
    provider: string
    eventType: string
    amountCents: number
    currency: string
    occurredAt: string
    status: string
    processedAt: string
    retryCount: number
  }>
  plansDetail: Array<{
    id: string
    productId: string
    productName: string
    slug: string
    name: string
    edition: string
    billingCycle: string
    priceCents: number
    currency: string
    status: string
    createdAt: string
    updatedAt: string
    trialSupported: boolean
    visibility: string
    isDefault: boolean
    isRecommended: boolean
    limits: Array<{
      id: string
      limitKey: string
      limitValue: number
      resetPeriod: string
      limitUnit: string
      enforcement: 'hard' | 'soft'
      notes: string
      valueKind: 'number' | 'boolean'
    }>
    limitsSummary: string
    enabledFeatureCount: number
    includedFeatures: Array<{ id: string; featureKey: string; name: string }>
    activeAddonKeys: string[]
    billingMappings: Record<string, string>
    trialSettings: { days: number; requiresPaymentMethod: boolean }
    gracePeriodDays: number
    enterpriseOverrideCompatible: boolean
  }>
  featuresDetail: Array<{
    id: string
    featureKey: string
    name: string
    description: string
    category: string
    productId: string | null
    productName: string | null
    featureType: string
    isBillable: boolean
    defaultEnabled: boolean
    status: string
    visibility: string
    visibilityRules: Record<string, unknown>
    dependencies: Array<{ id: string; name: string; featureKey: string }>
    mutuallyExclusive: Array<{ id: string; name: string; featureKey: string }>
    tags: string[]
    updatedAt: string
    planAssignments: Array<{
      planId: string
      planName: string
      productName: string
      enabled: boolean
    }>
    plansUsingCount: number
    entitledTenants: Array<{ id: string; name: string; via: Array<'entitlement' | 'plan'> }>
    runtimeFlags: Array<{
      id: string
      flagKey: string
      name: string
      status: string
      globallyEnabled: boolean
    }>
    relatedCatalogFlags: Array<{ id: string; name: string; featureKey: string }>
    recentChanges: Array<{
      id: string
      action: string
      actor: string
      createdAt: string
      resourceName: string
    }>
  }>
  subscriptionsDetail: Array<{
    id: string
    tenantId: string
    tenantName: string
    planId: string
    planName: string
    productId: string
    productName: string
    provider: string
    providerRef: string
    status: string
    startsAt: string
    renewalAt: string
    endsAt: string
    graceEndsAt: string
    autoRenew: boolean
    manualContract: boolean
    pausedAt: string
    billingInterval: string
    amountCents: number
    unitAmountCents: number
    licenseCount: number
    activationsPerLicense: number
    currency: string
    addOns: Array<{ id: string; name: string; amountCents: number }>
  }>
  entitlementsDetail: EntitlementsDetailRow[]
  auditTrail: Array<{
    id: string
    tenantId: string | null
    tenantName: string
    actor: string
    action: string
    resourceType: string
    resourceId: string
    resourceName: string
    source: string
    result: string
    detailsJson: string
    createdAt: string
  }>
  featureFlags: Array<{
    id: string
    featureKey: string
    name: string
    description: string
    assignments: Array<{
      planId: string
      planName: string
      productName: string
      enabled: boolean
    }>
  }>
  totals: {
    usageTotal: number
  }
}
