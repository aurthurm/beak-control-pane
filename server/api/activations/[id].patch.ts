import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { activationsTable } from '../../db/schema'
import { appendHeartbeatJson, parseEnvironmentJson } from '../../utils/activations'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

type PatchBody = {
  action?: 'release' | 'invalidate' | 'checkin'
  environment?: Record<string, string>
}

function clientIp(event: H3Event) {
  const xf = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
  if (xf) {
    return xf
  }
  const rip = event.node?.req.socket.remoteAddress
  return rip ?? ''
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = event.context.params?.id?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Activation id required' })
  }

  const body = await readBody<PatchBody>(event)
  const action = body.action

  if (!action || !['release', 'invalidate', 'checkin'].includes(action)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'action must be release, invalidate, or checkin',
    })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [row] = await db.select().from(activationsTable).where(eq(activationsTable.id, id))
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Activation not found' })
  }

  if (action === 'release') {
    await db.update(activationsTable).set({ status: 'released' }).where(eq(activationsTable.id, id))
    return { id, status: 'released' as const }
  }

  if (action === 'invalidate') {
    await db.update(activationsTable).set({ status: 'invalid' }).where(eq(activationsTable.id, id))
    return { id, status: 'invalid' as const }
  }

  const ip = clientIp(event)
  const now = new Date().toISOString()
  const hbEntry = { at: now, ...(ip ? { ip } : {}) }
  const heartbeatsJson = appendHeartbeatJson(row.heartbeatsJson, hbEntry)
  const envPrev = parseEnvironmentJson(row.environmentJson)
  const envNext = { ...envPrev, ...(body.environment ?? {}) }
  if (ip && !envNext.ip) {
    envNext.ip = ip
  }

  await db
    .update(activationsTable)
    .set({
      lastSeenAt: now,
      heartbeatsJson,
      environmentJson: JSON.stringify(envNext),
    })
    .where(eq(activationsTable.id, id))

  return { id, status: row.status, lastSeenAt: now, checkin: true as const }
})
