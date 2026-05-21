export type UsageUiStatus = 'normal' | 'warning' | 'exceeded'

export function usageMetricLabel(metric: string): string {
  const labels: Record<string, string> = {
    users: 'Active users',
    branches: 'Branches / locations',
    sites: 'Sites / installations',
    storage_gb: 'Storage (GB)',
    api_calls_per_month: 'API calls (period)',
    lab_tests_per_month: 'Lab tests (period)',
    pos_orders_per_month: 'POS orders (period)',
  }

  return labels[metric] ?? metric.replaceAll('_', ' ')
}

export function deriveUsageUiStatus(row: {
  value: number
  limitValue: number
  status: string
  warningThresholdPercent: number
}): UsageUiStatus {
  const s = row.status.toLowerCase()

  if (s === 'exceeded' || s === 'critical' || s === 'over_limit') {
    return 'exceeded'
  }

  if (row.limitValue > 0 && row.value >= row.limitValue) {
    return 'exceeded'
  }

  if (s === 'warning') {
    return 'warning'
  }

  if (row.limitValue > 0) {
    const ratio = row.value / row.limitValue
    if (ratio >= row.warningThresholdPercent / 100) {
      return 'warning'
    }
  }

  return 'normal'
}

export function latestUsagePeriodKey(
  records: ReadonlyArray<{ periodKey: string | null | undefined }>,
): string {
  const keys = records.map((r) => (r.periodKey ?? '').trim()).filter(Boolean)
  if (!keys.length) {
    return ''
  }

  return keys.reduce((a, b) => (a > b ? a : b))
}
