import { integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const organizationsTable = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull().default(''),
})

export const productsTable = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  productType: text('product_type').notNull(),
  defaultBillingMode: text('default_billing_mode').notNull(),
  offlineLicensesSupported: integer('offline_licenses_supported', { mode: 'boolean' }).notNull().default(false),
  activationsRequired: integer('activations_required', { mode: 'boolean' }).notNull().default(true),
  usageTrackingEnabled: integer('usage_tracking_enabled', { mode: 'boolean' }).notNull().default(true),
  extraDetails: text('extra_details').notNull().default(''),
  },
  (t) => [unique('uq_products_organization_slug').on(t.organizationId, t.slug)],
)

export const plansTable = sqliteTable('plans', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => productsTable.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  billingCycle: text('billing_cycle').notNull(),
  priceCents: integer('price_cents').notNull(),
  currency: text('currency').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  edition: text('edition').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
  trialSupported: integer('trial_supported', { mode: 'boolean' }).notNull().default(false),
  visibility: text('visibility').notNull().default('public'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  isRecommended: integer('is_recommended', { mode: 'boolean' }).notNull().default(false),
  metadataJson: text('metadata_json').notNull().default('{}'),
})

export const featuresTable = sqliteTable('features', {
  id: text('id').primaryKey(),
  featureKey: text('feature_key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  productId: text('product_id').references(() => productsTable.id, { onDelete: 'set null' }),
  featureType: text('feature_type').notNull().default('module'),
  isBillable: integer('is_billable', { mode: 'boolean' }).notNull().default(true),
  defaultEnabled: integer('default_enabled', { mode: 'boolean' }).notNull().default(true),
  status: text('status').notNull().default('active'),
  visibility: text('visibility').notNull().default('public'),
  visibilityRulesJson: text('visibility_rules_json').notNull().default('{}'),
  dependenciesJson: text('dependencies_json').notNull().default('[]'),
  mutuallyExclusiveJson: text('mutually_exclusive_json').notNull().default('[]'),
  tagsJson: text('tags_json').notNull().default('[]'),
  updatedAt: text('updated_at').notNull().default(''),
})

export const planFeaturesTable = sqliteTable(
  'plan_features',
  {
    planId: text('plan_id').notNull().references(() => plansTable.id, { onDelete: 'cascade' }),
    featureId: text('feature_id').notNull().references(() => featuresTable.id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.planId, table.featureId] }),
  }),
)

export const planLimitsTable = sqliteTable(
  'plan_limits',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id').notNull().references(() => plansTable.id, { onDelete: 'cascade' }),
    limitKey: text('limit_key').notNull(),
    limitValue: integer('limit_value').notNull(),
    resetPeriod: text('reset_period').notNull(),
    limitUnit: text('limit_unit').notNull().default(''),
    enforcement: text('enforcement').notNull().default('hard'),
    notes: text('notes').notNull().default(''),
    valueKind: text('value_kind').notNull().default('number'),
  },
)

/** Product-scoped limit keys: define once, edit values per plan in plan_limits. */
export const productLimitKeysTable = sqliteTable(
  'product_limit_keys',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').notNull().references(() => productsTable.id, { onDelete: 'cascade' }),
    limitKey: text('limit_key').notNull(),
    resetPeriod: text('reset_period').notNull().default('monthly'),
    limitUnit: text('limit_unit').notNull().default(''),
    valueKind: text('value_kind').notNull().default('number'),
    enforcement: text('enforcement').notNull().default('hard'),
    notes: text('notes').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (t) => [unique('uq_product_limit_keys_product_key').on(t.productId, t.limitKey)],
)

/** Product-scoped add-on keys: define once; enable per plan in plan_addons. */
export const productAddonKeysTable = sqliteTable(
  'product_addon_keys',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').notNull().references(() => productsTable.id, { onDelete: 'cascade' }),
    addonKey: text('addon_key').notNull(),
    displayName: text('display_name').notNull().default(''),
    notes: text('notes').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (t) => [unique('uq_product_addon_keys_product_key').on(t.productId, t.addonKey)],
)

export const planAddonsTable = sqliteTable(
  'plan_addons',
  {
    planId: text('plan_id').notNull().references(() => plansTable.id, { onDelete: 'cascade' }),
    addonKey: text('addon_key').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.planId, table.addonKey] }),
  }),
)

export const tenantsTable = sqliteTable(
  'tenants',
  {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizationsTable.id, { onDelete: 'restrict' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  legalName: text('legal_name').notNull().default(''),
  industry: text('industry').notNull(),
  status: text('status').notNull(),
  seats: integer('seats').notNull(),
  createdAt: text('created_at').notNull(),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  country: text('country').notNull().default(''),
  billingMode: text('billing_mode').notNull().default(''),
  billingProvider: text('billing_provider').notNull().default(''),
  supportTier: text('support_tier').notNull().default(''),
  internalNotes: text('internal_notes').notNull().default(''),
  contactName: text('contact_name').notNull().default(''),
  /** standard | smb | mid_market | enterprise — for reporting and flag rollouts */
  enterpriseSegment: text('enterprise_segment').notNull().default(''),
  },
  (t) => [unique('uq_tenants_organization_slug').on(t.organizationId, t.slug)],
)

/** Named enterprise agreements (MSA, custom entitlements) — Phase 4. */
export const enterpriseContractsTable = sqliteTable('enterprise_contracts', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenantsTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  msaReference: text('msa_reference').notNull().default(''),
  accountOwner: text('account_owner').notNull().default(''),
  entitlementOverridesJson: text('entitlement_overrides_json').notNull().default('{}'),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const subscriptionsTable = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull().references(() => plansTable.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref').notNull(),
  status: text('status').notNull(),
  startsAt: text('starts_at').notNull(),
  renewalAt: text('renewal_at').notNull(),
  endsAt: text('ends_at').notNull(),
  graceEndsAt: text('grace_ends_at').notNull().default(''),
  autoRenew: integer('auto_renew', { mode: 'boolean' }).notNull().default(true),
  licenseCount: integer('license_count').notNull().default(1),
  activationsPerLicense: integer('activations_per_license').notNull().default(1),
  amountOverrideCents: integer('amount_override_cents'),
  currencyOverride: text('currency_override').notNull().default(''),
  addOnsJson: text('add_ons_json').notNull().default('[]'),
  manualContract: integer('manual_contract', { mode: 'boolean' }).notNull().default(false),
  pausedAt: text('paused_at').notNull().default(''),
  providerMetadataJson: text('provider_metadata_json').notNull().default('{}'),
})

export const entitlementsTable = sqliteTable('entitlements', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => productsTable.id, { onDelete: 'cascade' }),
  payloadJson: text('payload_json').notNull(),
  computedAt: text('computed_at').notNull(),
})

export const licensesTable = sqliteTable('licenses', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => productsTable.id, { onDelete: 'cascade' }),
  subscriptionId: text('subscription_id').references(() => subscriptionsTable.id, { onDelete: 'set null' }),
  licenseKey: text('license_key').notNull().unique(),
  mode: text('mode').notNull(),
  status: text('status').notNull(),
  validFrom: text('valid_from').notNull(),
  validTo: text('valid_to').notNull(),
  graceUntil: text('grace_until').notNull(),
  signature: text('signature').notNull(),
  payloadJson: text('payload_json').notNull(),
  offlineAllowed: integer('offline_allowed', { mode: 'boolean' }).notNull().default(false),
  maxActivations: integer('max_activations').notNull(),
})

export const activationsTable = sqliteTable('activations', {
  id: text('id').primaryKey(),
  licenseId: text('license_id').notNull().references(() => licensesTable.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').notNull(),
  siteId: text('site_id').notNull(),
  installationId: text('installation_id').notNull(),
  status: text('status').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  activationType: text('activation_type').notNull().default('machine'),
  activatedAt: text('activated_at').notNull().default(''),
  environmentJson: text('environment_json').notNull().default('{}'),
  heartbeatsJson: text('heartbeats_json').notNull().default('[]'),
  violationsJson: text('violations_json').notNull().default('[]'),
  userBinding: text('user_binding').notNull().default(''),
})

export const usageRecordsTable = sqliteTable('usage_records', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
  productId: text('product_id').references(() => productsTable.id, { onDelete: 'set null' }),
  metric: text('metric').notNull(),
  value: integer('value').notNull(),
  limitValue: integer('limit_value').notNull(),
  period: text('period').notNull(),
  periodKey: text('period_key').notNull().default(''),
  status: text('status').notNull(),
  recordedAt: text('recorded_at').notNull(),
  warningThresholdPercent: integer('warning_threshold_percent').notNull().default(80),
  enforcement: text('enforcement').notNull().default('hard'),
  source: text('source').notNull().default(''),
})

export const billingEventsTable = sqliteTable('billing_events', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  tenantId: text('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
  subscriptionId: text('subscription_id').references(() => subscriptionsTable.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull(),
  occurredAt: text('occurred_at').notNull(),
  payloadJson: text('payload_json').notNull(),
  processingStatus: text('processing_status').notNull().default('processed'),
  processedAt: text('processed_at').notNull().default(''),
  retryCount: integer('retry_count').notNull().default(0),
  normalizedJson: text('normalized_json').notNull().default('{}'),
  processingLogsJson: text('processing_logs_json').notNull().default('[]'),
  errorJson: text('error_json').notNull().default(''),
  impactedRecordsJson: text('impacted_records_json').notNull().default('[]'),
})

export const auditLogsTable = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').references(() => tenantsTable.id, { onDelete: 'set null' }),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  resourceName: text('resource_name').notNull().default(''),
  source: text('source').notNull().default('job'),
  result: text('result').notNull().default('success'),
  detailsJson: text('details_json').notNull(),
  createdAt: text('created_at').notNull(),
})

/** Runtime rollout flags — separate from commercial entitlements / plan_features. */
export const runtimeFeatureFlagsTable = sqliteTable('runtime_feature_flags', {
  id: text('id').primaryKey(),
  flagKey: text('flag_key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  productId: text('product_id').references(() => productsTable.id, { onDelete: 'set null' }),
  linkedFeatureId: text('linked_feature_id').references(() => featuresTable.id, { onDelete: 'set null' }),
  planAssignmentsJson: text('plan_assignments_json').notNull().default('[]'),
  flagType: text('flag_type').notNull().default('release'),
  status: text('status').notNull().default('active'),
  scope: text('scope').notNull().default('global'),
  defaultValue: text('default_value').notNull().default('false'),
  rolloutStrategy: text('rollout_strategy').notNull().default('full_rollout'),
  rolloutPercent: integer('rollout_percent').notNull().default(100),
  globallyEnabled: integer('globally_enabled', { mode: 'boolean' }).notNull().default(true),
  rulesJson: text('rules_json').notNull().default('{}'),
  targetTenantIdsJson: text('target_tenant_ids_json').notNull().default('[]'),
  environmentValuesJson: text('environment_values_json').notNull().default('{}'),
  evaluationHistoryJson: text('evaluation_history_json').notNull().default('[]'),
  expiresAt: text('expires_at').notNull().default(''),
  archivedAt: text('archived_at').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  /** platform_admin | support | customer */
  platformRole: text('platform_role').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull().default(''),
})

export const sessionsTable = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
})

export const organizationMembershipsTable = sqliteTable(
  'organization_memberships',
  {
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    /** owner | admin | member */
    membershipRole: text('membership_role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.organizationId] })],
)

export const orgInvitesTable = sqliteTable('org_invites', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizationsTable.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  invitedByUserId: text('invited_by_user_id').references(() => usersTable.id, { onDelete: 'set null' }),
  expiresAt: text('expires_at').notNull(),
  consumedAt: text('consumed_at').notNull().default(''),
  createdAt: text('created_at').notNull(),
})

export const adminInvitesTable = sqliteTable('admin_invites', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull(),
  invitedByUserId: text('invited_by_user_id').references(() => usersTable.id, { onDelete: 'set null' }),
  /** support | platform_admin */
  targetRole: text('target_role').notNull(),
  expiresAt: text('expires_at').notNull(),
  consumedAt: text('consumed_at').notNull().default(''),
  createdAt: text('created_at').notNull(),
})

export type OrganizationRow = typeof organizationsTable.$inferSelect
export type ProductRow = typeof productsTable.$inferSelect
export type PlanRow = typeof plansTable.$inferSelect
export type FeatureRow = typeof featuresTable.$inferSelect
export type TenantRow = typeof tenantsTable.$inferSelect
export type SubscriptionRow = typeof subscriptionsTable.$inferSelect
export type LicenseRow = typeof licensesTable.$inferSelect
export type ActivationRow = typeof activationsTable.$inferSelect
export type UsageRow = typeof usageRecordsTable.$inferSelect
export type EnterpriseContractRow = typeof enterpriseContractsTable.$inferSelect
export type BillingEventRow = typeof billingEventsTable.$inferSelect
export type AuditLogRow = typeof auditLogsTable.$inferSelect
export type RuntimeFeatureFlagRow = typeof runtimeFeatureFlagsTable.$inferSelect
export type UserRow = typeof usersTable.$inferSelect
export type SessionRow = typeof sessionsTable.$inferSelect
export type OrganizationMembershipRow = typeof organizationMembershipsTable.$inferSelect
