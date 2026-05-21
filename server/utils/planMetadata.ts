export type PlanMetadata = {
  billingMappings?: Record<string, string>
  trial?: { days: number; requiresPaymentMethod: boolean }
  gracePeriodDays?: number
  enterpriseOverrideCompatible?: boolean
}

export function parsePlanMetadata(raw: string | null | undefined): PlanMetadata {
  if (!raw || raw.trim() === '') {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as PlanMetadata
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function stringifyPlanMetadata(meta: PlanMetadata): string {
  return JSON.stringify(meta)
}

export function mergePlanMetadata(current: string | undefined, patch: Partial<PlanMetadata>): string {
  const base = parsePlanMetadata(current)
  return stringifyPlanMetadata({ ...base, ...patch })
}
