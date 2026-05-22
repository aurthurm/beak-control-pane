import { getHeader, readRawBody } from 'h3'
import type { H3Event } from 'h3'
import Stripe from 'stripe'
import type { BillingProvider } from '../provider'
import { createError } from 'h3'
import type { NormalizedBillingEvent, BillingReconcileOp, CheckoutSessionParams, PortalSessionParams } from '../domain'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { plansTable, subscriptionsTable, subscribersTable } from '../../../db/schema'

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    throw createError({ statusCode: 503, statusMessage: 'STRIPE_SECRET_KEY is not configured' })
  }
  return new Stripe(key)
}

function mapStripeSubStatus(status: Stripe.Subscription.Status): string {
  const m: Record<string, string> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    unpaid: 'unpaid',
    canceled: 'canceled',
    incomplete: 'past_due',
    incomplete_expired: 'expired',
    paused: 'past_due',
  }
  return m[status] ?? 'active'
}

function metaTenantId(m: Stripe.Metadata | null): string | undefined {
  if (!m) return undefined
  return (m.subscriberId || m.subscriber_id || m['subscriber-id'])?.trim() || undefined
}

function metaPlanId(m: Stripe.Metadata | null): string | undefined {
  if (!m) return undefined
  return (m.planId || m.plan_id || m['plan-id'])?.trim() || undefined
}

function reconcileFromSubscription(sub: Stripe.Subscription): Extract<BillingReconcileOp, { op: 'stripe_upsert_subscription' }> {
  const cust = sub.customer
  const stripeCustomerId = typeof cust === 'string' ? cust : cust?.id ?? ''
  return {
    op: 'stripe_upsert_subscription',
    stripeSubscriptionId: sub.id,
    stripeCustomerId,
    subscriberId: metaTenantId(sub.metadata),
    planId: metaPlanId(sub.metadata),
    status: mapStripeSubStatus(sub.status),
    currentPeriodEndIso: new Date(sub.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  }
}

async function mapStripeEvent(stripe: Stripe, evt: Stripe.Event): Promise<NormalizedBillingEvent[]> {
  const occurredAt = new Date(evt.created * 1000).toISOString()

  if (evt.type === 'checkout.session.completed') {
    const session = evt.data.object as Stripe.Checkout.Session
    let subId = session.subscription
    if (typeof subId !== 'string' && subId && typeof subId === 'object') {
      subId = (subId as Stripe.Subscription).id
    }
    if (typeof subId !== 'string') {
      return [
        {
          id: evt.id,
          provider: 'stripe',
          eventType: evt.type,
          subscriberId: session.client_reference_id?.trim() || metaTenantId(session.metadata) || 'unknown',
          subscriptionId: null,
          amountCents: 0,
          currency: (session.currency ?? 'usd').toUpperCase(),
          occurredAt,
          data: { stripe: {} },
          reconcile: { op: 'none' },
        },
      ]
    }
    const sub = await stripe.subscriptions.retrieve(subId, { expand: ['customer'] })
    const subscriberId =
      metaTenantId(sub.metadata) || session.client_reference_id?.trim() || metaTenantId(session.metadata) || 'unknown'
    const reconcile = reconcileFromSubscription(sub)
    if (!reconcile.subscriberId && subscriberId !== 'unknown') {
      reconcile.subscriberId = subscriberId
    }
    if (!reconcile.planId && session.metadata) {
      reconcile.planId = metaPlanId(session.metadata)
    }
    return [
      {
        id: evt.id,
        provider: 'stripe',
        eventType: evt.type,
        subscriberId,
        subscriptionId: null,
        amountCents: 0,
        currency: (session.currency ?? 'usd').toUpperCase(),
        occurredAt,
        data: {
          stripe: {
            subscriptionId: sub.id,
            customerId: reconcile.stripeCustomerId,
            status: sub.status,
            currentPeriodEnd: reconcile.currentPeriodEndIso,
          },
        },
        reconcile,
      },
    ]
  }

  if (
    evt.type === 'customer.subscription.created' ||
    evt.type === 'customer.subscription.updated' ||
    evt.type === 'customer.subscription.deleted'
  ) {
    const sub = evt.data.object as Stripe.Subscription
    const reconcile = reconcileFromSubscription(sub)
    const subscriberId = metaTenantId(sub.metadata) || 'unknown'
    return [
      {
        id: evt.id,
        provider: 'stripe',
        eventType: evt.type,
        subscriberId,
        subscriptionId: null,
        amountCents: 0,
        currency: 'USD',
        occurredAt,
        data: {
          stripe: {
            subscriptionId: sub.id,
            customerId: reconcile.stripeCustomerId,
            status: sub.status,
            currentPeriodEnd: reconcile.currentPeriodEndIso,
          },
        },
        reconcile,
      },
    ]
  }

  /** invoice.paid — informational; resolve subscriber via subscription metadata when possible */
  if (evt.type === 'invoice.paid' || evt.type === 'invoice.payment_failed') {
    const inv = evt.data.object as Stripe.Invoice
    let subscriberId = 'unknown'
    const subRef = inv.subscription
    const sid = typeof subRef === 'string' ? subRef : subRef && typeof subRef === 'object' ? subRef.id : null
    if (sid) {
      const sub = await stripe.subscriptions.retrieve(sid)
      subscriberId = metaTenantId(sub.metadata) ?? 'unknown'
    }
    return [
      {
        id: evt.id,
        provider: 'stripe',
        eventType: evt.type,
        subscriberId,
        subscriptionId: null,
        amountCents: inv.amount_paid ?? 0,
        currency: (inv.currency ?? 'usd').toUpperCase(),
        occurredAt,
        data: {},
        reconcile: { op: 'none' },
      },
    ]
  }

  return [
    {
      id: evt.id,
      provider: 'stripe',
      eventType: evt.type,
      subscriberId: 'unknown',
      subscriptionId: null,
      amountCents: 0,
      currency: 'USD',
      occurredAt,
      data: {},
      reconcile: { op: 'none' },
    },
  ]
}

export const stripeBillingProvider: BillingProvider = {
  name: 'stripe',

  async createCustomer(input) {
    const stripe = getStripe()
    const c = await stripe.customers.create({
      metadata: { subscriberId: input.subscriberId },
      email: input.email,
      name: input.name,
    })
    return { id: c.id, email: c.email ?? undefined, metadata: c.metadata as Record<string, string> }
  },

  async createCheckoutSession(params: CheckoutSessionParams) {
    const stripe = getStripe()
    const client = getDatabaseClient()
    await bootstrapDatabase(client)
    const db = drizzle(client)

    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, params.planId)).limit(1)
    if (!plan) {
      throw createError({ statusCode: 404, statusMessage: 'Plan not found' })
    }

    let priceId: string | null = null
    try {
      const meta = JSON.parse(plan.metadataJson || '{}') as { billingMappings?: { stripe?: string } }
      priceId = meta.billingMappings?.stripe?.trim() || null
    } catch {
      priceId = null
    }
    if (!priceId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Plan has no Stripe price id in metadata (billingMappings.stripe)',
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: params.subscriberId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      subscription_data: {
        metadata: {
          subscriberId: params.subscriberId,
          planId: params.planId,
          productId: plan.productId,
        },
      },
    })

    if (!session.url || !session.id) {
      throw createError({ statusCode: 502, statusMessage: 'Stripe did not return a checkout URL' })
    }

    return { url: session.url, sessionId: session.id }
  },

  async createBillingPortalSession(params: PortalSessionParams) {
    const stripe = getStripe()
    const client = getDatabaseClient()
    await bootstrapDatabase(client)
    const db = drizzle(client)

    const [subscriber] = await db.select().from(subscribersTable).where(eq(subscribersTable.id, params.subscriberId)).limit(1)
    if (!subscriber) {
      throw createError({ statusCode: 404, statusMessage: 'Tenant not found' })
    }

    const subs = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.subscriberId, params.subscriberId))

    let customerId: string | null = null
    for (const s of subs) {
      if (s.provider !== 'stripe') continue
      try {
        const meta = JSON.parse(s.providerMetadataJson || '{}') as { stripe_customer_id?: string }
        if (meta.stripe_customer_id) {
          customerId = meta.stripe_customer_id
          break
        }
      } catch {
        /* ignore */
      }
    }

    if (!customerId) {
      const c = await stripe.customers.create({
        metadata: { subscriberId: params.subscriberId },
        email: subscriber.email?.trim() || undefined,
        name: subscriber.name,
      })
      customerId = c.id
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: params.returnUrl,
    })

    if (!portal.url) {
      throw createError({ statusCode: 502, statusMessage: 'Stripe did not return a portal URL' })
    }

    return { url: portal.url }
  },

  async getSubscription(providerRef: string) {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(providerRef)
    const cust = sub.customer
    return {
      id: sub.id,
      status: sub.status,
      customerId: typeof cust === 'string' ? cust : cust.id,
      currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      metadata: sub.metadata as Record<string, string>,
    }
  },

  async validateSubscriptionRef(providerRef: string) {
    try {
      const stripe = getStripe()
      await stripe.subscriptions.retrieve(providerRef)
      return true
    } catch {
      return false
    }
  },

  async cancelSubscription(providerRef: string) {
    const stripe = getStripe()
    await stripe.subscriptions.cancel(providerRef)
  },

  async verifyWebhook(event: H3Event): Promise<NormalizedBillingEvent[]> {
    const { normalized } = await parseStripeWebhookEvent(event)
    return normalized
  },
}

/** Parse + verify Stripe webhook; returns raw JSON string for billing_events.payload_json */
export async function parseStripeWebhookEvent(event: H3Event): Promise<{
  rawPayload: string
  stripeEvent: Stripe.Event
  normalized: NormalizedBillingEvent[]
}> {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw createError({ statusCode: 503, statusMessage: 'STRIPE_WEBHOOK_SECRET is not configured' })
  }
  const sig = getHeader(event, 'stripe-signature')
  const raw = await readRawBody(event, false)
  if (!sig || raw === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Missing stripe-signature or body' })
  }
  const payload = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8')
  const evt = stripe.webhooks.constructEvent(payload, sig, secret)
  const normalized = await mapStripeEvent(stripe, evt)
  return { rawPayload: payload, stripeEvent: evt, normalized }
}
