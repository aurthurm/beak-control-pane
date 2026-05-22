import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type { BillingProvider } from '../provider'
import type { ProviderCustomer, ProviderSubscription } from '../domain'

/**
 * Manual / contract billing — no external API; subscriptions are created in-console.
 */
export const manualBillingProvider: BillingProvider = {
  name: 'manual',

  async createCustomer(input) {
    return {
      id: `cus_manual_${input.subscriberId.slice(0, 12)}`,
      metadata: { subscriberId: input.subscriberId },
    }
  },

  async createCheckoutSession() {
    throw createError({
      statusCode: 400,
      statusMessage: 'Checkout sessions are not available for manual billing',
    })
  },

  async createBillingPortalSession() {
    throw createError({
      statusCode: 400,
      statusMessage: 'Billing portal is not available for manual billing',
    })
  },

  async getSubscription(providerRef: string) {
    return {
      id: providerRef,
      status: 'active',
      customerId: `cus_manual_${randomUUID().slice(0, 8)}`,
    }
  },

  async validateSubscriptionRef() {
    return true
  },

  async cancelSubscription() {
    /* no-op for manual */
  },
}
