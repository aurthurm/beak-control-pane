import { defineTask } from 'nitropack/runtime'
import { drizzle } from 'drizzle-orm/libsql'
import { bootstrapDatabase, getDatabaseClient } from '../../db/bootstrap'
import { recalculateAllUsageRecords } from '../../utils/usage-recalculate'

export default defineTask({
  meta: {
    name: 'usage:recalculate',
    description: 'Recompute usage_record status vs entitlements (scheduled)',
  },
  async run() {
    const client = getDatabaseClient()
    await bootstrapDatabase(client)
    const db = drizzle(client)
    const result = await recalculateAllUsageRecords(db)
    return { result }
  },
})
