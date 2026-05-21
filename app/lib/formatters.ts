export type StatusVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'

export function usageStatusVariant(status: 'normal' | 'warning' | 'exceeded'): StatusVariant {
  if (status === 'exceeded') {
    return 'destructive'
  }

  if (status === 'warning') {
    return 'warning'
  }

  return 'success'
}

export function statusVariant(status: string): StatusVariant {
  const normalized = status.toLowerCase()

  if (normalized.includes('released')) {
    return 'outline'
  }

  if (normalized.includes('invalid')) {
    return 'destructive'
  }

  if (normalized.includes('exceeded')) {
    return 'warning'
  }

  if (normalized.includes('active') || normalized.includes('ready') || normalized.includes('healthy') || normalized.includes('done')) {
    return 'success'
  }

  if (
    normalized.includes('warning') ||
    normalized.includes('grace') ||
    normalized.includes('pending') ||
    normalized.includes('trial') ||
    normalized.includes('past_due') ||
    normalized.includes('past due')
  ) {
    return 'warning'
  }

  if (
    normalized.includes('paused') ||
    normalized.includes('expired') ||
    normalized.includes('disabled') ||
    normalized.includes('churned') ||
    normalized.includes('suspended') ||
    normalized.includes('revoked') ||
    normalized.includes('ended') ||
    normalized.includes('canceled') ||
    normalized.includes('cancelled') ||
    normalized.includes('unpaid')
  ) {
    return 'destructive'
  }

  if (normalized.includes('archived')) {
    return 'outline'
  }

  if (normalized.includes('superseded')) {
    return 'outline'
  }

  if (normalized.includes('draft')) {
    return 'secondary'
  }

  return 'secondary'
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value))
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function formatRelative(value: string) {
  const delta = Date.now() - new Date(value).getTime()
  const minutes = Math.max(1, Math.round(delta / 60000))

  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)

  if (hours < 24) {
    return `${hours}h ago`
  }

  return `${Math.round(hours / 24)}d ago`
}

export function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value / 100)
}
