import { and, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { licensesTable } from '../../db/schema'
import { getLicenseKeyConfig, requireLicenseKeyConfig } from './keys'
import { signLicensePayload } from './jws'

function bumpIssue(payload: Record<string, unknown>, reason: string, issuedBy: string) {
  const issue = (payload.issue as Record<string, unknown> | undefined) ?? {}
  const rev = Number(issue.revision ?? 0) + 1
  payload.issue = {
    ...issue,
    issuedBy,
    issuedAt: new Date().toISOString(),
    reason,
    revision: rev,
  }
}

/**
 * Re-sign active license rows for a subscriber/product after entitlement changes.
 */
export async function reissueLicensesForTenantProduct(
  db: LibSQLDatabase<any>,
  subscriberId: string,
  productId: string,
  reason: string,
): Promise<number> {
  const cfg = getLicenseKeyConfig()
  if (!cfg) {
    return 0
  }

  const rows = await db
    .select()
    .from(licensesTable)
    .where(and(eq(licensesTable.subscriberId, subscriberId), eq(licensesTable.productId, productId), eq(licensesTable.status, 'active')))

  let n = 0
  for (const row of rows) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(row.payloadJson) as Record<string, unknown>
    } catch {
      payload = {}
    }
    bumpIssue(payload, reason, 'control-plane')
    const payloadJson = JSON.stringify(payload)
    const signature = await signLicensePayload(payload, cfg)
    await db
      .update(licensesTable)
      .set({
        signature,
        payloadJson,
      })
      .where(eq(licensesTable.id, row.id))
    n++
  }
  return n
}

/**
 * Sign payload for a new or updated license row (throws if keys not configured).
 */
export async function signLicenseOrThrow(payload: Record<string, unknown>): Promise<string> {
  const cfg = requireLicenseKeyConfig()
  return signLicensePayload(payload, cfg)
}
