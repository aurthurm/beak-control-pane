export const portalNav = [
  { label: 'Overview', to: '/portal' },
  { label: 'Subscriptions', to: '/portal/subscriptions' },
  { label: 'Licenses', to: '/portal/licenses' },
  { label: 'Usage', to: '/portal/usage' },
  { label: 'Entitlements', to: '/portal/entitlements' },
] as const

export function portalHref(
  path: string,
  organizationId?: string | null,
  query?: Record<string, string | string[] | undefined>,
) {
  if (!organizationId) {
    return query ? { path, query } : path
  }
  return {
    path,
    query: {
      ...(query ?? {}),
      organizationId,
    },
  }
}

export function formatMoney(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amountCents / 100)
  } catch {
    return `${currency || 'USD'} ${Math.round(amountCents / 100)}`
  }
}

export function formatDate(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    return value || '—'
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d)
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function toneForStatus(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'active' || normalized === 'trialing' || normalized === 'normal' || normalized === 'on') {
    return 'success'
  }
  if (normalized === 'warning' || normalized === 'past_due') {
    return 'warning'
  }
  if (normalized === 'exceeded' || normalized === 'revoked' || normalized === 'expired' || normalized === 'canceled') {
    return 'destructive'
  }
  return 'outline'
}
