import { eq } from 'drizzle-orm'
import { billingEventsTable } from '../../../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../../../db/bootstrap'
import { drizzle } from 'drizzle-orm/libsql'
import { requireStaffApiWhenEnforced } from '../../../../utils/auth-guards'

function isoNow() {
  return new Date().toISOString()
}

function parseLogs(raw: string): Array<{ at: string; level: string; message: string }> {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as Array<{ at: string; level: string; message: string }>) : []
  } catch {
    return []
  }
}

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

  if (row.processingStatus === 'ignored') {
    return { ok: true, alreadyIgnored: true }
  }

  const now = isoNow()
  const logs = parseLogs(row.processingLogsJson)
  logs.push({
    at: now,
    level: 'warn',
    message: 'Marked ignored from control plane — no further processing',
  })

  await db
    .update(billingEventsTable)
    .set({
      processingStatus: 'ignored',
      processedAt: now,
      errorJson: '',
      processingLogsJson: JSON.stringify(logs),
    })
    .where(eq(billingEventsTable.id, id))

  return { ok: true }
})
