import type { Client } from '@libsql/client'

type MockResult = {
  columns: string[]
  rows: Array<Record<string, unknown>>
}

export function createMockClient(columnsByTable: Record<string, string[]>) {
  const executed: Array<{ sql: string; args: unknown[] }> = []

  const client = {
    async execute(statement: string | { sql: string; args?: unknown[] }) {
      const sql = typeof statement === 'string' ? statement : statement.sql
      const args = typeof statement === 'string' ? [] : statement.args ?? []
      executed.push({ sql, args })

      const pragmaMatch = sql.match(/^PRAGMA table_info\(([^)]+)\)$/)
      if (pragmaMatch) {
        const table = pragmaMatch[1]
        const rows = (columnsByTable[table] ?? []).map((name) => ({ name }))
        return {
          columns: ['name'],
          rows,
        } as MockResult
      }

      return {
        columns: [],
        rows: [],
      } as MockResult
    },
  } as unknown as Client

  return { client, executed }
}
