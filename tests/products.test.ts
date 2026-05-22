import { describe, expect, it } from 'vitest'
import type { SubscriptionRow } from '../server/db/schema'
import {
  defaultBillingModeLabel,
  isSubscriptionBillingActive,
  monthlyNormalizedMrr,
  newProductId,
  productTypeLabel,
  slugifyKey,
  subscriberIdsForProduct,
} from '../server/utils/products'

describe('product labels and ids', () => {
  it('formats labels and fallbacks', () => {
    expect(productTypeLabel('offline_capable')).toBe('Offline-capable')
    expect(defaultBillingModeLabel('hybrid_billing')).toBe('Hybrid billing')
    expect(productTypeLabel('custom')).toBe('custom')
    expect(slugifyKey('  New Product Name  ')).toBe('new-product-name')
    expect(slugifyKey('!!!')).toBe('product')
    expect(newProductId()).toMatch(/^prd_[a-f0-9]{24}$/)
  })
})

describe('product billing helpers', () => {
  it('identifies subscription activity and normalizes mrr', () => {
    expect(isSubscriptionBillingActive('ACTIVE')).toBe(true)
    expect(isSubscriptionBillingActive('trialing')).toBe(true)
    expect(isSubscriptionBillingActive('canceled')).toBe(false)
    expect(monthlyNormalizedMrr(120000, 'annual')).toBe(10000)
    expect(monthlyNormalizedMrr(55000, 'manual')).toBe(0)
    expect(monthlyNormalizedMrr(55000, 'monthly')).toBe(55000)
  })
})

describe('subscriberIdsForProduct', () => {
  it('combines subscription, entitlement, and license sources without duplicates', () => {
    const subscriptions = [
      { planId: 'plan_a', subscriberId: 'sub_1', productId: 'prd_other' },
      { planId: 'plan_b', subscriberId: 'sub_2', productId: 'prd_other' },
    ] as unknown as SubscriptionRow[]

    const ids = subscriberIdsForProduct(
      'prd_target',
      new Set(['plan_a', 'plan_c']),
      subscriptions,
      [
        { subscriberId: 'sub_2', productId: 'prd_target' },
        { subscriberId: 'sub_3', productId: 'prd_target' },
      ],
      [
        { subscriberId: 'sub_3', productId: 'prd_target' },
        { subscriberId: 'sub_4', productId: 'prd_target' },
      ],
    )

    expect(ids).toEqual(new Set(['sub_1', 'sub_2', 'sub_3', 'sub_4']))
  })
})
