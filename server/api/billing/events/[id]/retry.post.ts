import { eq } from 'drizzle-orm'
import { billingEventsTable } from '../../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../../db/bootstrap'
import { drizzle } from 'drizzle-orm/libsql'
import { replayBillingEventFromRow } from '../../../../core/billing/ingest'
import { requireStaffApiWhenEnforced } from '../../../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing event id' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [row] = await db.select().from(billingEventsTable).where(eq(billingEventsTable.id, id)).limit(1)

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Billing event not found' })
  }

  if (row.processingStatus !== 'failed') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only failed events can be retried',
    })
  }

  return replayBillingEventFromRow(db, row)
})
