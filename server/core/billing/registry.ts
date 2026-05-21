import type { BillingProvider } from './provider'
import { manualBillingProvider } from './providers/manual'
import { stripeBillingProvider } from './providers/stripe'

export function getBillingProvider(name: string | undefined | null): BillingProvider {
  const n = (name ?? 'manual').trim().toLowerCase()
  if (n === 'stripe') {
    return stripeBillingProvider
  }
  return manualBillingProvider
}
