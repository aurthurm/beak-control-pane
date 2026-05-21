import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../db/bootstrap'
import { activationsTable, licensesTable } from '../db/schema'
import {
  activationCountsTowardCap,
  appendHeartbeatJson,
  appendViolationJson,
} from '../utils/activations'
import { requireIngestSecretOrStaffApi } from '../utils/ingest-auth'

const ACTIVATION_TYPES = new Set(['machine', 'server', 'site', 'user', 'installation'])

type ActivationRequestBody = {
  licenseId?: string
  /** Alternative to licenseId — resolves the license row by key */
  licenseKey?: string
  deviceId?: string
  siteId?: string
  installationId?: string
  activationType?: string
  userBinding?: string
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

function parseEnvironmentForMerge(raw: string): Record<string, string> {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, val] of Object.entries(v ?? {})) {
      if (val == null) {
        continue
      }
      out[k] = typeof val === 'string' ? val : JSON.stringify(val)
    }
    return out
  } catch {
    return {}
  }
}

export default defineEventHandler(async (event) => {
  await requireIngestSecretOrStaffApi(event)

  const body = await readBody<ActivationRequestBody>(event)
  let licenseId = body.licenseId?.trim()
  const licenseKey = body.licenseKey?.trim()
  const deviceId = body.deviceId?.trim()
  const siteId = body.siteId?.trim()
  const installationId = body.installationId?.trim()
  const activationTypeRaw = body.activationType?.trim().toLowerCase() ?? 'machine'
  const userBinding = body.userBinding?.trim() ?? ''

  if ((!licenseId && !licenseKey) || !deviceId || !siteId || !installationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'licenseId or licenseKey, plus deviceId, siteId, and installationId are required',
    })
  }

  if (!ACTIVATION_TYPES.has(activationTypeRaw)) {
    throw createError({
      statusCode: 400,
      statusMessage: `activationType must be one of: ${[...ACTIVATION_TYPES].join(', ')}`,
    })
  }

  if (activationTypeRaw === 'user' && !userBinding) {
    throw createError({
      statusCode: 400,
      statusMessage: 'userBinding is required when activationType is user',
    })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  if (licenseKey) {
    const [byKey] = await db.select().from(licensesTable).where(eq(licensesTable.licenseKey, licenseKey))
    if (!byKey) {
      throw createError({ statusCode: 404, statusMessage: 'License not found for licenseKey' })
    }
    if (licenseId && licenseId !== byKey.id) {
      throw createError({ statusCode: 400, statusMessage: 'licenseId does not match licenseKey' })
    }
    licenseId = byKey.id
  }

  const [license] = await db.select().from(licensesTable).where(eq(licensesTable.id, licenseId!))

  if (!license) {
    throw createError({
      statusCode: 404,
      statusMessage: 'License not found',
    })
  }

  const existingRows = await db.select().from(activationsTable).where(eq(activationsTable.licenseId, licenseId!))

  const consumptive = existingRows.filter((r) => activationCountsTowardCap(r.status))

  if (consumptive.length >= license.maxActivations) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Activation cap reached for this license',
      data: { licenseId, maxActivations: license.maxActivations, used: consumptive.length },
    })
  }

  const sameBinding = existingRows.find(
    (r) =>
      r.deviceId === deviceId &&
      r.siteId === siteId &&
      r.installationId === installationId &&
      activationCountsTowardCap(r.status),
  )

  const ip = clientIp(event)
  const envMerged: Record<string, string> = { ...(body.environment ?? {}) }
  if (ip && !envMerged.ip) {
    envMerged.ip = ip
  }

  const now = new Date().toISOString()
  const hbEntry = { at: now, ...(ip ? { ip } : {}) }

  if (sameBinding) {
    const heartbeats = appendHeartbeatJson(sameBinding.heartbeatsJson, hbEntry)
    await db
      .update(activationsTable)
      .set({
        lastSeenAt: now,
        heartbeatsJson: heartbeats,
        environmentJson: JSON.stringify({ ...parseEnvironmentForMerge(sameBinding.environmentJson), ...envMerged }),
      })
      .where(eq(activationsTable.id, sameBinding.id))

    return {
      id: sameBinding.id,
      licenseId,
      deviceId,
      siteId,
      installationId,
      activationType: sameBinding.activationType,
      userBinding: sameBinding.userBinding,
      status: sameBinding.status,
      lastSeenAt: now,
      activatedAt: sameBinding.activatedAt || sameBinding.lastSeenAt,
      updated: true,
    }
  }

  const duplicateOnLicense = consumptive.filter((r) => r.deviceId === deviceId).length
  let violationsJson = '[]'
  if (duplicateOnLicense > 0) {
    violationsJson = appendViolationJson(violationsJson, {
      at: now,
      kind: 'duplicate_machine',
      detail: 'Another consumptive activation already uses this device identifier on the same license',
    })
  }

  const id = `act_${randomUUID().slice(0, 8)}`
  const heartbeatsJson = appendHeartbeatJson('[]', hbEntry)

  await db.insert(activationsTable).values({
    id,
    licenseId: licenseId!,
    deviceId,
    siteId,
    installationId,
    status: 'active',
    lastSeenAt: now,
    activationType: activationTypeRaw,
    activatedAt: now,
    environmentJson: JSON.stringify(envMerged),
    heartbeatsJson,
    violationsJson,
    userBinding: activationTypeRaw === 'user' ? userBinding : '',
  })

  return {
    id,
    licenseId,
    deviceId,
    siteId,
    installationId,
    activationType: activationTypeRaw,
    userBinding: activationTypeRaw === 'user' ? userBinding : '',
    status: 'active',
    lastSeenAt: now,
    activatedAt: now,
    updated: false,
  }
})
