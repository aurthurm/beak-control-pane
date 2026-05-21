import { and, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '../db/schema'

export async function getProductByIdOrSlug(
  db: LibSQLDatabase<any>,
  raw: string,
  organizationId?: string,
): Promise<schema.ProductRow | null> {
  const key = raw.trim()
  if (!key) {
    return null
  }

  const orgScope = organizationId
    ? eq(schema.productsTable.organizationId, organizationId)
    : undefined

  const byId = await db
    .select()
    .from(schema.productsTable)
    .where(orgScope ? and(eq(schema.productsTable.id, key), orgScope) : eq(schema.productsTable.id, key))
  if (byId[0]) {
    return byId[0]
  }

  const bySlug = await db
    .select()
    .from(schema.productsTable)
    .where(orgScope ? and(eq(schema.productsTable.slug, key), orgScope) : eq(schema.productsTable.slug, key))
  return bySlug[0] ?? null
}
