import { and, desc, eq, inArray } from 'drizzle-orm'
import { billingEventsTable, plansTable, subscriptionsTable, subscribersTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { drizzle } from 'drizzle-orm/libsql'
import { mapBillingEventRow } from '../../utils/billing-events-map'
import { getStaffOrganizationId } from '../../utils/organizations'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

const STATUSES = new Set(['received', 'processed', 'failed', 'ignored'])

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const query = getQuery(event)
  const provider = typeof query.provider === 'string' ? query.provider.trim() : ''
  const eventType = typeof query.eventType === 'string' ? query.eventType.trim() : ''
  const status = typeof query.status === 'string' ? query.status.trim().toLowerCase() : ''
  const search = typeof query.q === 'string' ? query.q.trim().toLowerCase() : ''
  const subscriberIdFilter = typeof query.subscriber === 'string' ? query.subscriber.trim() : ''

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const orgTenantRows = await db
    .select({ id: subscribersTable.id })
    .from(subscribersTable)
    .where(eq(subscribersTable.organizationId, organizationId))
  const orgTenantIds = orgTenantRows.map((t) => t.id)

  const conditions = []

  if (provider && provider !== 'all') {
    conditions.push(eq(billingEventsTable.provider, provider))
  }

  if (eventType && eventType !== 'all') {
    conditions.push(eq(billingEventsTable.eventType, eventType))
  }

  if (status && status !== 'all') {
    if (!STATUSES.has(status)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid status filter' })
    }
    conditions.push(eq(billingEventsTable.processingStatus, status))
  }

  if (subscriberIdFilter) {
    if (!orgTenantIds.includes(subscriberIdFilter)) {
      return { events: [], providers: [], eventTypes: [] }
    }
    conditions.push(eq(billingEventsTable.subscriberId, subscriberIdFilter))
  } else if (orgTenantIds.length) {
    conditions.push(inArray(billingEventsTable.subscriberId, orgTenantIds))
  } else {
    return { events: [], providers: [], eventTypes: [] }
  }

  const rows = await db
    .select()
    .from(billingEventsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(billingEventsTable.occurredAt))

  const [tenantRows, subscriptionRows, planRows] = await Promise.all([
    db.select().from(subscribersTable).where(eq(subscribersTable.organizationId, organizationId)),
    orgTenantIds.length
      ? db.select().from(subscriptionsTable).where(inArray(subscriptionsTable.subscriberId, orgTenantIds))
      : Promise.resolve([]),
    db.select().from(plansTable),
  ])

  const tenantMap = new Map(tenantRows.map((t) => [t.id, t]))
  const planMap = new Map(planRows.map((p) => [p.id, p]))

  const subscriptionLabel = (subId: string | null) => {
    if (!subId) return null
    const sub = subscriptionRows.find((s) => s.id === subId)
    if (!sub) return subId
    const plan = planMap.get(sub.planId)
    const subscriber = tenantMap.get(sub.subscriberId)
    const bits = [subscriber?.name, plan?.name].filter(Boolean)
    return bits.length ? bits.join(' · ') : subId
  }

  let items = rows.map((row) =>
    mapBillingEventRow(row, tenantMap.get(row.subscriberId)?.name ?? row.subscriberId, subscriptionLabel(row.subscriptionId)),
  )

  if (search) {
    items = items.filter((item) =>
      [
        item.id,
        item.provider,
        item.eventType,
        item.subscriberName,
        item.subscriberId,
        item.subscriptionLabel ?? '',
        item.subscriptionId ?? '',
        item.status,
      ].some((field) => field.toLowerCase().includes(search)),
    )
  }

  const providers = [...new Set(rows.map((r) => r.provider))].sort()
  const eventTypes = [...new Set(rows.map((r) => r.eventType))].sort()

  return { events: items, providers, eventTypes }
})
