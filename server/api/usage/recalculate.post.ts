import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { requireIngestCronOrStaffApi } from '../../utils/ingest-auth'
import { bumpMetric } from '../../utils/metrics-store'
import { recalculateAllUsageRecords } from '../../utils/usage-recalculate'

export default defineEventHandler(async (event) => {
  await requireIngestCronOrStaffApi(event)
  bumpMetric('usage_recalculate_total')
  const client = getDatabaseClient()
  await bootstrapDatabase(client)
  const db = drizzle(client)

  const result = await recalculateAllUsageRecords(db)

  return {
    ok: true,
    recalculatedAt: new Date().toISOString(),
    ...result,
  }
})
