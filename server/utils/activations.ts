export function activationCountsTowardCap(status: string): boolean {
  const s = status.toLowerCase()
  return s !== 'released' && s !== 'invalid' && s !== 'revoked'
}

/** Short human-readable label for which binding this activation represents. */
export function buildActivationBindingLabel(a: {
  activationType: string
  deviceId: string
  siteId: string
  installationId: string
  userBinding: string
}): string {
  const t = (a.activationType || 'machine').toLowerCase()
  const ub = (a.userBinding || '').trim()
  if (t === 'user') {
    return ub || 'user'
  }
  if (t === 'site') {
    return a.siteId || '—'
  }
  if (t === 'installation') {
    return a.installationId || '—'
  }
  if (t === 'server' || t === 'machine') {
    return a.deviceId || '—'
  }
  return [a.deviceId, a.siteId].filter(Boolean).join(' · ') || '—'
}

export function parseEnvironmentJson(raw: string): Record<string, string> {
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      return {}
    }
    const out: Record<string, string> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === undefined || val === null) {
        continue
      }
      out[k] = typeof val === 'string' ? val : JSON.stringify(val)
    }
    return out
  } catch {
    return {}
  }
}

export type HeartbeatEntry = { at: string; ip?: string }

export function parseHeartbeatsJson(raw: string): HeartbeatEntry[] {
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) {
      return []
    }
    return v
      .filter((x): x is HeartbeatEntry => Boolean(x && typeof x === 'object' && 'at' in x && typeof (x as HeartbeatEntry).at === 'string'))
      .slice(-50)
  } catch {
    return []
  }
}

export type ViolationEntry = { at: string; kind: string; detail: string }

export function parseViolationsJson(raw: string): ViolationEntry[] {
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) {
      return []
    }
    return v.filter(
      (x): x is ViolationEntry =>
        Boolean(x && typeof x === 'object' && 'at' in x && 'kind' in x && 'detail' in x),
    ) as ViolationEntry[]
  } catch {
    return []
  }
}

export function appendHeartbeatJson(currentJson: string, entry: HeartbeatEntry, max = 50): string {
  const list = parseHeartbeatsJson(currentJson)
  list.push(entry)
  return JSON.stringify(list.slice(-max))
}

export function appendViolationJson(currentJson: string, entry: ViolationEntry): string {
  const list = parseViolationsJson(currentJson)
  list.push(entry)
  return JSON.stringify(list.slice(-30))
}
