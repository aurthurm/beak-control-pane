import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import { createSubscriptionRecord } from '../core/billing/create-subscription-record'
import { getBillingProvider } from '../core/billing/registry'
import { requireStaffApiWhenEnforced } from '../utils/auth-guards'

type Body = {
  subscriberId?: string
  planId?: string
  provider?: string
  providerRef?: string
  licenseCount?: number
  activationsPerLicense?: number
  status?: string
  startsAt?: string
  renewalAt?: string
  endsAt?: string
  graceEndsAt?: string
  autoRenew?: boolean
  manualContract?: boolean
  amountOverrideCents?: number | null
  currencyOverride?: string
  addOnsJson?: string
  providerMetadataJson?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const body = await readBody<Body>(event)
  const provider = body.provider?.trim().toLowerCase() || 'manual'

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const adapter = getBillingProvider(provider)

  if (provider !== 'manual' && adapter.validateSubscriptionRef) {
    const ok = await adapter.validateSubscriptionRef(body.providerRef?.trim() ?? '')
    if (!ok) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid ${provider} subscription reference`,
      })
    }
  }

  return createSubscriptionRecord(db, {
    subscriberId: body.subscriberId ?? '',
    planId: body.planId ?? '',
    provider,
    providerRef: body.providerRef?.trim() ?? '',
    licenseCount: body.licenseCount,
    activationsPerLicense: body.activationsPerLicense,
    status: body.status,
    startsAt: body.startsAt,
    renewalAt: body.renewalAt,
    endsAt: body.endsAt,
    graceEndsAt: body.graceEndsAt,
    autoRenew: body.autoRenew,
    manualContract: body.manualContract,
    amountOverrideCents: body.amountOverrideCents,
    currencyOverride: body.currencyOverride,
    addOnsJson: body.addOnsJson,
    providerMetadataJson: body.providerMetadataJson,
  })
})
