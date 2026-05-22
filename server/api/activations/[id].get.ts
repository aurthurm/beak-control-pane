import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { activationsTable, licensesTable, productsTable, subscribersTable } from '../../db/schema'
import {
  activationCountsTowardCap,
  buildActivationBindingLabel,
  parseEnvironmentJson,
  parseHeartbeatsJson,
  parseViolationsJson,
} from '../../utils/activations'
import { requireStaffApiWhenEnforced } from '../../utils/auth-guards'

const STALE_MS = 14 * 24 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  await requireStaffApiWhenEnforced(event)

  const id = event.context.params?.id?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Activation id required' })
  }

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [row] = await db.select().from(activationsTable).where(eq(activationsTable.id, id))
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Activation not found' })
  }

  const [license] = await db.select().from(licensesTable).where(eq(licensesTable.id, row.licenseId))
  const [subscriber] = license
    ? await db.select().from(subscribersTable).where(eq(subscribersTable.id, license.subscriberId))
    : [undefined]
  const [product] = license
    ? await db.select().from(productsTable).where(eq(productsTable.id, license.productId))
    : [undefined]

  const allForLicense = license
    ? await db.select().from(activationsTable).where(eq(activationsTable.licenseId, license.id))
    : []

  const consumptive = allForLicense.filter((r) => activationCountsTowardCap(r.status))
  const activeSeatsForLicense = consumptive.length
  const maxActivations = license?.maxActivations ?? 0

  const deviceDupes = consumptive.filter((r) => r.deviceId === row.deviceId).length
  const duplicateMachine = deviceDupes > 1

  const sites = new Set(consumptive.map((r) => r.siteId))
  const multiEnvironment = sites.size >= 3

  const lastSeenMs = new Date(row.lastSeenAt).getTime()
  const stale = Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs > STALE_MS
  const inactiveConsumingSeat =
    stale && (row.status.toLowerCase() === 'active' || row.status.toLowerCase() === 'exceeded')

  const licenseAtCap = activeSeatsForLicense >= maxActivations && maxActivations > 0
  const licenseOverCap = activeSeatsForLicense > maxActivations && maxActivations > 0

  const highUtilization =
    maxActivations > 0 &&
    activeSeatsForLicense >= Math.ceil(maxActivations * 0.8) &&
    activeSeatsForLicense < maxActivations

  const suspicious = stale || duplicateMachine || licenseOverCap || row.status.toLowerCase() === 'exceeded'

  const environment = parseEnvironmentJson(row.environmentJson)
  const heartbeats = parseHeartbeatsJson(row.heartbeatsJson)
  const violations = parseViolationsJson(row.violationsJson)

  const siblings = allForLicense
    .filter((r) => r.id !== row.id)
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, 25)
    .map((r) => ({
      id: r.id,
      status: r.status,
      activationType: r.activationType,
      deviceId: r.deviceId,
      siteId: r.siteId,
      bindingLabel: buildActivationBindingLabel(r),
      lastSeenAt: r.lastSeenAt,
    }))

  return {
    activation: {
      id: row.id,
      licenseId: row.licenseId,
      deviceId: row.deviceId,
      siteId: row.siteId,
      installationId: row.installationId,
      activationType: row.activationType,
      userBinding: row.userBinding,
      status: row.status,
      activatedAt: row.activatedAt || row.lastSeenAt,
      lastSeenAt: row.lastSeenAt,
      environment,
      heartbeats,
      violations,
    },
    license: license
      ? {
          id: license.id,
          licenseKey: license.licenseKey,
          maxActivations: license.maxActivations,
          status: license.status,
          mode: license.mode,
        }
      : null,
    subscriber: subscriber ? { id: subscriber.id, name: subscriber.name } : null,
    product: product ? { id: product.id, name: product.name } : null,
    indicators: {
      stale,
      duplicateMachine,
      licenseAtCap,
      licenseOverCap,
      multiEnvironment,
      inactiveConsumingSeat,
      suspicious,
      highUtilization,
    },
    licenseActivationsSummary: {
      activeSeatsForLicense,
      maxActivations,
    },
    siblings,
  }
})
