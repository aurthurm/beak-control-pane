/**
 * Read numeric limit keys from stored entitlement payload_json.
 */
export function getLimitFromEntitlementPayload(payloadJson: string, metricKey: string): number | null {
  const limits = parseEntitlementLimitMap(payloadJson)
  return Object.prototype.hasOwnProperty.call(limits, metricKey) ? limits[metricKey]! : null
}

export function parseEntitlementLimitMap(payloadJson: string): Record<string, number> {
  try {
    const p = JSON.parse(payloadJson) as { limits?: Record<string, number> }
    const out: Record<string, number> = {}
    for (const [key, val] of Object.entries(p.limits ?? {})) {
      if (typeof val === 'number' && Number.isFinite(val)) {
        out[key] = val
      }
    }
    return out
  } catch {
    return {}
  }
}
