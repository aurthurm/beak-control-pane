import type { H3Event } from 'h3'
import type {
  CheckoutSessionParams,
  NormalizedBillingEvent,
  PortalSessionParams,
  ProviderCustomer,
  ProviderSubscription,
} from './domain'

/**
 * Pluggable billing provider (Stripe, Manual, future Paynow).
 */
export type BillingProvider = {
  readonly name: string

  createCustomer(input: { tenantId: string; email?: string; name?: string }): Promise<ProviderCustomer>

  createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string; sessionId: string }>

  createBillingPortalSession(params: PortalSessionParams): Promise<{ url: string }>

  getSubscription(providerRef: string): Promise<ProviderSubscription | null>

  /** Optional validation when admin assigns a provider ref */
  validateSubscriptionRef?(providerRef: string): Promise<boolean>

  cancelSubscription(providerRef: string): Promise<void>

  /**
   * Verify incoming webhook and return one or more normalized events.
   * Manual provider typically does not implement webhooks.
   */
  verifyWebhook?(event: H3Event): Promise<NormalizedBillingEvent[]>
}
