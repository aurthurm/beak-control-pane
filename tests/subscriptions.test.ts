import { describe, expect, it } from 'vitest'
import type { PlanRow, SubscriptionRow, TenantRow } from '../server/db/schema'
import {
  effectiveSubscriptionPricing,
  nextRenewalFromPlan,
  defaultContractEnd,
  parseAddOns,
  parseProviderMetadata,
  subscriptionListItem,
} from '../server/utils/subscriptions'

function baseSubscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub_1',
    subscriberId: 'tenant_1',
    planId: 'plan_1',
    provider: 'stripe',
    providerRef: 'sub_123',
    status: 'active',
    startsAt: '2026-04-01T00:00:00Z',
    renewalAt: '2026-05-01T00:00:00Z',
    endsAt: '2026-05-01T00:00:00Z',
    graceEndsAt: '',
    autoRenew: true,
    licenseCount: 2,
    activationsPerLicense: 3,
    amountOverrideCents: null,
    currencyOverride: '',
    addOnsJson: '[]',
    manualContract: false,
    pausedAt: '',
    providerMetadataJson: '{}',
    ...overrides,
  }
}

const plan = {
  id: 'plan_1',
  productId: 'prd_1',
  slug: 'plan-1',
  name: 'Pro',
  billingCycle: 'annual',
  priceCents: 120000,
  currency: 'USD',
  status: 'active',
  createdAt: '2026-04-01T00:00:00Z',
  edition: 'Pro',
  updatedAt: '2026-04-01T00:00:00Z',
  trialSupported: true,
  visibility: 'public',
  isDefault: false,
  isRecommended: true,
  metadataJson: '{}',
} as unknown as PlanRow

describe('subscription parsers', () => {
  it('parses add-ons and provider metadata defensively', () => {
    expect(parseAddOns('[{"id":"a","name":"Add-on","amountCents":12.4},{"id":"","name":"x","amountCents":1}]')).toEqual([
      { id: 'a', name: 'Add-on', amountCents: 12 },
    ])
    expect(parseAddOns('not-json')).toEqual([])
    expect(parseProviderMetadata('{"a":"1","b":2,"c":{"nested":true}}')).toEqual({
      a: '1',
      b: '2',
      c: '{"nested":true}',
    })
  })
})

describe('subscription pricing', () => {
  it('computes unit and total amounts with overrides and add-ons', () => {
    const pricing = effectiveSubscriptionPricing(
      {
        amountOverrideCents: 150000,
        currencyOverride: 'EUR',
        addOnsJson: '[{"id":"addon","name":"Priority","amountCents":2500}]',
        licenseCount: 2,
        activationsPerLicense: 3,
      },
      plan,
    )

    expect(pricing).toMatchObject({
      amountCents: 305000,
      baseCents: 150000,
      addOnTotalCents: 2500,
      unitAmountCents: 152500,
      licenseCount: 2,
      activationsPerLicense: 3,
      currency: 'EUR',
      billingInterval: 'annual',
    })
  })

  it('maps subscription rows to list items', () => {
    const row = baseSubscription({
      addOnsJson: '[{"id":"addon","name":"Priority","amountCents":2500}]',
      providerMetadataJson: '{"stripePriceId":"price_1","contract":{"id":"c_1"}}',
    })
    const subscriber = { name: 'Acme Clinic' } as TenantRow
    const item = subscriptionListItem(row, plan, 'Product One', 'prd_1', subscriber)

    expect(item.subscriberId).toBe('tenant_1')
    expect(item.subscriberName).toBe('Acme Clinic')
    expect(item.productName).toBe('Product One')
    expect(item.planName).toBe('Pro')
    expect(item.amountCents).toBe(245000)
    expect(item.unitAmountCents).toBe(122500)
    expect(item.providerMetadata).toEqual({
      stripePriceId: 'price_1',
      contract: '{"id":"c_1"}',
    })
    expect(item.addOns).toEqual([{ id: 'addon', name: 'Priority', amountCents: 2500 }])
  })
})

describe('subscription date helpers', () => {
  it('moves renewal dates forward correctly', () => {
    const start = new Date('2026-01-15T00:00:00Z')
    expect(nextRenewalFromPlan(start, 'annual').toISOString()).toBe('2027-01-15T00:00:00.000Z')
    expect(defaultContractEnd(start).toISOString()).toBe('2027-01-15T00:00:00.000Z')
  })
})
