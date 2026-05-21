import { randomUUID } from 'node:crypto'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { auditLogsTable } from '../db/schema'

export async function insertAuditLog(
  db: LibSQLDatabase<any>,
  row: {
    tenantId: string | null
    actor: string
    action: string
    resourceType: string
    resourceId: string
    details: unknown
  },
) {
  await db.insert(auditLogsTable).values({
    id: `aud_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    tenantId: row.tenantId,
    actor: row.actor,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    detailsJson: JSON.stringify(row.details ?? {}),
    createdAt: new Date().toISOString(),
  })
}
