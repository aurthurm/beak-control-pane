import { eq, inArray, isNull, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { runtimeFeatureFlagsTable, subscribersTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { requireIngestSecretOrStaffApi } from '../../utils/ingest-auth'
import { bumpMetric } from '../../utils/metrics-store'
import { evaluateRuntimeFlagRow } from '../../utils/runtime-flags'

type Body = {
  subscriberId?: string
  productId?: string | null
  environment?: string | null
  /** If omitted, all active flags (optionally filtered by productId) are evaluated */
  flagKeys?: string[]
}

export default defineEventHandler(async (event) => {
  await requireIngestSecretOrStaffApi(event)
  bumpMetric('runtime_flags_evaluate_total')

  const body = await readBody<Body>(event)
  const subscriberId = body.subscriberId?.trim()
  if (!subscriberId) {
    throw createError({ statusCode: 400, statusMessage: 'subscriberId is required' })
  }

  const productId = body.productId?.trim() || null
  const environment = body.environment?.trim() || null
  const keysFilter = Array.isArray(body.flagKeys) ? body.flagKeys.map((k) => k.trim()).filter(Boolean) : null

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [tenantRow] = await db
    .select({ enterpriseSegment: subscribersTable.enterpriseSegment })
    .from(subscribersTable)
    .where(eq(subscribersTable.id, subscriberId))
    .limit(1)
  const enterpriseSegment = tenantRow?.enterpriseSegment ?? ''

  const rows =
    keysFilter && keysFilter.length
      ? await db.select().from(runtimeFeatureFlagsTable).where(inArray(runtimeFeatureFlagsTable.flagKey, keysFilter))
      : productId
        ? await db
            .select()
            .from(runtimeFeatureFlagsTable)
            .where(
              or(isNull(runtimeFeatureFlagsTable.productId), eq(runtimeFeatureFlagsTable.productId, productId)),
            )
        : await db.select().from(runtimeFeatureFlagsTable)

  const active = rows.filter((r) => r.status === 'active' && !r.archivedAt?.trim())

  const flags = active.map((row) =>
    evaluateRuntimeFlagRow(row, { subscriberId, environment, enterpriseSegment }),
  )

  const map: Record<string, { value: string; enabled: boolean; reason: string }> = {}
  for (const f of flags) {
    map[f.key] = { value: f.value, enabled: f.enabled, reason: f.reason }
  }

  return {
    subscriberId,
    productId,
    environment: environment ?? null,
    flags: map,
    evaluatedAt: new Date().toISOString(),
  }
})
