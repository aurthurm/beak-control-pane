/**
 * Effect applied after persisting the billing row — keeps ingest provider-agnostic.
 */
export type BillingReconcileOp =
  | {
      op: 'stripe_upsert_subscription'
      stripeSubscriptionId: string
      stripeCustomerId: string
      tenantId?: string
      planId?: string
      status: string
      currentPeriodEndIso?: string
      cancelAtPeriodEnd?: boolean
    }
  | { op: 'none' }

/**
 * Normalized billing event — provider-agnostic shape after webhook/API ingestion.
 */
export type NormalizedBillingEvent = {
  /** Our billing_events row id (often provider event id for idempotency, e.g. Stripe evt_*) */
  id: string
  provider: string
  /** Provider-native event type */
  eventType: string
  tenantId: string
  /** Our subscription id when known */
  subscriptionId: string | null
  amountCents: number
  currency: string
  occurredAt: string
  /** Structured payload for reconciliation */
  data: NormalizedBillingEventData
  /** Effect applied by ingest */
  reconcile: BillingReconcileOp
}

export type NormalizedBillingEventData = {
  stripe?: {
    customerId?: string
    subscriptionId?: string
    priceId?: string
    status?: string
    currentPeriodEnd?: string
    cancelAtPeriodEnd?: boolean
  }
  manual?: {
    note?: string
  }
  /** Plan/product hints when creating or updating subscription */
  planId?: string
  productId?: string
}

export type ProviderCustomer = {
  id: string
  email?: string
  metadata?: Record<string, string>
}

export type ProviderSubscription = {
  id: string
  status: string
  customerId: string
  planId?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
  metadata?: Record<string, string>
}

export type CheckoutSessionParams = {
  tenantId: string
  planId: string
  successUrl: string
  cancelUrl: string
}

export type PortalSessionParams = {
  tenantId: string
  returnUrl: string
}
