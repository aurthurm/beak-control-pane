import { eq, inArray, isNull, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { runtimeFeatureFlagsTable, tenantsTable } from '../../db/schema'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { requireIngestSecretOrStaffApi } from '../../utils/ingest-auth'
import { bumpMetric } from '../../utils/metrics-store'
import { evaluateRuntimeFlagRow } from '../../utils/runtime-flags'

type Body = {
  tenantId?: string
  productId?: string | null
  environment?: string | null
  /** If omitted, all active flags (optionally filtered by productId) are evaluated */
  flagKeys?: string[]
}

export default defineEventHandler(async (event) => {
  await requireIngestSecretOrStaffApi(event)
  bumpMetric('runtime_flags_evaluate_total')

  const body = await readBody<Body>(event)
  const tenantId = body.tenantId?.trim()
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'tenantId is required' })
  }

  const productId = body.productId?.trim() || null
  const environment = body.environment?.trim() || null
  const keysFilter = Array.isArray(body.flagKeys) ? body.flagKeys.map((k) => k.trim()).filter(Boolean) : null

  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const [tenantRow] = await db
    .select({ enterpriseSegment: tenantsTable.enterpriseSegment })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
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
    evaluateRuntimeFlagRow(row, { tenantId, environment, enterpriseSegment }),
  )

  const map: Record<string, { value: string; enabled: boolean; reason: string }> = {}
  for (const f of flags) {
    map[f.key] = { value: f.value, enabled: f.enabled, reason: f.reason }
  }

  return {
    tenantId,
    productId,
    environment: environment ?? null,
    flags: map,
    evaluatedAt: new Date().toISOString(),
  }
})
