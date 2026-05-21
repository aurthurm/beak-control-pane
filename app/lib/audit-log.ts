export type AuditSource = 'ui' | 'api' | 'webhook' | 'job'

export type AuditChangedField = { path: string; before: unknown; after: unknown }

export type AuditRequestMeta = {
  method?: string
  path?: string
  requestId?: string
  ip?: string
  userAgent?: string
  [key: string]: unknown
}

/** Structured payload inside `details_json`; extra keys preserved for raw view */
export type AuditDetailsPayload = {
  summary?: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  changedFields?: AuditChangedField[]
  request?: AuditRequestMeta
  [key: string]: unknown
}

export function parseAuditDetailsJson(raw: string): { payload: AuditDetailsPayload; parseError?: string } {
  try {
    const payload = JSON.parse(raw) as AuditDetailsPayload
    return { payload: payload && typeof payload === 'object' ? payload : {} }
  } catch {
    return { payload: {}, parseError: 'Invalid JSON in details payload' }
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Uses `changedFields` from payload when present; accepts `path` or `field` keys per row. */
export function normalizedChangedFieldsFromPayload(payload: AuditDetailsPayload): AuditChangedField[] {
  const raw = payload.changedFields
  if (!Array.isArray(raw) || raw.length === 0) return []
  const out: AuditChangedField[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const path =
      (typeof o.path === 'string' && o.path) || (typeof o.field === 'string' && o.field) || ''
    if (!path) continue
    out.push({ path, before: o.before, after: o.after })
  }
  return out
}

export function computeChangedFields(
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): AuditChangedField[] {
  if (!isPlainObject(before) || !isPlainObject(after)) return []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const out: AuditChangedField[] = []
  for (const path of keys) {
    const b = before[path]
    const a = after[path]
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      out.push({ path, before: b, after: a })
    }
  }
  return out.sort((x, y) => x.path.localeCompare(y.path))
}

export function auditDisplaySummary(
  action: string,
  resourceType: string,
  resourceId: string,
  resourceName: string,
  payload: AuditDetailsPayload,
): string {
  if (typeof payload.summary === 'string' && payload.summary.trim()) {
    return payload.summary.trim()
  }
  const label = resourceName.trim() || resourceId
  return `${action} · ${resourceType} · ${label}`
}

export function formatAuditSource(source: string): string {
  const s = source.toLowerCase()
  if (s === 'ui') return 'UI'
  if (s === 'api') return 'API'
  if (s === 'webhook') return 'Webhook'
  if (s === 'job') return 'Job'
  return source
}
