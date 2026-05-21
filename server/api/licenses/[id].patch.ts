import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { licensesTable } from '../../db/schema'
import { signLicenseOrThrow } from '../../core/licensing/reissue'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

type PatchBody = {
  action?: 'revoke' | 'regenerate' | 'reissue' | 'supersede' | 'bind'
  siteId?: string
  deviceId?: string
  reason?: string
}

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'License id is required' })
  }

  const body = await readBody<PatchBody>(event)
  const action = body.action

  if (!action) {
    throw createError({ statusCode: 400, statusMessage: 'action is required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [row] = await db.select().from(licensesTable).where(eq(licensesTable.id, id))

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'License not found' })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(row.payloadJson) as Record<string, unknown>
  } catch {
    payload = {}
  }

  const bumpIssue = () => {
    const issue = (payload.issue as Record<string, unknown> | undefined) ?? {}
    const rev = Number(issue.revision ?? 0) + 1
    payload.issue = {
      ...issue,
      issuedBy: 'console',
      issuedAt: new Date().toISOString(),
      reason: body.reason ?? action,
      revision: rev,
    }
  }

  switch (action) {
    case 'revoke': {
      await db.update(licensesTable).set({ status: 'revoked' }).where(eq(licensesTable.id, id))
      return { ok: true, id, status: 'revoked' as const }
    }
    case 'supersede': {
      await db.update(licensesTable).set({ status: 'superseded' }).where(eq(licensesTable.id, id))
      return { ok: true, id, status: 'superseded' as const }
    }
    case 'regenerate': {
      bumpIssue()
      const signature = await signLicenseOrThrow(payload)
      await db
        .update(licensesTable)
        .set({
          signature,
          payloadJson: JSON.stringify(payload),
        })
        .where(eq(licensesTable.id, id))
      return { ok: true, id, signature }
    }
    case 'reissue': {
      bumpIssue()
      const validTo = new Date()
      validTo.setFullYear(validTo.getFullYear() + 1)
      const graceUntil = new Date(validTo)
      graceUntil.setDate(graceUntil.getDate() + 15)
      const parts = row.licenseKey.split('-')
      const newKey = `${parts.slice(0, -1).join('-')}-${randomUUID().slice(0, 4).toUpperCase()}`
      const signature = await signLicenseOrThrow(payload)
      await db
        .update(licensesTable)
        .set({
          licenseKey: newKey,
          validTo: validTo.toISOString(),
          graceUntil: graceUntil.toISOString(),
          status: 'active',
          signature,
          payloadJson: JSON.stringify(payload),
        })
        .where(eq(licensesTable.id, id))
      return { ok: true, id, licenseKey: newKey, validTo: validTo.toISOString(), graceUntil: graceUntil.toISOString() }
    }
    case 'bind': {
      const prev =
        typeof payload.binding === 'object' && payload.binding !== null
          ? (payload.binding as Record<string, unknown>)
          : {}
      payload.binding = {
        ...prev,
        ...(body.siteId?.trim() ? { siteId: body.siteId.trim() } : {}),
        ...(body.deviceId?.trim() ? { deviceId: body.deviceId.trim() } : {}),
      }
      bumpIssue()
      await db.update(licensesTable).set({ payloadJson: JSON.stringify(payload) }).where(eq(licensesTable.id, id))
      return { ok: true, id, binding: payload.binding }
    }
    default:
      throw createError({ statusCode: 400, statusMessage: 'Unknown action' })
  }
})
