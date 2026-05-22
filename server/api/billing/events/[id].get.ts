import { and, eq } from 'drizzle-orm'
import { billingEventsTable, plansTable, subscriptionsTable, subscribersTable } from '../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../db/bootstrap'
import { drizzle } from 'drizzle-orm/libsql'
import { mapBillingEventDetail } from '../../../utils/billing-events-map'
import { getStaffOrganizationId } from '../../../utils/organizations'
import { requireStaffApiWhenEnforced } from '../../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing event id' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)
  const organizationId = getStaffOrganizationId(event)

  const [row] = await db.select().from(billingEventsTable).where(eq(billingEventsTable.id, id)).limit(1)

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Billing event not found' })
  }

  const [tenantScoped] = await db
    .select()
    .from(subscribersTable)
    .where(and(eq(subscribersTable.id, row.subscriberId), eq(subscribersTable.organizationId, organizationId)))
  if (!tenantScoped) {
    throw createError({ statusCode: 404, statusMessage: 'Billing event not found' })
  }

  const [tenantRows, subscriptionRows, planRows] = await Promise.all([
    db.select().from(subscribersTable).where(eq(subscribersTable.organizationId, organizationId)),
    db.select().from(subscriptionsTable),
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

  return {
    event: mapBillingEventDetail(
      row,
      tenantMap.get(row.subscriberId)?.name ?? row.subscriberId,
      subscriptionLabel(row.subscriptionId),
    ),
  }
})
